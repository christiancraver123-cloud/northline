"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/db";
import { requireOperator } from "@/lib/auth/guard";
import { ensureLaunchStates } from "@/lib/db/seed";
import { retryAsset, submitReelVideo } from "@/lib/orchestrator/execute";
import { submitCreate } from "@/lib/agents/ops/commands";
import { ensureApprovalWait, resolveApprovalWaits } from "@/lib/agents/ops/service";
import { decide, resubmitForReview, type Decision } from "@/lib/orchestrator/approvals";
import { archiveReference, promoteGeneratedAsset, setMaster, uploadReference } from "@/lib/references/service";
import { getStorage } from "@/lib/providers/storage";
import { rerunQa, submitRegenerate, type QaKind } from "@/lib/agents/ops/commands";
import { createDelivery45 } from "@/lib/pipeline/derive";
import { encodeDecisionNotes } from "@/lib/feedback/reasons";
import { MAX_IMAGE_BYTES } from "@/lib/media/inspect";
import { REFERENCE_TYPES, TALENT_CODES, type ReferenceType, type TalentCode } from "@/lib/domain/types";
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
  // structured reasons (learning data) + optional free text; approvals carry free text only
  const notes = decision === "APPROVED" ? String(formData.get("notes") ?? "") : encodeDecisionNotes(formData.getAll("reason"), String(formData.get("notes") ?? ""));
  let err = "";
  try {
    const repo = await getRepo();
    const ap = await repo.get("approvals", id);
    const selected = formData.getAll("asset").map(String);
    await decide(repo, id, decision, notes, "operator", decision === "APPROVED" && selected.length ? { selectedAssetIds: selected } : {});
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
  await ensureLaunchStates(repo);
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
import { cancelTask, reprioritize, retryTask, setModelPreference, setNotes, setPaused, setScheduleEnabled } from "@/lib/agents/ops/service";
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
    else if (op === "model") {
      const fb = String(formData.get("fallback") ?? "default");
      await setModelPreference(repo, agent, { provider: String(formData.get("provider")) as never, model: String(formData.get("model") ?? ""), allowFallback: fb === "default" ? undefined : fb === "allow" });
    }
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


// ---- Canonical references & regeneration ----------------------------------------------------
const back = (code: string, q: string) => redirect(`/talent/${code}?${q}#references`);

export async function uploadReferenceAction(formData: FormData) {
  await requireOperator();
  const code = String(formData.get("talent")) as TalentCode;
  if (!TALENT_CODES.includes(code)) redirect("/talent");
  const type = String(formData.get("type")) as ReferenceType;
  const file = formData.get("file");
  let err = "";
  try {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("File is larger than 10MB.");
    if (!REFERENCE_TYPES.includes(type)) throw new Error("Choose a reference type.");
    await uploadReference(await getRepo(), getStorage(), { talent: code, type, bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, notes: String(formData.get("notes") ?? ""), replaceId: String(formData.get("replaceId") ?? "") || undefined });
  } catch (e) { err = e instanceof Error ? e.message : "upload failed"; }
  revalidatePath("/", "layout");
  back(code, err ? `refError=${encodeURIComponent(err)}` : "refOk=1");
}
export async function referenceControlAction(formData: FormData) {
  await requireOperator();
  const repo = await getRepo();
  const code = String(formData.get("talent"));
  const id = String(formData.get("id"));
  let err = "";
  try {
    if (formData.get("op") === "archive") await archiveReference(repo, id);
    else if (formData.get("op") === "master") await setMaster(repo, id);
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  back(code, err ? `refError=${encodeURIComponent(err)}` : "refOk=1");
}
export async function promoteAssetAction(formData: FormData) {
  await requireOperator();
  const assetId = String(formData.get("assetId"));
  let err = "";
  try {
    await promoteGeneratedAsset(await getRepo(), getStorage(), assetId, String(formData.get("type")) as ReferenceType, String(formData.get("operator") ?? "operator"), String(formData.get("notes") ?? ""), String(formData.get("replaceId") ?? "") || undefined);
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(`/assets/${assetId}?${err ? `error=${encodeURIComponent(err)}` : "promoted=1"}`);
}
export async function regenerateAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId"));
  let err = "";
  try {
    const t = await submitRegenerate(await getRepo(), pid, { notes: String(formData.get("notes") ?? "") });
    if (t.status === "FAILED") err = t.error ?? "regeneration failed";
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(`/productions/${pid}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
}

/** Re-run QA on existing assets. Never regenerates or modifies an image; older QA results stay in history. */
export async function rerunQaAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId")), assetId = String(formData.get("assetId") ?? ""), back = String(formData.get("back") ?? `/productions/${pid}`);
  const kinds = formData.getAll("kind").map(String).filter((k): k is QaKind => ["IDENTITY", "TECHNICAL", "CONTINUITY"].includes(k));
  let err = "";
  try {
    const r = await rerunQa(await getRepo(), { productionId: pid, kinds, assetIds: assetId ? [assetId] : undefined, createdBy: "operator (QA re-run)" });
    const failed = r.tasks.find((t) => t.status === "FAILED");
    if (failed) err = failed.error ?? "QA re-run failed";
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(`${back}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
}
/** Create 4:5 delivery copies (RAW originals are never touched). One asset, or every current frame of a production. */
export async function deliveryAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId")), assetId = String(formData.get("assetId") ?? ""), back = String(formData.get("back") ?? `/productions/${pid}`);
  let err = "";
  try {
    const repo = await getRepo(), storage = getStorage();
    const targets = assetId ? [assetId] : (await repo.list("assets", { productionId: pid })).filter((a) => a.current && a.kind !== "REEL" && a.storagePath).map((a) => a.id);
    for (const id of targets) await createDelivery45(repo, storage, id, { createdBy: "operator (4:5 delivery)" });
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(`${back}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
}

// ---- Command Center: emergency pause + unblock ------------------------------------------------
import { RepoGovernorStore } from "@/lib/governor/repo-store";
import { governorEnabled } from "@/lib/governor/service";
import { unblockTask } from "@/lib/agents/ops/service";
export async function setPauseAction(formData: FormData) {
  await requireOperator();
  if (!governorEnabled()) redirect("/?error=" + encodeURIComponent("Budget governor is OFF (NORTHLINE_GOVERNOR); the pause switch is unavailable. NORTHLINE_PAUSE=true still pauses generation."));
  const enabled = String(formData.get("enabled")) === "true", reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;
  await new RepoGovernorStore(await getRepo()).setPause({ enabled, reason, setBy: "operator", setAt: new Date().toISOString() });
  revalidatePath("/"); redirect("/");
}
export async function unblockTaskAction(formData: FormData) {
  await requireOperator();
  await unblockTask(await getRepo(), String(formData.get("id") ?? ""));
  revalidatePath("/"); redirect("/");
}
