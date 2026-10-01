// Learning memory FOUNDATION — advisory only. Four verbs and nothing else: OBSERVE (read human decisions), STORE (proposed schema, not applied),
// COMPARE (aggregate), PROPOSE (rule-based PROPOSED learnings). No function here writes to prompts, identity, references, budgets, approvals or code;
// nothing can move a learning past PROPOSED (that needs evidence + a named human, enforced by guard.canTransition).
import type { Approval, GenerationAttempt, Production } from "@/lib/db/records";
import { parseDecisionNotes, reasonLabel, type RejectionReason } from "@/lib/feedback/reasons";
import { assertLearnable, LearningViolation, validateNewLearning, MIN_EVIDENCE_TO_SUPPORT, type Learning, type LearnableField } from "./guard";

export interface Observation { productionId: string; creator: string; outcome: "APPROVED" | "REJECTED" | "REVISION_REQUESTED"; reasons: RejectionReason[]; note: string; at: string }

/** OBSERVE: one observation per DECIDED approval (pending ones are not evidence). Reads only; reasons come from the structured notes prefix. */
export function observe(approvals: Approval[], productions: Production[]): Observation[] {
  const prod = new Map(productions.map((p) => [p.id, p]));
  const out: Observation[] = [];
  for (const a of approvals) {
    const p = prod.get(a.productionId);
    if (!p || !a.decidedAt || !["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(a.state)) continue;
    if (a.decidedBy === "system") continue; // automatic supersession is not a human judgement
    const { reasons, text } = parseDecisionNotes(a.notes);
    out.push({ productionId: p.id, creator: p.talent[0], outcome: a.state as Observation["outcome"], reasons, note: text, at: a.decidedAt });
  }
  return out;
}

export interface CreatorStats {
  creator: string; decided: number; approved: number; rejected: number; revisions: number; approvalRate: number | null;
  /** productions approved after exactly one generation attempt / productions approved */
  firstPassApprovals: number; regenerations: number;
  reasons: { code: RejectionReason; label: string; productions: number; mentions: number }[];
}
/** COMPARE: per-creator counts. Rates are null when there is nothing to divide (never 0%-as-unknown). */
export function compare(obs: Observation[], attempts: GenerationAttempt[]): CreatorStats[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs) by.set(o.creator, [...(by.get(o.creator) ?? []), o]);
  const attemptsBy = new Map<string, number>();
  for (const a of attempts) attemptsBy.set(a.productionId, Math.max(attemptsBy.get(a.productionId) ?? 0, a.attemptNo));
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([creator, os]) => {
    const approvedProds = [...new Set(os.filter((o) => o.outcome === "APPROVED").map((o) => o.productionId))];
    const reasonProds = new Map<RejectionReason, Set<string>>(), mentions = new Map<RejectionReason, number>();
    for (const o of os) for (const r of o.reasons) { reasonProds.set(r, (reasonProds.get(r) ?? new Set()).add(o.productionId)); mentions.set(r, (mentions.get(r) ?? 0) + 1); }
    const approved = os.filter((o) => o.outcome === "APPROVED").length;
    return {
      creator, decided: os.length, approved, rejected: os.filter((o) => o.outcome === "REJECTED").length, revisions: os.filter((o) => o.outcome === "REVISION_REQUESTED").length,
      approvalRate: os.length ? approved / os.length : null,
      firstPassApprovals: approvedProds.filter((id) => (attemptsBy.get(id) ?? 1) === 1).length,
      regenerations: [...attemptsBy].filter(([id, n]) => n > 1 && os.some((o) => o.productionId === id)).length,
      reasons: [...reasonProds].map(([code, ps]) => ({ code, label: reasonLabel(code), productions: ps.size, mentions: mentions.get(code)! })).sort((a, b) => b.productions - a.productions || a.code.localeCompare(b.code)),
    };
  });
}

/** Reason → the ALLOWLISTED field a corrective learning could touch. Reasons about identity (face/eyes/body) map to NOTHING here: they are
 *  surfaced for a human, never learned (identity is immutable). `reference.strategy` is learnable (it is how references are used, not which references exist). */
