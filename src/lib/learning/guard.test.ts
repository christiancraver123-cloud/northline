import { describe, expect, it } from "vitest";
import { IMMUTABLE_PREFIXES, LEARNABLE_FIELDS, LearningViolation, MIN_EVIDENCE_TO_SUPPORT, applicableLearnings, assertLearnable, canTransition, validateNewLearning, type Learning } from "./guard";

const L = (o: Partial<Learning> = {}): Learning => ({ id: "l1", scope: "creator", creator: "SIE", field: "composition", statement: "friend-shot candid framing is approved more often than centered walking", state: "ACTIVE", confidence: "MEDIUM", evidenceCount: 6, contradictedBy: 0, approvedBy: "operator", ...o });

describe("learning can never touch immutable fields", () => {
  it("rejects every identity / safety / money / approval / code field, including sub-paths", () => {
    for (const f of ["identity", "identity.eyes", "canonical.face", "face.shape", "body.proportions", "age", "permanent_marker.beauty_mark", "references.master", "character_history", "disclosure.ai_label", "safety.rules", "spending.limit", "budget.images_per_day", "limits", "approval.required", "human_approval", "source_code", "code.prompts", "Identity.Eyes", " canonical.hair "]) {
      expect(() => assertLearnable(f), f).toThrow(LearningViolation);
    }
  });
  it("is deny-by-default: unknown fields are rejected too", () => {
    expect(() => assertLearnable("something.new")).toThrow(/not an allowlisted/);
    expect(() => assertLearnable("")).toThrow();
  });
  it("accepts every allowlisted creative field", () => { for (const f of LEARNABLE_FIELDS) expect(() => assertLearnable(f)).not.toThrow(); });
  it("no allowlisted field starts with an immutable prefix (the lists can never overlap)", () => {
    for (const f of LEARNABLE_FIELDS) for (const p of IMMUTABLE_PREFIXES) { const s: string = f, q: string = p; expect(s === q || s.startsWith(`${q}.`) || s.startsWith(`${q}_`), `${f} vs ${p}`).toBe(false); }
  });
  it("a new learning on an immutable field cannot be created", () => {
    expect(() => validateNewLearning({ scope: "creator", creator: "SIE", field: "identity.eyes", statement: "make eyes bluer" })).toThrow(LearningViolation);
    expect(() => validateNewLearning({ scope: "creator", creator: "SIE", field: "composition", statement: "x" })).not.toThrow();
  });
  it("scope rules: creator-scoped needs a creator; global must not name one", () => {
    expect(() => validateNewLearning({ scope: "creator", creator: null, field: "composition", statement: "x" })).toThrow();
    expect(() => validateNewLearning({ scope: "global", creator: "SIE", field: "composition", statement: "x" })).toThrow();
    expect(() => validateNewLearning({ scope: "global", creator: null, field: "composition", statement: " " })).toThrow(/statement/);
  });
});

describe("evidence and approval gates", () => {
  it("one post never creates a rule: SUPPORTED needs enough independent evidence and non-LOW confidence", () => {
    expect(canTransition(L({ state: "TESTING", evidenceCount: 1 }), "SUPPORTED")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "TESTING", evidenceCount: MIN_EVIDENCE_TO_SUPPORT - 1 }), "SUPPORTED")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "TESTING", confidence: "LOW" }), "SUPPORTED")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "TESTING", evidenceCount: 6, contradictedBy: 6 }), "SUPPORTED")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "TESTING", evidenceCount: 6 }), "SUPPORTED")).toEqual({ ok: true });
  });
  it("ACTIVE requires a human approval; states cannot be skipped; RETIRED is terminal", () => {
    expect(canTransition(L({ state: "SUPPORTED", approvedBy: null }), "ACTIVE")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "SUPPORTED", approvedBy: "operator" }), "ACTIVE")).toEqual({ ok: true });
    expect(canTransition(L({ state: "PROPOSED" }), "ACTIVE")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "TESTING" }), "ACTIVE")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "RETIRED" }), "ACTIVE")).toMatchObject({ ok: false });
    expect(canTransition(L({ state: "ACTIVE" }), "RETIRED")).toEqual({ ok: true }); // contradicted learnings can be retired
  });
});

describe("what reaches a prompt", () => {
  it("only ACTIVE learnings, for this creator or global; a creator's learning never leaks to another creator", () => {
    const all = [L({ id: "a" }), L({ id: "b", state: "SUPPORTED" }), L({ id: "c", state: "PROPOSED" }), L({ id: "d", creator: "ALE" }), L({ id: "e", scope: "global", creator: null }), L({ id: "f", state: "RETIRED" })];
    expect(applicableLearnings(all, "SIE").map((x) => x.id).sort()).toEqual(["a", "e"]);
    expect(applicableLearnings(all, "ALE").map((x) => x.id).sort()).toEqual(["d", "e"]);
  });
  it("defence in depth: even a bad ACTIVE row on an immutable field is never applied", () => {
    expect(applicableLearnings([L({ id: "bad", field: "identity.eyes" }), L({ id: "bad2", field: "unknown.field" })], "SIE")).toEqual([]);
  });
});
