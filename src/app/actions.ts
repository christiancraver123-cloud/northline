"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/db";
import { requireOperator } from "@/lib/auth/guard";
import { retryAsset, submitReelVideo } from "@/lib/orchestrator/execute";
import { submitCreate } from "@/lib/agents/ops/commands";
import { ensureApprovalWait, resolveApprovalWaits } from "@/lib/agents/ops/service";
import { decide, resubmitForReview, type Decision } from "@/lib/orchestrator/approvals";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import type { LaunchState } from "@/lib/db/records";

export async function createAction(formData: FormData) {
  await requireOperator();
  const parsed = CreateRequestSchema.safeParse(JSON.parse(String(formData.get("request") ?? "{}")));
  if (!parsed.success) redirect(`/create?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; ").slice(0, 200))}`);
  const r = await submitCreate(await getRepo(), parsed.data, { createdBy: "operator" });
  revalidatePath("/", "layout");
  if (r.task.status === "FAILED") redirect(`/create?error=${encodeURIComponent((r.task.error ?? "failed").slice(0, 200))}`);
  const n = r.output?.productions?.length ?? 0, failures = r.output?.failures ?? [];
  if (failures.length) redirect(`/productions?created=${n}&warn=${encodeURIComponent(failures.join("; ").slice(0, 300))}`);
  redirect(`/productions?created=${n}`);
}

export async function decideAction(formData: FormData) {
  await requireOperator();
  const id = String(formData.get("approvalId"));
  const decision = String(formData.get("decision")) as Decision;
  const notes = String(formData.get("notes") ?? "");
  let err = "";
  try {
    const repo = await getRepo();
    const ap = await repo.get("approvals", id);
    await decide(repo, id, decision, notes);
    if (ap) await resolveApprovalWaits(repo, ap.productionId, decision);
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  if (err) redirect(`/approvals?error=${encodeURIComponent(err)}`);
}

export async function retryAssetAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId"));
  try { const repo = await getRepo(); await retryAsset(repo, String(formData.get("assetId"))); await syncWait(pid); } catch { /* recorded on the provider job */ }
  revalidatePath(`/productions/${pid}`);
}
export async function reelVideoAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId"));
  let err = "";
  try { await submitReelVideo(await getRepo(), pid); await syncWait(pid); } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath(`/productions/${pid}`);
  if (err) redirect(`/productions/${pid}?error=${encodeURIComponent(err)}`);
}
export async function resubmitAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId"));
  try { await resubmitForReview(await getRepo(), pid); await syncWait(pid); } catch { /* status guard */ }
  revalidatePath("/", "layout");
}

const LAUNCH_FIELDS = ["accountCreated", "bioDone", "aiDisclosure", "profilePicture", "masterFace", "referencesDone", "initialContent", "approved"] as const;
export async function launchAction(formData: FormData) {
  await requireOperator();
  const repo = await getRepo();
  const talent = String(formData.get("talent"));
  const row = (await repo.list("launchStates")).find((l) => l.talent === talent);
  if (!row) return;
  const patch: Partial<LaunchState> = { handle: String(formData.get("handle") ?? "").trim().replace(/^@/, "") || null };
  for (const f of LAUNCH_FIELDS) patch[f] = formData.get(f) === "on";
  await repo.update("launchStates", row.id, patch);
  revalidatePath("/", "layout");
}

/** Keep the Production Manager's WAITING task in step with production state. */
async function syncWait(productionId: string) {
  const repo = await getRepo();
  const p = await repo.get("productions", productionId);
  if (p?.status === "REVIEW") await ensureApprovalWait(repo, p.id, p.code, p.origin);
}

// ---- Agent Operations Center ---------------------------------------------------------
import { handleMessage } from "@/lib/agents/ops/chat";
import { cancelTask, reprioritize, retryTask, setNotes, setPaused, setScheduleEnabled } from "@/lib/agents/ops/service";
import { materializeDueSchedules } from "@/lib/agents/ops/service";
import { processQueue } from "@/lib/agents/ops/worker";
import type { AgentCode } from "@/lib/db/records";

export async function agentMessageAction(formData: FormData) {
  await requireOperator();
  const agent = String(formData.get("agent")) as AgentCode;
  await handleMessage(await getRepo(), agent, String(formData.get("text") ?? ""));
  revalidatePath("/", "layout");
}
export async function agentControlAction(formData: FormData) {
  await requireOperator();
  const repo = await getRepo();
  const agent = String(formData.get("agent")) as AgentCode;
  const op = String(formData.get("op"));
  const taskId = String(formData.get("taskId") ?? "");
  try {
    if (op === "pause") await setPaused(repo, agent, true);
    else if (op === "resume") await setPaused(repo, agent, false);
    else if (op === "notes") await setNotes(repo, agent, String(formData.get("notes") ?? ""));
    else if (op === "cancel") await cancelTask(repo, taskId);
    else if (op === "retry") { await retryTask(repo, taskId); await processQueue(repo, { onlyIds: [taskId], trigger: "operator" }); }
    else if (op === "prioritize") await reprioritize(repo, taskId, 1);
    else if (op === "run") await processQueue(repo, { trigger: "operator", max: 10 });
    else if (op === "schedule") await setScheduleEnabled(repo, String(formData.get("scheduleId")), formData.get("enabled") === "1");
    else if (op === "tick") { await materializeDueSchedules(repo); await processQueue(repo, { trigger: "operator", max: 25 }); }
  } catch { /* surfaced through the activity log */ }
  revalidatePath("/", "layout");
}
export async function markReportAction(formData: FormData) {
  await requireOperator();
  const repo = await getRepo();
  const id = String(formData.get("reportId"));
  if (id === "ALL") for (const r of await repo.list("agentReports", { read: false })) await repo.update("agentReports", r.id, { read: true });
  else await repo.update("agentReports", id, { read: formData.get("read") !== "0" });
  revalidatePath("/", "layout");
}
