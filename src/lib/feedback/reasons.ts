// Structured human feedback. A rejection / revision request carries machine-readable reason codes (learning data) plus optional free text.
// Stored in the existing `approvals.notes` as "[reasons: face_drift, wrong_eyes] free text" so no schema change is needed; parseDecisionNotes is the only reader.
// (A dedicated table can later be back-filled from these notes.) Reasons are DATA for learning — they never edit canonical identity.
export const REJECTION_REASONS = [
  ["face_drift", "Face drift (doesn't look like her)"], ["wrong_eyes", "Wrong eyes"], ["wrong_body", "Wrong body"], ["looks_ai", "Looks too AI"], ["anatomy", "Anatomy / hands"],
  ["too_posed", "Too posed"], ["bad_lighting", "Bad lighting"], ["bad_environment", "Bad environment"], ["weak_charisma", "Weak charisma"], ["wrong_outfit", "Wrong outfit"],
  ["continuity", "Continuity"], ["unwanted_text", "Unwanted text / signage"], ["personality_mismatch", "Creator personality mismatch"], ["other", "Other"],
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number][0];
const CODES = new Set<string>(REJECTION_REASONS.map(([c]) => c));
export const reasonLabel = (code: string) => REJECTION_REASONS.find(([c]) => c === code)?.[1] ?? code;

/** Keep only known codes, de-duplicated, in a stable order. */
export const cleanReasons = (xs: unknown[]): RejectionReason[] => [...new Set(xs.map(String).filter((x) => CODES.has(x)))] as RejectionReason[];

export function encodeDecisionNotes(reasons: unknown[], text = ""): string {
  const r = cleanReasons(reasons), t = text.trim();
  return r.length ? `[reasons: ${r.join(", ")}]${t ? ` ${t}` : ""}` : t;
}
export function parseDecisionNotes(notes: string): { reasons: RejectionReason[]; text: string } {
  const m = /^\[reasons: ([a-z_, ]+)\]\s*/.exec(notes ?? "");
  if (!m) return { reasons: [], text: (notes ?? "").trim() };
  return { reasons: cleanReasons(m[1].split(",").map((x) => x.trim())), text: notes.slice(m[0].length).trim() };
}
