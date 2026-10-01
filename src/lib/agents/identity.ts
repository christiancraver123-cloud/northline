// Identity block + prompt-level identity checks. Rules come from the canonical identity record (identity/canonical.ts),
// never from ad-hoc strings scattered through application logic.
import { allLocks, buildCanonicalIdentity, type CanonicalIdentity } from "@/lib/identity/canonical";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { QaSeverity, TalentCode } from "@/lib/domain/types";

export const identityBlock = (code: TalentCode, ci: CanonicalIdentity = buildCanonicalIdentity(code)): string => ci.providerBlock;

export interface QaFinding { lockId: string; severity: Exclude<QaSeverity, "PASS">; message: string }
export interface QaResult { ok: boolean; issues: string[] }

/** Prompt conformance check (does the PROMPT state the identity correctly?). Not an image inspection. */
export function identityPromptFindings(code: TalentCode, positive: string, ci: CanonicalIdentity = buildCanonicalIdentity(code)): QaFinding[] {
  const first = ROSTER_BY_CODE[code].first;
  const out: QaFinding[] = [];
  for (const lock of allLocks(ci)) {
    for (const r of lock.promptRequired ?? []) if (!new RegExp(r.pattern, "i").test(positive)) out.push({ lockId: lock.id, severity: lock.severity, message: `Missing identity marker: ${r.label}` });
    for (const r of lock.promptForbidden ?? []) if (new RegExp(`(?<!\\b(?:no|not|never|without|avoid)\\s)(?:${r.pattern})`, "i").test(positive)) out.push({ lockId: lock.id, severity: lock.severity, message: `Forbidden for ${first}: ${r.label}` });
  }
  return out;
}
export const worst = (f: { severity: QaSeverity }[]): QaSeverity => (f.some((x) => x.severity === "HARD_FAIL") ? "HARD_FAIL" : f.length ? "REVIEW" : "PASS");

/** Backward-compatible wrapper: ok = no findings at all. */
export function identityQa(code: TalentCode, positive: string): QaResult {
  const f = identityPromptFindings(code, positive);
  return { ok: f.length === 0, issues: f.map((x) => x.message) };
}

export function negativeBlock(code: TalentCode, ci: CanonicalIdentity = buildCanonicalIdentity(code)): string {
  return `Avoid: ${[...new Set(ci.negativeConstraints)].join(", ")}.`;
}
