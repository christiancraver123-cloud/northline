// CONTINUITY QA: judges a multi-frame production AS A SEQUENCE (not five unrelated images).
//  (1) prompt_rules  — deterministic: did every frame prompt inherit the shared continuity spec? [real, no image looked at]
//  (2) vision_model  — all frames are sent together, in order, with the spec; verdict per continuity dimension. Honest MANUAL_REVIEW_REQUIRED if no inspector ran.
import { z } from "zod";
import type { Repo } from "@/lib/db/repo";
import type { Asset, ContinuitySpec, GenerationAttempt, Production, QaFindingRecord, QaResult } from "@/lib/db/records";
import type { QaStatus } from "@/lib/domain/types";
import { decodePng, downscaleRaster, encodePng, PngError } from "@/lib/media/png";
import type { Deps } from "./deps";
import { traceOf } from "./deps";
import { defaultRetryPolicy, visionWithRetry } from "./qa-retry";
import { saveQa } from "./qa";

export const CONTINUITY_CHECKS = ["same_person", "outfit", "jewelry", "hair", "time_of_day", "lighting_progression", "location_progression", "recurring_props", "unwanted_text_signage", "story_coherence"] as const;
/** Checks where a clear violation is severe enough to require regeneration (everything else is REVIEW). */
const HARD_CHECKS = new Set<string>(["same_person", "outfit", "time_of_day", "unwanted_text_signage"]);
const Verdict = z.enum(["PASS", "REVIEW", "HARD_FAIL", "UNCLEAR"]);
const Out = z.object({ checks: z.array(z.object({ id: z.string(), verdict: Verdict, note: z.string().optional(), frames: z.array(z.number()).optional() })) });
const parseJson = (t: string) => { try { return JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return null; } };
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

/** QA preview copy: downscaled so a whole carousel fits one vision request. Delivery/RAW files are never touched. */
export function qaPreview(bytes: Uint8Array, maxWidth = 640): { mime: string; bytes: Uint8Array } {
  try { return { mime: "image/png", bytes: encodePng(downscaleRaster(decodePng(bytes), maxWidth)) }; } catch (e) { if (e instanceof PngError) return { mime: "image/png", bytes }; throw e; }
}

export const isSequence = (assets: Asset[]) => assets.filter((a) => a.kind !== "REEL").length >= 2;

