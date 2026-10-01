import { describe, expect, it } from "vitest";
import type { Approval, GenerationAttempt, Production } from "@/lib/db/records";
import { encodeDecisionNotes } from "@/lib/feedback/reasons";
import { compare, observe, propose, REASON_FIELD, IDENTITY_REASONS } from "./engine";
import { assertLearnable, canTransition, applicableLearnings, type Learning } from "./guard";

const P = (id: string, c = "SIE") => ({ id, code: id, talent: [c] }) as Production;
let n = 0;
const A = (pid: string, state: Approval["state"], reasons: string[] = [], by = "operator"): Approval => ({ id: `a${n++}`, productionId: pid, state, decidedBy: by, decidedAt: "2026-10-01T10:00:00Z", notes: encodeDecisionNotes(reasons, "n") }) as Approval;
const att = (pid: string, no: number) => ({ productionId: pid, attemptNo: no }) as GenerationAttempt;

describe("learning engine (advisory only)", () => {
  it("observe: only decided human approvals count; system supersession and pending are ignored", () => {
    const o = observe([A("p1", "REJECTED", ["too_posed"]), A("p2", "PENDING" as never), A("p3", "REVISION_REQUESTED", [], "system"), A("p4", "APPROVED")], [P("p1"), P("p2"), P("p3"), P("p4")]);
    expect(o.map((x) => x.productionId)).toEqual(["p1", "p4"]);
    expect(o[0].reasons).toEqual(["too_posed"]);
  });
  it("compare: rates are null when there is no data; counts distinct productions per reason", () => {
    expect(compare([], [])).toEqual([]);
    const ps = ["p1", "p2", "p3"].map((x) => P(x));
    const o = observe([A("p1", "REJECTED", ["too_posed", "looks_ai"]), A("p1", "REJECTED", ["too_posed"]), A("p2", "APPROVED"), A("p3", "REJECTED", ["too_posed"])], ps);
    const [s] = compare(o, [att("p1", 1), att("p1", 2), att("p2", 1)]);
    expect(s).toMatchObject({ creator: "SIE", decided: 4, approved: 1, rejected: 3, approvalRate: 0.25, firstPassApprovals: 1, regenerations: 1 });
    expect(s.reasons[0]).toMatchObject({ code: "too_posed", productions: 2 });
  });
  it("propose: needs >=3 DISTINCT productions; one production repeated is not a pattern", () => {
    const same = observe([1, 2, 3, 4].map(() => A("p1", "REJECTED", ["too_posed"])), [P("p1")]);
    const r1 = propose(same);
    expect(r1.proposals).toEqual([]); expect(r1.insufficient).toEqual([{ creator: "SIE", reason: "too_posed", productions: 1 }]);
    const ps = ["p1", "p2", "p3"].map((x) => P(x));
    const r2 = propose(observe(ps.map((p) => A(p.id, "REJECTED", ["too_posed"])), ps));
    expect(r2.proposals).toHaveLength(1);
    expect(r2.proposals[0]).toMatchObject({ state: "PROPOSED", approvedBy: null, scope: "creator", creator: "SIE", field: "expression.style", evidenceCount: 3, confidence: "LOW" });
  });
  it("identity reasons are flagged for a human and NEVER become learnings", () => {
    const ps = ["p1", "p2", "p3", "p4", "p5", "p6"].map((x) => P(x));
    const r = propose(observe(ps.map((p, i) => A(p.id, "REJECTED", [IDENTITY_REASONS[i % 3]])), ps));
    expect(r.proposals).toEqual([]); expect(r.identityFlags.length).toBe(3);
    for (const k of IDENTITY_REASONS) expect(REASON_FIELD[k]).toBeUndefined();
  });
  it("every proposable field passes the guard; no proposal is ever above PROPOSED; creators never mix", () => {
    for (const rule of Object.values(REASON_FIELD)) expect(() => assertLearnable(rule!.field)).not.toThrow();
    const ps = ["a", "b", "c"].map((x, i) => P(x, i === 2 ? "VES" : "SIE"));
    const r = propose(observe(ps.map((p) => A(p.id, "REJECTED", ["bad_lighting"])), ps));
    expect(r.proposals).toEqual([]); // 2 SIE + 1 VES: evidence is per creator
    expect(applicableLearnings(r.proposals as unknown as Learning[], "SIE")).toEqual([]); // PROPOSED is never applicable
  });
  it("a proposal cannot become ACTIVE without evidence, confidence and a named human", () => {
    const l = { state: "SUPPORTED" as const, evidenceCount: 5, confidence: "MEDIUM" as const, approvedBy: null, contradictedBy: 0 };
    expect(canTransition(l, "ACTIVE").ok).toBe(false);
    expect(canTransition({ ...l, approvedBy: "operator" }, "ACTIVE").ok).toBe(true);
  });
});

describe("proposed learning schema (docs/design/proposed-migrations/0009)", () => {
  it("applies cleanly after 0001-0008 and enforces the allowlist, ACTIVE-needs-human and per-production evidence", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const fs = await import("node:fs"), path = await import("node:path");
    const mig = path.join(process.cwd(), "supabase", "migrations"), db = new PGlite();
    for (const f of fs.readdirSync(mig).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(mig, f), "utf8"));
    await db.exec(fs.readFileSync(path.join(process.cwd(), "docs", "design", "proposed-migrations", "0009_learning_memory.sql"), "utf8"));
    const ins = (field: string, o: { state?: string; approved?: string | null; scope?: string; creator?: string | null } = {}) =>
      db.query("insert into learnings (scope, creator, field, statement, state, approved_by) values ($1,$2,$3,'s',$4,$5) returning id", [o.scope ?? "creator", o.creator === undefined ? "SIE" : o.creator, field, o.state ?? "PROPOSED", o.approved ?? null]);
    await ins("expression.style");
    await expect(ins("identity.face")).rejects.toThrow(); // immutable / non-allowlisted field
    await expect(ins("budget.limits")).rejects.toThrow();
    await expect(ins("expression.style", { state: "ACTIVE" })).rejects.toThrow(); // ACTIVE without a human
    await ins("expression.style", { state: "ACTIVE", approved: "operator" });
    await expect(ins("expression.style", { scope: "creator", creator: null })).rejects.toThrow();
    const l = await ins("environment");
    await db.query("insert into learning_evidence (learning_id, production_id) values ($1,'p1')", [l.rows[0] && (l.rows[0] as { id: string }).id]);
    await expect(db.query("insert into learning_evidence (learning_id, production_id) values ($1,'p1')", [(l.rows[0] as { id: string }).id])).rejects.toThrow();
  });
});
