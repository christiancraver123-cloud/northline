// Identity block + Identity QA. Prompts are built from canonical roster data, never from previously generated images.
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { ReferenceSlot, TalentCode } from "@/lib/domain/types";

export const REFERENCE_PRIORITY: ReferenceSlot[] = ["MASTER_FACE", "FRONT", "THREE_QUARTER", "PROFILE", "UPPER_BODY", "FULL_BODY", "NATURAL", "CHARACTER_SHEET"];

export function identityBlock(code: TalentCode): string {
  const t = ROSTER_BY_CODE[code];
  return `${t.first}, a ${t.age}-year-old adult woman. ${t.identity.signature.join("; ")}. ${t.identity.body}. Expression: ${t.visual.expression}.`;
}

export interface QaResult { ok: boolean; issues: string[] }

/** Checks the POSITIVE prompt text only (negative prompts legitimately mention forbidden traits). */
export function identityQa(code: TalentCode, positive: string): QaResult {
  const t = ROSTER_BY_CODE[code];
  const issues: string[] = [];
  for (const r of t.qa.required) if (!new RegExp(r.pattern, "i").test(positive)) issues.push(`Missing identity marker: ${r.label}`);
  for (const r of t.qa.forbidden) if (new RegExp(r.pattern, "i").test(positive)) issues.push(`Forbidden for ${t.first}: ${r.label}`);
  return { ok: issues.length === 0, issues };
}

export function negativeBlock(code: TalentCode): string {
  const t = ROSTER_BY_CODE[code];
  return `Avoid: ${t.qa.forbidden.map((f) => f.label).join(", ")}; plastic skin, extra fingers, distorted hands, text overlays, watermarks, nudity, lingerie, real brand logos, real people.`;
}
