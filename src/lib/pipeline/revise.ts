// Revision loop: regenerate inside the SAME production as a NEW attempt. Failed attempts/assets are preserved; QA feedback feeds the new prompt.
import type { Repo } from "@/lib/db/repo";
import type { GenerationAttempt, Production } from "@/lib/db/records";
import { loadIdentity } from "@/lib/identity/service";
import { loadReferences, selectReferences } from "@/lib/references/service";
import type { Deps } from "./deps";
import { traceOf } from "./deps";
import { buildPrompts } from "./prompts";
import { activeQa } from "./qa";
import { briefData } from "./brief";
import { contentHistory } from "./content";
import type { CreativeInput } from "@/lib/orchestrator/contracts";
import { saveBrief } from "./brief";
import { createShotAsset, runImageJob } from "./generate";

/** Plain-language feedback from a production's latest QA results + operator notes. Lock ids are kept so the prompt builder can restate the positive rule. */
export async function collectFeedback(repo: Repo, productionId: string, attemptId: string | null, operatorNotes = ""): Promise<{ feedback: string[]; failedShots: number[] }> {
  const assets = (await repo.list("assets", { productionId })).filter((a) => a.current && a.attemptId === attemptId);
  const results = activeQa(await repo.list("qaResults", { productionId }));
  const feedback: string[] = [];
  const failed = new Set<number>();
  for (const a of assets) {
    if (a.status === "FAILED" || a.qaStatus === "HARD_FAIL") failed.add(a.seq);
    for (const r of results.filter((x) => x.assetId === a.id && x.status === "HARD_FAIL")) for (const f of r.findings) feedback.push(`${f.lockId ? `[${f.lockId}] ` : ""}${f.message}`);
  }
  if (operatorNotes.trim()) feedback.push(`Operator: ${operatorNotes.trim()}`);
  return { feedback, failedShots: [...failed].sort((a, b) => a - b) };
}

export interface RegenerateOpts { notes?: string; shots?: number[]; reason?: string; /** Operator-written creative direction for the new attempt: rebuilds the Generation Brief (shots, outfit, continuity spec) instead of reusing the previous one. */ creative?: CreativeInput }
export interface RegenerateResult { attempt: GenerationAttempt; failures: string[]; shots: number[] }

/** Create attempt N+1 and generate the requested shots (default: the failed/hard-failed ones, else all). QA + finalize run afterwards (inline or as tasks). */
export async function regenerateProduction(repo: Repo, deps: Deps, productionId: string, o: RegenerateOpts = {}, runId: string | null = null): Promise<RegenerateResult> {
  const tr = traceOf(deps);
  const p = (await repo.get("productions", productionId)) as Production | null;
  if (!p) throw new Error("Production not found.");
  if (p.status === "APPROVED" || p.status === "SCHEDULED" || p.status === "PUBLISHED") throw new Error(`Production is ${p.status}; regeneration is not allowed after approval.`);
  const attempts = (await repo.list("generationAttempts", { productionId })).sort((a, b) => a.attemptNo - b.attemptNo);
  const last = attempts.at(-1);
  const prevBrief = last ? await repo.get("generationBriefs", last.briefId) : null;
  if (!last || !prevBrief) throw new Error("No previous attempt/brief to revise.");
  // Supersede any pending approval: the operator asked for another round.
  for (const ap of (await repo.list("approvals", { productionId })).filter((x) => x.state === "PENDING")) await repo.update("approvals", ap.id, { state: "REVISION_REQUESTED", decidedBy: "system", decidedAt: new Date().toISOString(), notes: "Superseded by regeneration" });
  const fb = await collectFeedback(repo, productionId, last.id, o.notes);
  const { identity } = await loadIdentity(repo, p.talent[0]);
  const refs = await loadReferences(repo, p.talent[0]);
  // New creative direction => a freshly built brief (all of its shots are generated); otherwise the previous brief is revised.
  const cd = o.creative ? { ...o.creative, shots: o.creative.shots.map((s) => ({ ...s, kind: s.kind ?? "IMG" })) } : null;
  const rebuilt = cd ? { ...briefData({ production: p, identity, brief: cd, refs, history: await contentHistory(repo, p), deps, revision: null }), revision: { fromAttemptId: last.id, feedback: fb.feedback } } : null;
  const all = (rebuilt ?? prevBrief.data).shots.map((s) => s.n);
  const shots = o.shots?.length ? o.shots : cd ? all : fb.failedShots.length ? fb.failedShots : all;
  const data = rebuilt ?? { ...prevBrief.data, references: refs.map((r) => ({ id: r.id, type: r.referenceType, authority: r.authority, hasImage: true })), revision: { fromAttemptId: last.id, feedback: fb.feedback } };
  const brief = await saveBrief(repo, productionId, data, refs.map((r) => r.id), p.origin);
  if (cd) await repo.update("productions", productionId, { brief: cd }); // the production shows its latest creative brief; every earlier brief version stays in generation_briefs
  const attempt = await repo.insert("generationAttempts", { productionId, attemptNo: last.attemptNo + 1, briefId: brief.id, trigger: "regenerate", status: "GENERATING", shots, parentAttemptId: last.id, reason: o.reason ?? (fb.failedShots.length ? "QA hard fail / generation failure" : "operator requested regeneration"), feedback: fb.feedback, finishedAt: null, origin: p.origin });
  await repo.update("productions", productionId, { status: "GENERATING", currentAttemptId: attempt.id, qaNotes: [...p.qaNotes, `Attempt ${attempt.attemptNo} started: ${attempt.reason}`] });
  await tr("PRODUCTION_MANAGER", "ATTEMPT_STARTED", `${p.code} attempt ${attempt.attemptNo} started for shot(s) ${shots.join(", ")} — feedback items: ${fb.feedback.length}`);
  const refsByShot = Object.fromEntries(data.shots.map((sh) => [sh.n, selectReferences(refs, sh).map((r) => r.id)]));
  const built = buildPrompts(data, identity, { shots, refsByShot });
  const failures: string[] = [];
  const prod = (await repo.get("productions", productionId))!;
  for (const b of built) {
    const prompt = await repo.insert("prompts", { productionId, provider: deps.image.name, version: attempt.attemptNo, shotN: b.shotN, positive: b.positive, negative: b.negative, identityRefs: b.identityRefs, qa: { ok: !b.findings.length, issues: b.findings.map((f) => f.message) }, briefId: brief.id, attemptId: attempt.id, origin: p.origin });
    if (b.severity === "HARD_FAIL") { failures.push(`${p.code} shot ${b.shotN}: identity prompt blocked (${b.findings.map((f) => f.message).join("; ")})`); continue; }
    const shot = data.shots.find((s) => s.n === b.shotN)!;
    const asset = await createShotAsset(repo, deps, prod, brief, attempt, prompt, b.shotN, shot.kind as never);
    const r = await runImageJob(repo, deps, { production: prod, brief, attempt, prompt, asset, refs }, runId);
    if (!r.ok) failures.push(`${p.code} shot ${b.shotN}: ${r.error}`);
  }
  return { attempt, failures, shots };
}
