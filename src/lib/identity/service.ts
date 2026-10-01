// Persisted canonical identity snapshots. A stored version is immutable: productions record the version they used.
import type { Repo } from "@/lib/db/repo";
import type { CanonicalIdentityRecord } from "@/lib/db/records";
import { ROSTER } from "@/lib/talent/roster";
import type { TalentCode } from "@/lib/domain/types";
import { ReadOnlyError } from "@/lib/runtime/mode";
import { IDENTITY_VERSION, buildCanonicalIdentity, identityHash, identityId, type CanonicalIdentity } from "./canonical";

/** Ensure an ACTIVE snapshot exists for every creator at the current version. Never mutates an existing snapshot. */
export async function ensureIdentities(repo: Repo): Promise<CanonicalIdentityRecord[]> {
  const existing = await repo.list("canonicalIdentities");
  for (const t of ROSTER) {
    if (existing.some((r) => r.code === t.code && r.version === IDENTITY_VERSION)) continue;
    const ci = buildCanonicalIdentity(t.code);
    for (const old of existing.filter((r) => r.code === t.code && r.status === "ACTIVE")) await repo.update("canonicalIdentities", old.id, { status: "SUPERSEDED" });
    existing.push(await repo.insert("canonicalIdentities", { code: t.code, version: IDENTITY_VERSION, identityId: ci.id, contentHash: identityHash(ci), status: "ACTIVE", data: ci, origin: "live" }));
  }
  return existing;
}

export interface LoadedIdentity { identity: CanonicalIdentity; identityId: string; version: string; drift: boolean }

/** The identity a NEW production should use: the stored ACTIVE snapshot. `drift` = code facts changed without a version bump. */
export async function loadIdentity(repo: Repo, code: TalentCode): Promise<LoadedIdentity> {
  // In read-only mode nothing may be persisted: a missing snapshot is computed from code (shown, never stored).
  try { await ensureIdentities(repo); } catch (e) { if (!(e instanceof ReadOnlyError)) throw e; }
  const rec = (await repo.list("canonicalIdentities")).find((r) => r.code === code && r.status === "ACTIVE");
  if (!rec) { const ci = buildCanonicalIdentity(code); return { identity: ci, identityId: ci.id, version: ci.version, drift: false }; }
  return { identity: rec.data, identityId: rec.identityId, version: rec.version, drift: identityHash(buildCanonicalIdentity(code, rec.version)) !== rec.contentHash };
}
export { identityId };
