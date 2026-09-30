// Approval workflow. Approval changes internal state only — it never publishes or schedules externally.
import type { Repo } from "@/lib/db/repo";
import { suggestSlot } from "./schedule";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";

export type Decision = "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

/** Reasons approval is currently blocked for a production (empty = approvable). */
export async function approvalBlockers(repo: Repo, productionId: string): Promise<string[]> {
  const p = await repo.get("productions", productionId);
  if (!p) return ["Production not found"];
  const out: string[] = [];
  const assets = await repo.list("assets", { productionId });
  if (!assets.length) out.push("No assets attached");
  if (assets.some((a) => a.status === "FAILED")) out.push("Has failed assets — retry them first");
  if (assets.some((a) => a.status === "PENDING")) out.push("Has assets still pending generation");
  const launch = await repo.list("launchStates");
  for (const code of p.talent) {
    if (!launch.find((l) => l.talent === code)?.aiDisclosure) out.push(`${ROSTER_BY_CODE[code].first}: virtual/AI disclosure not confirmed on Launch`);
  }
  return out;
}

export async function decide(repo: Repo, approvalId: string, decision: Decision, notes = "", by = "operator") {
  const ap = await repo.get("approvals", approvalId);
  if (!ap) throw new Error("Approval not found");
  if (ap.state !== "PENDING") throw new Error(`Approval already ${ap.state}`);
  const prod = await repo.get("productions", ap.productionId);
  if (!prod) throw new Error("Production not found");
  if (decision === "REVISION_REQUESTED" && !notes.trim()) throw new Error("A revision reason is required.");
  if (decision === "APPROVED") {
    const blockers = await approvalBlockers(repo, prod.id);
    if (blockers.length) throw new Error(`Cannot approve: ${blockers.join("; ")}`);
  }
  const now = new Date().toISOString();
  await repo.update("approvals", ap.id, { state: decision, decidedBy: by, decidedAt: now, notes });
  const assets = await repo.list("assets", { productionId: prod.id });
  if (decision === "APPROVED") {
    await repo.update("productions", prod.id, { status: "APPROVED" });
    for (const a of assets) await repo.update("assets", a.id, { status: "APPROVED", approval: "APPROVED", filename: a.filename.replace("_RAW.", "_APPROVED.") });
    for (const c of await repo.list("captions", { productionId: prod.id })) await repo.update("captions", c.id, { approval: "APPROVED" });
    const existing = await repo.list("calendarEntries");
    for (const t of [prod.talent[0]]) {
      const slot = suggestSlot(existing, t);
      await repo.insert("calendarEntries", { productionId: prod.id, talent: t, platform: prod.platform, date: slot.date, time: slot.time, state: "APPROVED", origin: prod.origin });
    }
  } else if (decision === "REJECTED") {
    await repo.update("productions", prod.id, { status: "REJECTED" });
    for (const a of assets) await repo.update("assets", a.id, { status: "REJECTED", approval: "REJECTED" });
  } else {
    await repo.update("productions", prod.id, { status: "RAW", qaNotes: [...prod.qaNotes, `Revision requested: ${notes}`] });
  }
}

/** After revisions, put a production back into the approval queue. */
export async function resubmitForReview(repo: Repo, productionId: string) {
  const p = await repo.get("productions", productionId);
  if (!p || p.status !== "RAW") throw new Error("Only RAW productions can be resubmitted.");
  await repo.update("productions", p.id, { status: "REVIEW" });
  await repo.insert("approvals", { productionId: p.id, subject: "PRODUCTION", subjectId: p.id, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", origin: p.origin });
}
