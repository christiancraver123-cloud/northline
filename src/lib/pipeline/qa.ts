// QA stages. HONESTY RULE: a visual check is reported as done ONLY if a capable inspector actually received the image.
// Without one, the result is MANUAL_REVIEW_REQUIRED (a human must look) — never a fabricated PASS.
import { z } from "zod";
import type { Repo } from "@/lib/db/repo";
import type { Asset, GenerationAttempt, Production, QaFindingRecord, QaResult, QaRetryInfo, ReferenceAsset } from "@/lib/db/records";
import type { QaSeverity, QaStatus } from "@/lib/domain/types";
import type { CanonicalIdentity } from "@/lib/identity/canonical";
import { inspectImage } from "@/lib/media/inspect";
import type { Deps } from "./deps";
import { traceOf } from "./deps";
import { evaluateContent } from "./content";
import { defaultRetryPolicy, visionWithRetry, type RetryRunState } from "./qa-retry";

export interface VisionRequest { kind: "IDENTITY" | "TECHNICAL" | "CONTINUITY"; system: string; prompt: string; images: { mime: string; dataBase64: string }[]; /** 1 = first try; > 1 = a deliberate retry after backoff. */ retryAttempt?: number }
export interface VisionOutcome { text: string | null; provider: string | null; model: string | null; error: string | null; /** True for 429/503/unavailable-class failures that are worth retrying. */ transient?: boolean; retryAfterMs?: number | null }
export type VisionInspector = (req: VisionRequest) => Promise<VisionOutcome>;

const Verdict = z.enum(["PASS", "REVIEW", "HARD_FAIL", "UNCLEAR"]);
const IdentityOut = z.object({ locks: z.array(z.object({ id: z.string(), verdict: Verdict, note: z.string().optional() })) });
const TechOut = z.object({ checks: z.array(z.object({ id: z.string(), verdict: Verdict, note: z.string().optional() })) });

export const TECHNICAL_CHECKS = ["anatomy", "hands", "objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"] as const;

const parseJson = (t: string) => { try { return JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return null; } };
const worstOf = (s: QaStatus[]): QaStatus => (["HARD_FAIL", "MANUAL_REVIEW_REQUIRED", "REVIEW", "QA_PENDING", "PASS"] as QaStatus[]).find((x) => s.includes(x)) ?? "PASS";

/** QA results that still count: a superseded result stays in history but no longer affects the aggregate. */
export const activeQa = <T extends { supersededBy?: string | null }>(rs: T[]): T[] => rs.filter((r) => !r.supersededBy);
/** Aggregate QA results into one status over ACTIVE results. HARD_FAIL > MANUAL_REVIEW_REQUIRED > REVIEW > PASS. */
export const aggregateQa = (rs: Pick<QaResult, "status" | "supersededBy">[]): QaStatus => { const a = activeQa(rs); return a.length ? worstOf(a.map((r) => r.status)) : "QA_PENDING"; };

async function assetBytes(deps: Deps, a: Asset) { return a.storagePath ? deps.storage.read(a.storagePath) : null; }
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

/** Evaluation layer: results only supersede results of the same asset + QA type + layer. */
export const layerOf = (method: QaResult["method"]) => (method === "prompt_rules" ? "prompt" : method === "file_inspection" ? "file" : method === "data_rules" ? "data" : "visual");
/** A result is CONCLUSIVE when something actually evaluated it. `manual` = nothing could (inspector unavailable): inconclusive. */
export const isConclusive = (r: Pick<QaResult, "method">) => r.method !== "manual";

type SaveInput = Omit<QaResult, "id" | "createdAt" | "updatedAt" | "origin" | "productionId" | "attemptId" | "assetId" | "decidedBy" | "qaAttempt" | "supersededBy" | "retry"> & { retry?: QaRetryInfo | null };
/**
 * Persist one QA evaluation and maintain supersession. NOTHING is ever deleted.
 *  - a newer evaluation supersedes older ones of the same asset + type + layer (the aggregate then ignores the old ones);
 *  - EXCEPT an inconclusive (manual/unavailable) retry never replaces an earlier conclusive result — it is kept as history only.
 */
export async function saveQa(repo: Repo, p: Production, attempt: GenerationAttempt, assetId: string | null, r: SaveInput): Promise<QaResult> {
  const { retry, ...rest } = r;
  const prior = (await repo.list("qaResults", { productionId: p.id })).filter((x) => x.assetId === assetId && x.kind === r.kind && layerOf(x.method) === layerOf(r.method) && (assetId !== null || x.attemptId === attempt.id));
  const row = await repo.insert("qaResults", { productionId: p.id, attemptId: attempt.id, assetId, decidedBy: null, origin: p.origin, ...rest, qaAttempt: prior.length + 1, supersededBy: null, retry: retry ?? null });
  const active = activeQa(prior);
  const keep = !isConclusive(r) ? active.find(isConclusive) : undefined;
  if (keep) return repo.update("qaResults", row.id, { supersededBy: keep.id });
  for (const x of active) await repo.update("qaResults", x.id, { supersededBy: row.id });
  return row;
}
const save = saveQa;

