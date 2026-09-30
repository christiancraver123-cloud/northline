// Finalize an attempt after QA: aggregate results into asset/attempt/production state and route to human approval (or back for revision).
import type { Repo } from "@/lib/db/repo";
import type { GenerationAttempt, Production } from "@/lib/db/records";
import type { QaStatus } from "@/lib/domain/types";
import type { Deps } from "./deps";
import { traceOf } from "./deps";
import { aggregateQa } from "./qa";

export interface FinalizeOutcome { attemptStatus: GenerationAttempt["status"]; productionStatus: Production["status"]; approvalCreated: boolean }

export async function finalizeAttempt(repo: Repo, deps: Deps, productionId: string, attemptId: string): Promise<FinalizeOutcome> {
  const tr = traceOf(deps);
  const p = (await repo.get("productions", productionId))!;
  const attempt = (await repo.get("generationAttempts", attemptId))!;
  const [results, assetsAll] = await Promise.all([repo.list("qaResults", { productionId }), repo.list("assets", { productionId })]);
  const mine = assetsAll.filter((a) => a.attemptId === attemptId);
  const attemptLevel = results.filter((r) => r.attemptId === attemptId && r.assetId === null);
  let worst: QaStatus = "PASS";
  const rank: Record<QaStatus, number> = { PASS: 0, REVIEW: 1, MANUAL_REVIEW_REQUIRED: 2, QA_PENDING: 2, HARD_FAIL: 3 };
  for (const a of mine) {
    if (a.status === "FAILED" || a.status === "PENDING") continue;
    const st = aggregateQa([...results.filter((r) => r.assetId === a.id), ...attemptLevel]);
    await repo.update("assets", a.id, { qaStatus: st });
    if (rank[st] > rank[worst]) worst = st;
  }
  const anyFailed = mine.some((a) => a.status === "FAILED");
  const awaitingVideo = assetsAll.some((a) => a.kind === "REEL" && a.current && a.status === "PENDING");
  const anyPending = mine.some((a) => a.status === "PENDING" && a.kind !== "REEL");
  const attemptStatus: GenerationAttempt["status"] = anyFailed || anyPending ? "ERROR" : worst === "QA_PENDING" ? "QA_PENDING" : (worst as GenerationAttempt["status"]);
  await repo.update("generationAttempts", attemptId, { status: attemptStatus, finishedAt: new Date().toISOString() });

  let productionStatus: Production["status"] = "RAW";
  let approvalCreated = false;
  if (worst === "HARD_FAIL") {
    await repo.update("productions", productionId, { status: "RAW", currentAttemptId: attemptId });
    await tr("PRODUCTION_MANAGER", "ATTEMPT_HARD_FAIL", `${p.code} attempt ${attempt.attemptNo} failed QA (HARD_FAIL) — regenerate required; previous attempts preserved`, { level: "warn" });
  } else if (anyFailed || anyPending || awaitingVideo) {
    await repo.update("productions", productionId, { status: "RAW", currentAttemptId: attemptId });
  } else {
    productionStatus = "REVIEW";
    await repo.update("productions", productionId, { status: "REVIEW", currentAttemptId: attemptId });
    const pend = (await repo.list("approvals", { productionId })).find((x) => x.state === "PENDING");
    if (!pend) {
      await repo.insert("approvals", { productionId, subject: "PRODUCTION", subjectId: productionId, state: "PENDING", decidedBy: null, decidedAt: null, notes: "", selectedAssetIds: [], origin: p.origin });
      approvalCreated = true;
    }
    await tr("PRODUCTION_MANAGER", "WAITING_APPROVAL", `${p.code} attempt ${attempt.attemptNo} QA result ${attemptStatus}; in the approval queue`);
  }
  return { attemptStatus, productionStatus: worst === "HARD_FAIL" ? "RAW" : productionStatus, approvalCreated };
}
