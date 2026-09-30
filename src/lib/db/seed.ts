// Demo seed for the local file store: launch-state rows + a few clearly-labelled DEMO productions.
// No analytics or publishing state is ever fabricated.
import type { Repo } from "./repo";
import { ROSTER } from "@/lib/talent/roster";
import { executeCreate } from "@/lib/orchestrator/execute";
import { mockImage, mockVideo } from "@/lib/providers/mock";
import { localStorageProvider } from "@/lib/providers/storage";

export async function seedDemo(repo: Repo) {
  for (const t of ROSTER) {
    await repo.insert("launchStates", { talent: t.code, accountCreated: false, handle: null, bioDone: false, aiDisclosure: false, profilePicture: false, masterFace: false, referencesDone: false, initialContent: false, approved: false, origin: "live" });
  }
  const deps = { image: mockImage, video: mockVideo, storage: localStorageProvider, origin: "demo" as const };
  await executeCreate(repo, { talent: ["SIE"], format: "CAROUSEL", concept: "Pilates to coffee run", asset_count: 6 }, deps);
  await executeCreate(repo, { talent: ["VES"], format: "REEL", concept: "rooftop party" }, deps);
  await executeCreate(repo, { talent: ["SIE", "ZOE"], format: "COLLAB", concept: "Miami wellness weekend" }, deps);
  await executeCreate(repo, { talent: ["ALE"], format: "POST", concept: "Paris rain, late dinner" }, deps);
}