const retryNote = (retry: QaRetryInfo | null, base: string) => (retry?.exhausted ? `${base} (${retry.note}: ${retry.errors[retry.errors.length - 1] ?? "unavailable"})` : base);

/** Identity QA. (1) prompt conformance per shot [real, deterministic]; (2) visual inspection per asset [only if an inspector ran]. */
export interface QaRunOpts { /** Re-runs of a visual check skip the deterministic prompt-conformance row (it did not change). */ promptRules?: boolean }
export async function runIdentityQa(repo: Repo, deps: Deps, p: Production, attempt: GenerationAttempt, assets: Asset[], identity: CanonicalIdentity, refs: ReferenceAsset[], opts: QaRunOpts = {}): Promise<QaResult[]> {
  const tr = traceOf(deps);
  const out: QaResult[] = [];
  const policy = { ...defaultRetryPolicy(), ...(deps.qaRetry ?? {}) };
  const runState: RetryRunState = { providerDown: false };
  const prompts = (await repo.list("prompts", { productionId: p.id })).filter((x) => x.attemptId === attempt.id);
  const promptFindings: QaFindingRecord[] = prompts.flatMap((x) => x.qa.issues.map((m) => ({ lockId: null, severity: "REVIEW" as const, message: `Shot ${x.shotN}: ${m}` })));
  // The deterministic prompt-conformance row is saved on the first run, and on a re-run only if the attempt never got one.
  const wantPromptRow = opts.promptRules !== false || !(await repo.list("qaResults", { productionId: p.id })).some((x) => x.attemptId === attempt.id && x.kind === "IDENTITY" && x.method === "prompt_rules");
  if (wantPromptRow) out.push(await save(repo, p, attempt, null, { kind: "IDENTITY", method: "prompt_rules", status: promptFindings.length ? "REVIEW" : "PASS", inspectedImage: false, provider: null, model: null, findings: promptFindings,
    summary: promptFindings.length ? "Prompt states identity with gaps (no image inspected)." : "Prompt states every canonical hard lock and signature trait. This checks the PROMPT, not the image.", recommendation: null }));
  if (wantPromptRow) await tr("IDENTITY_QA", promptFindings.length ? "QA_REVIEW" : "QA_PASSED", `Identity prompt-conformance for ${p.code} attempt ${attempt.attemptNo}: ${promptFindings.length ? `${promptFindings.length} gap(s)` : "all locks stated"} (image not inspected)`);

  for (const a of assets) {
    const file = await assetBytes(deps, a);
    if (!file || !deps.vision) {
      const why = !file ? "this asset has no image file (mock/demo provider)" : "no vision-capable inspector is configured for Identity QA";
      out.push(await save(repo, p, attempt, a.id, { kind: "IDENTITY", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: null, model: null, findings: [],
        summary: `Identity NOT visually verified: ${why}. A human must check the hard locks: ${identity.hardLocks.map((l) => l.label).join(", ")}.`, recommendation: "Review the image against the canonical references before approving." }));
      await tr("IDENTITY_QA", "MANUAL_REVIEW_REQUIRED", `Identity QA could not inspect ${a.filename}: ${why}`, { level: "warn" });
      continue;
    }
    const refImgs: { mime: string; dataBase64: string }[] = [];
    for (const r of refs.filter((x) => a.referenceIds.includes(x.id)).slice(0, 3)) { const f = await deps.storage.read(r.storagePath); if (f) refImgs.push({ mime: f.mime, dataBase64: b64(f.bytes) }); }
    const locks = [...identity.hardLocks, ...identity.softLocks];
    const { outcome: res, retry } = await visionWithRetry(deps.vision, {
      kind: "IDENTITY", images: [{ mime: file.mime, dataBase64: b64(file.bytes) }, ...refImgs],
      system: "You are a strict identity QA inspector for a virtual-creator studio. Judge ONLY what is visible. If you cannot verify a lock, answer UNCLEAR. Reply with JSON only.",
      prompt: `Image 1 is the generated asset for ${identity.name}. ${refImgs.length ? `Images 2-${refImgs.length + 1} are canonical reference images (authoritative).` : "No reference images were supplied."}\nVerify each identity lock:\n${locks.map((l) => `- ${l.id} (${l.severity}): ${l.visualCheck}`).join("\n")}\nReturn {"locks":[{"id":"<lock id>","verdict":"PASS|REVIEW|HARD_FAIL|UNCLEAR","note":"<short>"}]} with one entry per lock.`,
    }, policy, runState);
    const parsed = res.text ? IdentityOut.safeParse(parseJson(res.text)) : null;
    if (!res.text || !parsed?.success) {
      out.push(await save(repo, p, attempt, a.id, { kind: "IDENTITY", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: res.provider, model: res.model, findings: [], retry,
        summary: retryNote(retry, `Identity NOT visually verified: ${res.text ? "the inspector returned unusable output" : res.error ?? "no inspector available"}.`), recommendation: res.transient ? "Inspector was temporarily unavailable: re-run Identity QA (no regeneration needed), or review manually." : "Review the image manually." }));
      await tr("IDENTITY_QA", "MANUAL_REVIEW_REQUIRED", `Identity QA inspector unavailable/unusable for ${a.filename}`, { level: "warn" });
      continue;
    }
    const byId = new Map(parsed.data.locks.map((l) => [l.id, l]));
    const findings: QaFindingRecord[] = [];
    for (const l of locks) {
      const v = byId.get(l.id);
      if (!v) findings.push({ lockId: l.id, severity: "REVIEW", message: `${l.label}: not reported by inspector` });
      else if (v.verdict === "UNCLEAR") findings.push({ lockId: l.id, severity: "REVIEW", message: `${l.label}: could not be verified${v.note ? ` — ${v.note}` : ""}` });
      else if (v.verdict !== "PASS") findings.push({ lockId: l.id, severity: l.severity === "HARD_FAIL" && v.verdict === "HARD_FAIL" ? "HARD_FAIL" : "REVIEW", message: `${l.label}: ${v.note ?? v.verdict}` });
    }
    const status: QaStatus = findings.some((f) => f.severity === "HARD_FAIL") ? "HARD_FAIL" : findings.length ? "REVIEW" : "PASS";
    out.push(await save(repo, p, attempt, a.id, { kind: "IDENTITY", method: "vision_model", status, inspectedImage: true, provider: res.provider, model: res.model, findings, retry, summary: status === "PASS" ? `Inspector verified all ${locks.length} identity locks.` : findings.map((f) => f.message).join("; "), recommendation: status === "HARD_FAIL" ? "Regenerate with the identity corrections." : null }));
    await tr("IDENTITY_QA", status === "PASS" ? "QA_PASSED" : status === "HARD_FAIL" ? "QA_REJECTED" : "QA_REVIEW", `Identity QA (${res.provider}/${res.model}) ${status} for ${a.filename}${findings.length ? `: ${findings.map((f) => f.message).join("; ")}` : ""}`, { level: status === "PASS" ? "info" : "warn" });
  }
  return out;
}

