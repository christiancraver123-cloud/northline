"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/db";
import { executeCreate, retryAsset, submitReelVideo } from "@/lib/orchestrator/execute";
import { decide, resubmitForReview, type Decision } from "@/lib/orchestrator/approvals";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import type { LaunchState } from "@/lib/db/records";

export async function createAction(formData: FormData) {
  const parsed = CreateRequestSchema.safeParse(JSON.parse(String(formData.get("request") ?? "{}")));
  if (!parsed.success) redirect(`/create?error=${encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; ").slice(0, 200))}`);
  const res = await executeCreate(await getRepo(), parsed.data);
  revalidatePath("/", "layout");
  if (res.failures.length) redirect(`/productions?created=${res.productions.length}&warn=${encodeURIComponent(res.failures.join("; ").slice(0, 300))}`);
  redirect(`/productions?created=${res.productions.length}`);
}

export async function decideAction(formData: FormData) {
  const id = String(formData.get("approvalId"));
  const decision = String(formData.get("decision")) as Decision;
  const notes = String(formData.get("notes") ?? "");
  let err = "";
  try { await decide(await getRepo(), id, decision, notes); } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath("/", "layout");
  if (err) redirect(`/approvals?error=${encodeURIComponent(err)}`);
}

export async function retryAssetAction(formData: FormData) {
  const pid = String(formData.get("productionId"));
  try { await retryAsset(await getRepo(), String(formData.get("assetId"))); } catch { /* recorded on the provider job */ }
  revalidatePath(`/productions/${pid}`);
}
export async function reelVideoAction(formData: FormData) {
  const pid = String(formData.get("productionId"));
  let err = "";
  try { await submitReelVideo(await getRepo(), pid); } catch (e) { err = e instanceof Error ? e.message : "failed"; }
  revalidatePath(`/productions/${pid}`);
  if (err) redirect(`/productions/${pid}?error=${encodeURIComponent(err)}`);
}
export async function resubmitAction(formData: FormData) {
  const pid = String(formData.get("productionId"));
  try { await resubmitForReview(await getRepo(), pid); } catch { /* status guard */ }
  revalidatePath("/", "layout");
}

const LAUNCH_FIELDS = ["accountCreated", "bioDone", "aiDisclosure", "profilePicture", "masterFace", "referencesDone", "initialContent", "approved"] as const;
export async function launchAction(formData: FormData) {
  const repo = await getRepo();
  const talent = String(formData.get("talent"));
  const row = (await repo.list("launchStates")).find((l) => l.talent === talent);
  if (!row) return;
  const patch: Partial<LaunchState> = { handle: String(formData.get("handle") ?? "").trim().replace(/^@/, "") || null };
  for (const f of LAUNCH_FIELDS) patch[f] = formData.get(f) === "on";
  await repo.update("launchStates", row.id, patch);
  revalidatePath("/", "layout");
}
