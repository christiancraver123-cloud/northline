// Builds collab planner members from the canonical roster + launch state (read-only).
import type { Repo } from "@/lib/db/repo";
import { ROSTER } from "@/lib/talent/roster";
import type { CollabMember } from "./plan";

export async function collabMembers(repo: Repo): Promise<CollabMember[]> {
  const launch = await repo.list("launchStates");
  return ROSTER.map((t) => {
    const l = launch.find((x) => x.talent === t.code);
    return {
      code: t.code, name: t.name, handle: l?.handle ?? "", live: Boolean(l?.handle && l.aiDisclosure && t.launchStatus === "active"), followers: 0,
      visual_identity: `${t.identity.hair}; ${t.identity.eyes}; ${t.identity.skin}.`, photography_style: `${t.visual.lighting.join(", ")}.`,
      look: { hair: t.identity.hair, expression: t.personality.slice(0, 2).join(", "), jewellery: t.identity.jewelry, palette: t.visual.palette.join(", "), build: t.identity.body },
    };
  });
}