/** Technical QA. (1) file inspection [real]; (2) visual artifact checks per asset [only if an inspector ran]. */
export async function runTechnicalQa(repo: Repo, deps: Deps, p: Production, attempt: GenerationAttempt, assets: Asset[], opts: QaRunOpts = {}): Promise<QaResult[]> {
  const tr = traceOf(deps);
  const out: QaResult[] = [];
  const policy = { ...defaultRetryPolicy(), ...(deps.qaRetry ?? {}) };
  const runState: RetryRunState = { providerDown: false };
  void opts;
  for (const a of assets) {
    const file = await assetBytes(deps, a);
    if (!file) {
      out.push(await save(repo, p, attempt, a.id, { kind: "TECHNICAL", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: null, model: null, findings: [], summary: "No image file to inspect (mock/demo asset). Anatomy, hands, objects, geometry, reflections, text/logos, artifacts, camera and lighting were NOT checked.", recommendation: "Review manually." }));
      continue;
    }
    const info = inspectImage(file.bytes);
    const f: QaFindingRecord[] = info.problems.map((m) => ({ lockId: null, severity: "HARD_FAIL" as const, message: `File: ${m}` }));
    if (info.ok) {
      if (Math.min(info.width!, info.height!) < 512) f.push({ lockId: null, severity: "REVIEW", message: `Low resolution ${info.width}×${info.height}` });
      const ratio = info.width! / info.height!;
      if (![2 / 3, 4 / 5, 9 / 16, 1].some((r) => Math.abs(ratio - r) < 0.04)) f.push({ lockId: null, severity: "REVIEW", message: `Unusual aspect ratio ${info.width}×${info.height}` });
    }
    const fs: QaStatus = f.some((x) => x.severity === "HARD_FAIL") ? "HARD_FAIL" : f.length ? "REVIEW" : "PASS";
    out.push(await save(repo, p, attempt, a.id, { kind: "TECHNICAL", method: "file_inspection", status: fs, inspectedImage: false, provider: null, model: null, findings: f,
      summary: info.ok ? `File OK: ${info.mime}, ${info.width}×${info.height}, ${info.bytes} bytes (structure only — content not judged).` : `File problems: ${info.problems.join("; ")}`, recommendation: fs === "HARD_FAIL" ? "Regenerate." : null }));
    if (!deps.vision) {
      out.push(await save(repo, p, attempt, a.id, { kind: "TECHNICAL", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: null, model: null, findings: [], summary: `Visual technical checks NOT performed (no vision-capable inspector): ${TECHNICAL_CHECKS.join(", ")}.`, recommendation: "Review manually for anatomy, hands, objects, reflections, text/logos and artifacts." }));
      await tr("CONTENT_QA", "MANUAL_REVIEW_REQUIRED", `Technical QA could not visually inspect ${a.filename}`, { level: "warn" });
      continue;
    }
    const { outcome: res, retry } = await visionWithRetry(deps.vision, { kind: "TECHNICAL", images: [{ mime: file.mime, dataBase64: b64(file.bytes) }],
      system: "You are a technical image QA inspector. Judge ONLY what is visible. If unsure answer UNCLEAR. Reply with JSON only.",
      prompt: `Inspect this generated image. For each check return a verdict.\nChecks: ${TECHNICAL_CHECKS.join(", ")}.\nHARD_FAIL is reserved for severe anatomy failure (e.g. wrong number of limbs/fingers, merged body parts); other problems are REVIEW.\nReturn {"checks":[{"id":"<check>","verdict":"PASS|REVIEW|HARD_FAIL|UNCLEAR","note":"<short>"}]}.` }, policy, runState);
    const parsed = res.text ? TechOut.safeParse(parseJson(res.text)) : null;
    if (!res.text || !parsed?.success) {
      out.push(await save(repo, p, attempt, a.id, { kind: "TECHNICAL", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: res.provider, model: res.model, findings: [], retry, summary: retryNote(retry, `Visual technical checks NOT performed: ${res.text ? "inspector returned unusable output" : res.error ?? "no inspector"}.`), recommendation: res.transient ? "Inspector was temporarily unavailable: re-run Technical QA (no regeneration needed), or review manually." : "Review manually." }));
      continue;
    }
    const tf: QaFindingRecord[] = [];
    for (const c of TECHNICAL_CHECKS) {
      const v = parsed.data.checks.find((x) => x.id === c);
      if (!v) tf.push({ lockId: null, severity: "REVIEW", message: `${c}: not reported` });
      else if (v.verdict === "UNCLEAR") tf.push({ lockId: null, severity: "REVIEW", message: `${c}: could not be verified` });
      else if (v.verdict !== "PASS") tf.push({ lockId: null, severity: (c === "anatomy" || c === "hands") && v.verdict === "HARD_FAIL" ? "HARD_FAIL" : "REVIEW", message: `${c}: ${v.note ?? v.verdict}` });
    }
    const vs: QaStatus = tf.some((x) => x.severity === "HARD_FAIL") ? "HARD_FAIL" : tf.length ? "REVIEW" : "PASS";
    out.push(await save(repo, p, attempt, a.id, { kind: "TECHNICAL", method: "vision_model", status: vs, inspectedImage: true, provider: res.provider, model: res.model, findings: tf, retry, summary: vs === "PASS" ? "Inspector found no technical problems." : tf.map((x) => x.message).join("; "), recommendation: vs === "HARD_FAIL" ? "Regenerate." : null }));
    await tr("CONTENT_QA", vs === "PASS" ? "QA_PASSED" : "QA_REVIEW", `Technical QA (${res.provider}/${res.model}) ${vs} for ${a.filename}`, { level: vs === "PASS" ? "info" : "warn" });
  }
  return out;
}

/** Content QA from structured production data (recent productions/locations/formats/themes). */
export async function runContentQa(repo: Repo, deps: Deps, p: Production, attempt: GenerationAttempt): Promise<QaResult> {
  const o = await evaluateContent(repo, p);
  await traceOf(deps)("CONTENT_QA", o.status === "PASS" ? "QA_PASSED" : "QA_REVIEW", `Content QA ${o.status} for ${p.code}: ${o.summary}`, { level: o.status === "PASS" ? "info" : "warn" });
  return save(repo, p, attempt, null, { kind: "CONTENT", method: "data_rules", status: o.status, inspectedImage: false, provider: null, model: null, findings: o.findings, summary: o.summary, recommendation: o.recommendation });
}

export type { QaSeverity };
