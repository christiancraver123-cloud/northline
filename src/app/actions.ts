"use server";
import { redirect } from "next/navigation";
import { promises as fs } from "node:fs";
import { resolveKey } from "@/lib/inbox/folder-server";
import { classifyFolder, INBOX_NOTE } from "@/lib/inbox/folder";
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
  if (!parsed.success) redirect(`/create?mode=planner&error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; ").slice(0, 200))}`);
  const r = await submitCreate(await getRepo(), parsed.data, { createdBy: "operator" });
  revalidatePath("/", "layout");
  if (r.task.status === "FAILED") redirect(`/create?mode=planner&error=${encodeURIComponent((r.task.error ?? "failed").slice(0, 200))}`);
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

// ---- Command Center milestone: one-image Create, mock publishing, insights, archive -----------------------------------------
import { publishAsset, recordInsights, retryPublication } from "@/lib/publishing/service";
import { resolvePublisher } from "@/lib/publishing/service";
import { MOCK_OUTCOMES, type MockOutcome } from "@/lib/publishing/provider";
import { isReadOnly } from "@/lib/runtime/mode";

/** Create studio: exactly ONE image. Requires the founder's explicit confirmation tick. */
export async function createImageAction(formData: FormData) {
  await requireOperator();
  if (formData.get("confirmed") !== "yes") redirect(`/create?mode=generate&error=${encodeURIComponent("Tick the confirmation before generating.")}`);
  const parsed = CreateRequestSchema.safeParse(JSON.parse(String(formData.get("request") ?? "{}")));
  if (!parsed.success) redirect(`/create?mode=generate&error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; ").slice(0, 200))}`);
  const req = parsed.data;
  if (req.quantity !== 1 || req.talent.length !== 1 || req.creative?.shots.length !== 1) redirect(`/create?mode=generate&error=${encodeURIComponent("The studio generates exactly one image per click.")}`);
  const r = await submitCreate(await getRepo(), { ...req, asset_count: 1 }, { createdBy: "operator" });
  revalidatePath("/", "layout");
  if (r.task.status === "FAILED") redirect(`/create?mode=generate&error=${encodeURIComponent((r.task.error ?? "failed").slice(0, 200))}`);
  const p = r.output?.productions?.[0];
  const failures = r.output?.failures ?? [];
  redirect(p ? `/productions/${p.id}${failures.length ? `?error=${encodeURIComponent(failures.join("; ").slice(0, 300))}` : "?created=1"}` : "/productions");
}

const mockOutcome = (v: FormDataEntryValue | null): MockOutcome | undefined => (MOCK_OUTCOMES.includes(String(v) as MockOutcome) ? (String(v) as MockOutcome) : undefined);
const backTo = (v: FormDataEntryValue | null, fallback: string) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : fallback; };
const withMsg = (url: string, k: string, v: string) => `${url}${url.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v.slice(0, 300))}`;

/** Founder clicks Publish → confirmation → mock (or future live) provider. Never automatic. */
export async function publishAction(formData: FormData) {
  await requireOperator();
  const back = backTo(formData.get("back"), "/approvals");
  if (isReadOnly()) redirect(withMsg(back, "error", "Read-only mode: publishing is disabled."));
  let msg = "", err = "";
  try {
    const pub = await publishAsset(await getRepo(), { assetId: String(formData.get("assetId")), confirmed: formData.get("confirm") === "yes", requestedBy: "founder", mockOutcome: mockOutcome(formData.get("mockOutcome")) });
    if (pub.status === "PUBLISHED") msg = `Published (${pub.provider === "MOCK_INSTAGRAM" ? "mock" : "live"}): ${pub.permalink}`;
    else err = `Publish failed: ${pub.error}${pub.retryable ? " — retry is available" : ""}`;
  } catch (e) { err = e instanceof Error ? e.message : "publish failed"; }
  revalidatePath("/", "layout");
  redirect(err ? withMsg(back, "error", err) : withMsg(back, "ok", msg));
}
export async function retryPublishAction(formData: FormData) {
  await requireOperator();
  const back = backTo(formData.get("back"), "/approvals");
  let err = "";
  try { const p = await retryPublication(await getRepo(), String(formData.get("publicationId")), { mockOutcome: mockOutcome(formData.get("mockOutcome")) }); if (p.status !== "PUBLISHED") err = `Retry failed: ${p.error}`; } catch (e) { err = e instanceof Error ? e.message : "retry failed"; }
  revalidatePath("/", "layout");
  redirect(err ? withMsg(back, "error", err) : withMsg(back, "ok", "Published on retry."));
}
/** Pull a fresh insights snapshot for a published post (mock provider today). */
export async function refreshInsightsAction(formData: FormData) {
  await requireOperator();
  const back = backTo(formData.get("back"), "/analytics");
  let err = "";
  try {
    const repo = await getRepo();
    const pub = await repo.get("publications", String(formData.get("publicationId")));
    if (!pub) throw new Error("Publication not found");
    const { provider } = resolvePublisher();
    if (!provider || provider.name !== pub.provider) throw new Error("Insights provider unavailable for this post.");
    await recordInsights(repo, pub, provider);
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(err ? withMsg(back, "error", err) : back);
}
/** Archive a production from review: the pending approval is closed (recorded as rejected with an [archived] note). Nothing is deleted. */
export async function archiveProductionAction(formData: FormData) {
  await requireOperator();
  const pid = String(formData.get("productionId"));
  let err = "";
  try {
    const repo = await getRepo();
    for (const a of await repo.list("approvals", { productionId: pid, state: "PENDING" })) await repo.update("approvals", a.id, { state: "REJECTED", decidedBy: "founder", decidedAt: new Date().toISOString(), notes: "[archived by founder]" });
    await repo.update("productions", pid, { status: "ARCHIVED" });
  } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(err ? `/approvals?error=${encodeURIComponent(err)}` : "/approvals?ok=Archived");
}

// ---- Manual-first import, bulk review, drag-to-state ----------------------------------------------------------------------
import { importAsset, ImportError } from "@/lib/pipeline/import";
import { BulkError, decideMany, moveCard } from "@/lib/orchestrator/bulk";
import { defaultDeps } from "@/lib/pipeline/deps";
import { REJECT_TAGS } from "@/lib/feedback/reasons";

export type ImportActionResult = { ok: true; productionId: string; code: string; status: string; assetId: string } | { ok: false; error: string };
/** Upload one image (drag/drop or picker). Works with every generation provider disabled. Returns a result for the drop zone UI. */
export async function importAction(formData: FormData): Promise<ImportActionResult> {
  await requireOperator(); // read-only redirects here, before any work
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Choose an image file." };
    const meta = Object.fromEntries(["scene", "location", "outfit", "notes", "caption", "storyBeat"].map((k) => [k, String(formData.get(k) ?? "")]));
    const repo = await getRepo();
    const deps = { ...defaultDeps(), trace: async (agent: string, kind: string, message: string, o?: { level?: "info" | "warn" | "error"; data?: Record<string, unknown> }) => { await repo.insert("agentEvents", { agentId: agent as AgentCode, taskId: null, runId: null, level: o?.level ?? "info", kind, message, data: o?.data ?? {} }); } };
    const r = await importAsset(repo, deps as never, { talent: String(formData.get("talent") ?? ""), bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, declaredMime: file.type || undefined, meta, createdBy: "founder", replaceProductionId: String(formData.get("replaceProductionId") ?? "") || undefined });
    revalidatePath("/", "layout");
    return { ok: true, productionId: r.production.id, code: r.production.code, status: r.status, assetId: r.asset.id };
  } catch (e) {
    return { ok: false, error: e instanceof ImportError ? e.message : e instanceof Error ? e.message.slice(0, 200) : "Import failed" };
  }
}