export async function runContinuityQa(repo: Repo, deps: Deps, p: Production, attempt: GenerationAttempt, assets: Asset[], spec: ContinuitySpec | undefined): Promise<QaResult[]> {
  const tr = traceOf(deps);
  const out: QaResult[] = [];
  const frames = assets.filter((a) => a.kind !== "REEL").sort((a, b) => a.seq - b.seq);
  if (frames.length < 2) return out; // not a sequence: continuity QA does not apply

  // (1) deterministic prompt-inheritance check
  const prompts = (await repo.list("prompts", { productionId: p.id })).filter((x) => x.attemptId === attempt.id);
  const pf: QaFindingRecord[] = [];
  if (!spec) pf.push({ lockId: null, severity: "REVIEW", message: "No shared continuity specification was persisted for this production." });
  else for (const pr of prompts) {
    const missing = [["outfit", spec.outfit], ["hair", spec.hair], ["jewelry", spec.jewelry], ["time window", spec.timeWindow]].filter(([, v]) => v && !pr.positive.includes(v));
    if (missing.length) pf.push({ lockId: null, severity: "REVIEW", message: `Shot ${pr.shotN} prompt does not carry the shared ${missing.map(([k]) => k).join(", ")}.` });
  }
  out.push(await saveQa(repo, p, attempt, null, { kind: "CONTINUITY", method: "prompt_rules", status: pf.length ? "REVIEW" : "PASS", inspectedImage: false, provider: null, model: null, findings: pf,
    summary: pf.length ? pf.map((f) => f.message).join(" ") : "Every frame prompt inherits the shared continuity specification (outfit, hair, jewelry, time window). This checks the PROMPTS, not the images.", recommendation: null }));

  // (2) visual sequence check
  const files = [];
  for (const a of frames) { const f = a.storagePath ? await deps.storage.read(a.storagePath) : null; if (f) files.push({ a, f }); }
  const why = !deps.vision ? "no vision-capable inspector is configured for Continuity QA" : files.length !== frames.length ? "one or more frames have no image file" : null;
  if (why || !deps.vision) {
    out.push(await saveQa(repo, p, attempt, null, { kind: "CONTINUITY", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: null, model: null, findings: [],
      summary: `Sequence continuity NOT visually verified: ${why}. A human must compare the frames for ${CONTINUITY_CHECKS.join(", ")}.`, recommendation: "Review the frames side by side before approving." }));
    await tr("IDENTITY_QA", "MANUAL_REVIEW_REQUIRED", `Continuity QA could not inspect ${p.code}: ${why}`, { level: "warn" });
    return out;
  }
  const policy = { ...defaultRetryPolicy(), ...(deps.qaRetry ?? {}) };
  const specText = spec ? `Shared continuity specification (what the sequence SHOULD hold constant): outfit — ${spec.outfit}; hair — ${spec.hair}; jewelry — ${spec.jewelry}; bag — ${spec.bag}; props — ${spec.props.join(", ") || "none specified"}; time window — ${spec.timeWindow}; lighting — ${spec.lighting}; location progression — ${spec.locationProgression.map((l, i) => `${i + 1}) ${l}`).join(" → ")}; camera — ${spec.cameraStyle}.` : "No continuity specification was recorded; judge whether the frames could plausibly be one continuous outing.";
  const { outcome: res, retry } = await visionWithRetry(deps.vision, {
    kind: "CONTINUITY", images: files.map(({ f }) => { const pv = qaPreview(f.bytes); return { mime: pv.mime, dataBase64: b64(pv.bytes) }; }),
    system: "You are a strict continuity QA inspector for a virtual-creator studio. You are shown the frames of ONE carousel in order. Judge ONLY what is visible, as a sequence. If you cannot verify something answer UNCLEAR. Reply with JSON only.",
    prompt: `The ${files.length} attached images are frames 1..${files.length} of one Instagram carousel for ${p.concept || "a single story"}, in order.\n${specText}\nFor each check give a verdict and, when not PASS, name the affected frame numbers.\nChecks: same_person (same face/identity in all frames), outfit, jewelry (same pieces, nothing added/removed), hair, time_of_day (all frames in the same time window; flag any morning→sunset→dusk→night drift), lighting_progression (plausible and consistent), location_progression (matches the intended progression), recurring_props (bag/cup/etc. consistent), unwanted_text_signage (ANY readable text, signage, logos or watermarks), story_coherence (do the frames read as one continuous real outing?).\nHARD_FAIL is for a clear violation of same_person, outfit, time_of_day or unwanted_text_signage; everything else is REVIEW.\nReturn {"checks":[{"id":"<check>","verdict":"PASS|REVIEW|HARD_FAIL|UNCLEAR","note":"<short>","frames":[<frame numbers>]}]}.`,
  }, policy);
  const parsed = res.text ? Out.safeParse(parseJson(res.text)) : null;
  if (!res.text || !parsed?.success) {
    out.push(await saveQa(repo, p, attempt, null, { kind: "CONTINUITY", method: "manual", status: "MANUAL_REVIEW_REQUIRED", inspectedImage: false, provider: res.provider, model: res.model, findings: [], retry,
      summary: `Sequence continuity NOT visually verified: ${res.text ? "the inspector returned unusable output" : res.error ?? "no inspector available"}${retry?.exhausted ? ` (${retry.note})` : ""}.`,
      recommendation: res.transient ? "Inspector was temporarily unavailable: re-run Continuity QA (no regeneration needed), or review manually." : "Review the frames side by side." }));
    await tr("IDENTITY_QA", "MANUAL_REVIEW_REQUIRED", `Continuity QA inspector unavailable/unusable for ${p.code}`, { level: "warn" });
    return out;
  }
  const findings: QaFindingRecord[] = [];
  for (const c of CONTINUITY_CHECKS) {
    const v = parsed.data.checks.find((x) => x.id === c);
    const where = v?.frames?.length ? ` (frame${v.frames.length > 1 ? "s" : ""} ${v.frames.join(", ")})` : "";
    if (!v) findings.push({ lockId: null, severity: "REVIEW", message: `${c}: not reported by inspector` });
    else if (v.verdict === "UNCLEAR") findings.push({ lockId: null, severity: "REVIEW", message: `${c}: could not be verified${where}` });
    else if (v.verdict !== "PASS") findings.push({ lockId: null, severity: HARD_CHECKS.has(c) && v.verdict === "HARD_FAIL" ? "HARD_FAIL" : "REVIEW", message: `${c}: ${v.note ?? v.verdict}${where}` });
  }
  const status: QaStatus = findings.some((f) => f.severity === "HARD_FAIL") ? "HARD_FAIL" : findings.length ? "REVIEW" : "PASS";
  out.push(await saveQa(repo, p, attempt, null, { kind: "CONTINUITY", method: "vision_model", status, inspectedImage: true, provider: res.provider, model: res.model, findings, retry,
    summary: status === "PASS" ? `Inspector judged the ${files.length} frames as one continuous sequence on all ${CONTINUITY_CHECKS.length} checks.` : findings.map((f) => f.message).join("; "), recommendation: status === "HARD_FAIL" ? "Regenerate the affected frames with the continuity corrections." : null }));
  await tr("IDENTITY_QA", status === "PASS" ? "QA_PASSED" : status === "HARD_FAIL" ? "QA_REJECTED" : "QA_REVIEW", `Continuity QA (${res.provider}/${res.model}) ${status} for ${p.code}${findings.length ? `: ${findings.map((f) => f.message).join("; ")}` : ""}`, { level: status === "PASS" ? "info" : "warn" });
  return out;
}
