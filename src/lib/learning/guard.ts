// Learning-memory guard — ISOLATED LIBRARY (not wired yet; see docs/design/learning-memory.md).
// The rule that makes "self-improving" safe: learning can only touch an ALLOWLISTED creative field, never an immutable one, and a learning
// only becomes applicable through evidence + (for strategy changes) a human. Deny-by-default.

/** Fields learning may influence. Anything not listed here is rejected. */
export const LEARNABLE_FIELDS = [
  "camera.treatment", "composition", "content.format", "posting.cadence", "caption.hook", "caption.style", "wardrobe.context", "environment", "expression.style",
  "content.pillar", "carousel.length", "reel.duration", "thumbnail.approach", "story.strategy", "prompt.technique", "reference.strategy", "creative.treatment",
] as const;
export type LearnableField = (typeof LEARNABLE_FIELDS)[number];

/** Never learnable, by prefix. Listed explicitly (in addition to deny-by-default) so a future allowlist edit cannot silently include them. */
export const IMMUTABLE_PREFIXES = [
  "identity", "canonical", "face", "body", "age", "permanent_marker", "references", "character_history", "disclosure", "safety", "spending", "budget", "limits", "approval", "human_approval", "source_code", "code",
] as const;

export class LearningViolation extends Error {}

export function assertLearnable(field: string): asserts field is LearnableField {
  const f = field.trim().toLowerCase();
  if (IMMUTABLE_PREFIXES.some((p) => f === p || f.startsWith(`${p}.`) || f.startsWith(`${p}_`))) throw new LearningViolation(`"${field}" is immutable: learning may never change it.`);
  if (!(LEARNABLE_FIELDS as readonly string[]).includes(f)) throw new LearningViolation(`"${field}" is not an allowlisted learnable field.`);
}

export type LearningState = "PROPOSED" | "TESTING" | "SUPPORTED" | "ACTIVE" | "RETIRED";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export interface Learning {
  id: string; scope: "creator" | "global"; creator: string | null; field: string; statement: string; state: LearningState; confidence: Confidence;
  evidenceCount: number; /** independent productions/posts supporting it */ contradictedBy: number; approvedBy: string | null;
}

/** Minimum independent evidence before a learning may be SUPPORTED. One post never creates a rule. */
export const MIN_EVIDENCE_TO_SUPPORT = 5;

const NEXT: Record<LearningState, LearningState[]> = { PROPOSED: ["TESTING", "RETIRED"], TESTING: ["SUPPORTED", "RETIRED"], SUPPORTED: ["ACTIVE", "RETIRED"], ACTIVE: ["RETIRED"], RETIRED: [] };
export function canTransition(l: Pick<Learning, "state" | "evidenceCount" | "confidence" | "approvedBy" | "contradictedBy">, to: LearningState): { ok: true } | { ok: false; why: string } {
  if (!NEXT[l.state].includes(to)) return { ok: false, why: `${l.state} → ${to} is not allowed` };
  if (to === "SUPPORTED") {
    if (l.evidenceCount < MIN_EVIDENCE_TO_SUPPORT) return { ok: false, why: `needs at least ${MIN_EVIDENCE_TO_SUPPORT} independent pieces of evidence (has ${l.evidenceCount}); one post never creates a rule` };
    if (l.confidence === "LOW") return { ok: false, why: "confidence is LOW" };
    if (l.contradictedBy >= l.evidenceCount) return { ok: false, why: "contradicting evidence is at least as strong" };
  }
  if (to === "ACTIVE" && !l.approvedBy) return { ok: false, why: "a human must approve before a learning becomes ACTIVE" };
  return { ok: true };
}

export function validateNewLearning(l: Pick<Learning, "scope" | "creator" | "field" | "statement">): void {
  assertLearnable(l.field);
  if (l.scope === "creator" && !l.creator) throw new LearningViolation("a creator-scoped learning needs a creator");
  if (l.scope === "global" && l.creator) throw new LearningViolation("a global learning must not name a creator");
  if (!l.statement.trim()) throw new LearningViolation("a learning needs a statement");
}

/** The only way learnings reach a prompt: ACTIVE ones, for this creator or global, on a still-allowlisted field. Never returns anything else. */
export function applicableLearnings(all: Learning[], creator: string): Learning[] {
  return all.filter((l) => {
    if (l.state !== "ACTIVE") return false;
    if (!(l.scope === "global" || l.creator === creator)) return false;
    try { assertLearnable(l.field); return true; } catch { return false; } // defence in depth: a bad row can never be applied
  });
}
