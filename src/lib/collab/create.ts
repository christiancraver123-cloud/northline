// Turns an approved collab plan into IDEA productions (one per post). Nothing is generated, scheduled or posted.
import type { Repo } from "@/lib/db/repo";
import type { TalentCode } from "@/lib/domain/types";
import { loadIdentity } from "@/lib/identity/service";
import { isReadOnly, ReadOnlyError } from "@/lib/runtime/mode";
import type { CollabPlan } from "./plan";

export async function createCollabProductions(repo: Repo, plan: CollabPlan, origin: "live" | "demo" = "live"): Promise<string[]> {
  if (isReadOnly()) throw new ReadOnlyError("creating collab productions");
  const year = new Date().getFullYear(), codes: string[] = [];
  const scope = plan.kind === "duo" ? "DUO" : plan.kind === "event" ? "ALL_SIX" : "GROUP";
  for (const post of plan.posts) {
    const owner = post.owner as TalentCode;
    const talent = [owner, ...post.tags.filter((t) => t !== owner)] as TalentCode[];
    const { identity } = await loadIdentity(repo, owner);
    const shots = plan.shots.filter((s) => post.shots.includes(s.id)).map((s, i) => ({ n: i + 1, kind: "IMG" as const, description: s.prompt }));
    const p = await repo.insert("productions", {
      code: `${owner}-${year}-${String(await repo.nextProductionSeq(owner, year)).padStart(3, "0")}`, talent, scope, contentType: post.format === "reel" ? "REEL" : "COLLAB", platform: "instagram",
      concept: post.concept, status: "IDEA", campaignId: null, storylineId: null,
      brief: { hook: plan.title, location: plan.location || "not specified", outfit: "her palette", lighting: plan.timeOfDay, storyBeat: plan.storyline, shots: post.format === "reel" ? plan.reel.beats.map((b, i) => ({ n: i + 1, kind: "IMG" as const, description: b })) : shots },
      qaNotes: [`Collab day ${post.day}. Stories: ${post.stories.map((s) => `${s.by}: ${s.what}`).join(" ") || "none"}`, ...(post.waitsForLaunch ? ["Waits for this creator's launch."] : [])],
      costUsd: 0, identityVersion: identity.id, currentAttemptId: null, origin,
    });
    await repo.insert("captions", { productionId: p.id, talent: owner, text: post.caption, kind: "FEED", approval: "PENDING", origin });
    codes.push(p.code);
  }
  return codes;
}