export const REASON_FIELD: Partial<Record<RejectionReason, { field: LearnableField; statement: (creator: string) => string }>> = {
  looks_ai: { field: "camera.treatment", statement: (c) => `${c}: prefer imperfect phone-camera treatment (slight softness, natural grain) over polished studio rendering.` },
  too_posed: { field: "expression.style", statement: (c) => `${c}: favour candid, mid-action moments and relaxed expressions over deliberate posing.` },
  bad_lighting: { field: "camera.treatment", statement: (c) => `${c}: specify plain, soft, natural daylight; avoid dramatic or stylised lighting.` },
  bad_environment: { field: "environment", statement: (c) => `${c}: choose simpler, more ordinary environments with fewer props.` },
  wrong_outfit: { field: "wardrobe.context", statement: (c) => `${c}: match the outfit more closely to the creator's everyday wardrobe and the scene's context.` },
  weak_charisma: { field: "expression.style", statement: (c) => `${c}: aim for a more engaged, warmer expression and direct eye contact.` },
  continuity: { field: "creative.treatment", statement: (c) => `${c}: restate wardrobe, setting and lighting identically across every frame of a carousel.` },
  personality_mismatch: { field: "creative.treatment", statement: (c) => `${c}: keep scenes consistent with the creator's stated personality and content pillars.` },
  anatomy: { field: "prompt.technique", statement: (c) => `${c}: avoid compositions where hands or limbs are prominent; keep hands out of frame or simple.` },
  unwanted_text: { field: "prompt.technique", statement: (c) => `${c}: avoid scenes with signage, menus or printed text.` },
};
export const IDENTITY_REASONS: RejectionReason[] = ["face_drift", "wrong_eyes", "wrong_body"];

export interface ProposedLearning extends Pick<Learning, "scope" | "creator" | "field" | "statement" | "state" | "confidence" | "evidenceCount" | "contradictedBy" | "approvedBy"> { reason: RejectionReason; evidenceProductions: string[] }
export interface ProposalReport { proposals: ProposedLearning[]; /** identity-related feedback: shown to a human, never turned into a learning */ identityFlags: { creator: string; reason: RejectionReason; productions: number }[]; insufficient: { creator: string; reason: RejectionReason; productions: number }[] }

/** Minimum DISTINCT productions before a pattern is even PROPOSED (a single rejection is an anecdote, not a pattern). */
export const MIN_EVIDENCE_TO_PROPOSE = 3;

/** PROPOSE: rule-based. Output is ALWAYS state PROPOSED, never approved, and every proposal passes the guard (allowlisted field, correct scope). */
export function propose(obs: Observation[]): ProposalReport {
  const proposals: ProposedLearning[] = [], identityFlags: ProposalReport["identityFlags"] = [], insufficient: ProposalReport["insufficient"] = [];
  const key = new Map<string, Set<string>>();
  for (const o of obs) if (o.outcome !== "APPROVED") for (const r of o.reasons) { const k = `${o.creator}|${r}`; key.set(k, (key.get(k) ?? new Set()).add(o.productionId)); }
  for (const [k, prods] of [...key].sort(([a], [b]) => a.localeCompare(b))) {
    const [creator, reason] = k.split("|") as [string, RejectionReason];
    if (IDENTITY_REASONS.includes(reason)) { identityFlags.push({ creator, reason, productions: prods.size }); continue; }
    const rule = REASON_FIELD[reason];
    if (!rule) continue;
    if (prods.size < MIN_EVIDENCE_TO_PROPOSE) { insufficient.push({ creator, reason, productions: prods.size }); continue; }
    const p: ProposedLearning = { scope: "creator", creator, field: rule.field, statement: rule.statement(creator), state: "PROPOSED", confidence: prods.size >= MIN_EVIDENCE_TO_SUPPORT ? "MEDIUM" : "LOW", evidenceCount: prods.size, contradictedBy: 0, approvedBy: null, reason, evidenceProductions: [...prods].sort() };
    try { validateNewLearning(p); assertLearnable(p.field); proposals.push(p); } catch (e) { if (!(e instanceof LearningViolation)) throw e; }
  }
  return { proposals, identityFlags, insufficient };
}
