// Server loader (uses the repo). Read-only.
import type { Repo } from "@/lib/db/repo";
import { pickPortraits, type Portraits } from "./portrait";

/** Portraits for all six creators, from the canonical reference library only (read-only). */
export async function loadPortraits(repo: Repo): Promise<Portraits> {
  return pickPortraits(await repo.list("referenceAssets"));
}
