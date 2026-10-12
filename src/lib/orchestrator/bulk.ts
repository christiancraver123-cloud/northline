// Bulk approval decisions and drag-to-state moves. Every item goes through the SAME decide() gate as a single click:
// approval blockers (failed / pending / HARD_FAIL assets, missing AI disclosure) cannot be bypassed in bulk or by drag.
// Nothing is deleted. Publishing is never reachable from here.
import type { Repo } from "@/lib/db/repo";
import type { TalentCode } from "@/lib/domain/types";
import { decide, type Decision } from "./approvals";

export class BulkError extends Error {}
export interface BulkResult { done: string[]; failed: { id: string; reason: string }[] }

/** The visible queue: PENDING approvals, optionally filtered to one creator. The UI and the server use this same definition. */
export async function visibleQueue(repo: Repo, filter: { creator?: string | null } = {}) {
  const pending = (await repo.list("approvals", { state: "PENDING" })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!filter.creator) return pending;
  const prods = new Map((await repo.list("productions")).map((p) => [p.id, p]));
  return pending.filter((a) => prods.get(a.productionId)?.talent[0] === filter.creator);
}

/**
 * Decide several approvals. `ids` must all be in the visible queue for `filter`; if any is not, NOTHING is changed
 * (a bulk action can never reach outside what the founder is looking at).
 */
export async function decideMany(repo: Repo, o: { ids: string[]; decision: Decision; notes?: string; by: string; filter?: { creator?: string | null } }): Promise<BulkResult> {
  const ids = [...new Set(o.ids)];
  if (!ids.length) throw new BulkError("Nothing selected.");
  const visible = new Set((await visibleQueue(repo, o.filter)).map((a) => a.id));
  const outside = ids.filter((id) => !visible.has(id));
  if (outside.length) throw new BulkError(`${outside.length} item(s) are not in the current queue; nothing was changed.`);
  if (o.decision === "REVISION_REQUESTED" && !(o.notes ?? "").trim()) throw new BulkError("A revision needs a reason.");
  const res: BulkResult = { done: [], failed: [] };
  for (const id of ids) {
    try { await decide(repo, id, o.decision, o.notes ?? "", o.by); res.done.push(id); }
    catch (e) { res.failed.push({ id, reason: e instanceof Error ? e.message : "failed" }); }
  }
  return res;
}

export const MOVE_TARGETS = ["APPROVED", "REJECTED"] as const;
export type MoveTarget = (typeof MOVE_TARGETS)[number];
/** Drag a review card into a column. Only APPROVED / REJECTED exist; there is deliberately no publish target. */
export async function moveCard(repo: Repo, approvalId: string, target: string, by: string, notes = "") {
  if (!(MOVE_TARGETS as readonly string[]).includes(target)) throw new BulkError("Cards can only be moved to Approved or Rejected. Publishing is a separate, confirmed action.");
  await decide(repo, approvalId, target as MoveTarget, notes, by);
}
export type { TalentCode };
