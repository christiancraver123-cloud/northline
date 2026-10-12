// Which image represents a creator in the UI. Pure (no server imports) and unit-tested.
// Priority: active MASTER_FACE → highest-authority active canonical reference (face-forward types first) → none (colour/initial fallback).
// Only canonical references are considered. Generated or imported content is never a portrait, and nothing here writes identity data.
import type { ReferenceType, TalentCode } from "@/lib/domain/types";
import { TALENT_CODES } from "@/lib/domain/types";

export type PortraitSource = "MASTER_FACE" | "CANONICAL_REFERENCE" | "FALLBACK";
export interface Portrait { talent: TalentCode; refId: string | null; url: string | null; source: PortraitSource; referenceType: ReferenceType | null }
export type Portraits = Record<TalentCode, Portrait>;
interface RefLike { id: string; talent: TalentCode; referenceType: ReferenceType; authority: "MASTER" | "SUPPORTING"; status: "ACTIVE" | "ARCHIVED"; createdAt: string }

/** Supporting types in the order they make a good portrait (face-forward first, full body last). */
export const PORTRAIT_TYPE_ORDER: ReferenceType[] = ["FACE_FRONT", "FACE_3Q_LEFT", "FACE_3Q_RIGHT", "UPPER_BODY", "NATURAL_CANDID", "FACE_PROFILE", "FULL_BODY"];
export const portraitUrl = (refId: string) => `/api/references/${refId}/file`;

export function pickPortrait(refs: readonly RefLike[], talent: TalentCode): Portrait {
  const active = refs.filter((r) => r.talent === talent && r.status === "ACTIVE");
  const master = active.filter((r) => r.referenceType === "MASTER_FACE").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (master) return { talent, refId: master.id, url: portraitUrl(master.id), source: "MASTER_FACE", referenceType: "MASTER_FACE" };
  const rank = (r: RefLike) => (r.authority === "MASTER" ? -1 : PORTRAIT_TYPE_ORDER.indexOf(r.referenceType) + (PORTRAIT_TYPE_ORDER.includes(r.referenceType) ? 0 : 99));
  const best = [...active].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))[0];
  if (best) return { talent, refId: best.id, url: portraitUrl(best.id), source: "CANONICAL_REFERENCE", referenceType: best.referenceType };
  return { talent, refId: null, url: null, source: "FALLBACK", referenceType: null };
}

export function pickPortraits(refs: readonly RefLike[]): Portraits {
  return Object.fromEntries(TALENT_CODES.map((c) => [c, pickPortrait(refs, c)])) as Portraits;
}