/** Bulk decisions on the visible queue. DENY ALL / APPROVE ALL / selected. Requires an explicit confirmation tick. */
export async function bulkDecideAction(formData: FormData) {
  await requireOperator();
  const back = backTo(formData.get("back"), "/approvals?view=grid");
  const decision = String(formData.get("decision"));
  if (decision !== "APPROVED" && decision !== "REJECTED") redirect(withMsg(back, "error", "Unknown bulk action."));
  if (formData.get("confirm") !== "yes") redirect(withMsg(back, "error", "Tick the confirmation first."));
  const tags = formData.getAll("reason").map(String).filter((c) => REJECT_TAGS.some(([, code]) => code === c));
  const notes = decision === "REJECTED" ? encodeDecisionNotes(tags, `[bulk deny] ${String(formData.get("notes") ?? "")}`.trim()) : "[bulk approve]";
  let msg = "", err = "";
  try {
    const r = await decideMany(await getRepo(), { ids: formData.getAll("approvalId").map(String), decision, notes, by: "founder", filter: { creator: String(formData.get("creator") ?? "") || null } });
    msg = `${decision === "APPROVED" ? "Approved" : "Denied"} ${r.done.length}.${r.failed.length ? ` ${r.failed.length} could not be ${decision === "APPROVED" ? "approved" : "denied"}: ${r.failed.map((f) => f.reason).slice(0, 2).join(" | ")}` : ""}`;
  } catch (e) { err = e instanceof BulkError || e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  redirect(err ? withMsg(back, "error", err) : withMsg(back, "ok", msg));
}

/** Drag a review card to Approved / Rejected. Same approval gate as the buttons; never publishes. */
export async function moveCardAction(approvalId: string, target: string): Promise<{ ok: boolean; error?: string }> {
  await requireOperator();
  try { await moveCard(await getRepo(), approvalId, target, "founder", target === "REJECTED" ? "[moved to Rejected]" : ""); revalidatePath("/", "layout"); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Send selected folder-inbox images (creator folders only) into Northline: each becomes a manual import → QA → Approvals. */
export async function sendInboxAction(formData: FormData) {
  await requireOperator();
  const back = backTo(formData.get("back"), "/inbox");
  const keys = [...new Set(formData.getAll("key").map(String))].slice(0, 30);
  if (!keys.length) redirect(withMsg(back, "error", "Tick at least one image."));
  const repo = await getRepo();
  const deps = { ...defaultDeps(), trace: async (agent: string, kind: string, message: string, o?: { level?: "info" | "warn" | "error"; data?: Record<string, unknown> }) => { await repo.insert("agentEvents", { agentId: agent as AgentCode, taskId: null, runId: null, level: o?.level ?? "info", kind, message, data: o?.data ?? {} }); } };
  let sent = 0; const problems: string[] = [];
  for (const key of keys) {
    const full = resolveKey(key), g = classifyFolder(key.split("/")[1] ?? "");
    if (!full || g.kind !== "creator") { problems.push(`${key.split("/").pop()}: not in a creator folder`); continue; }
    try {
      const bytes = new Uint8Array(await fs.readFile(full));
      await importAsset(repo, deps as never, { talent: g.code, bytes, filename: key.split("/").pop()!, meta: { notes: `${INBOX_NOTE}${key}` }, createdBy: "founder" });
      sent++;
    } catch (e) { problems.push(`${key.split("/").pop()}: ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`); }
  }
  revalidatePath("/", "layout");
  redirect(problems.length ? withMsg(back, "error", `Sent ${sent} to Approvals. ${problems.length} not sent: ${problems.slice(0, 3).join(" | ")}`) : withMsg(back, "ok", `Sent ${sent} to Approvals.`));
}
