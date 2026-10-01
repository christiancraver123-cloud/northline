// Budget governor, tested IN ISOLATION: pure rules, the atomic reservation protocol, and the proposed migration against embedded Postgres.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { MemoryGovernorStore } from "./memory-store";
import { budgetStatus, checkAttempts, checkPause, dayKey, nextReset, releaseImage, reserveImage, shouldRelease } from "./governor";
import type { BudgetLimit, CounterRef, GovernorStore, PauseFlag } from "./types";

const lim = (scope: BudgetLimit["scope"], scopeKey: string, metric: BudgetLimit["metric"], limitValue: number, enabled = true): BudgetLimit => ({ scope, scopeKey, metric, limitValue, enabled });
const NOW = new Date("2026-10-01T10:00:00Z");
const noEnv = {};
const mem = (limits: BudgetLimit[]) => { const s = new MemoryGovernorStore(); s.limits = limits; return s; };

describe("emergency pause", () => {
  it("blocks when the DB flag is on, with the reason and who set it", async () => {
    const s = mem([]); await s.setPause({ enabled: true, reason: "runaway retries", setBy: "operator", setAt: NOW.toISOString() });
    const d = await checkPause(s, noEnv);
    expect(d).toMatchObject({ allowed: false, code: "EMERGENCY_PAUSE" });
    expect((d as { reason: string }).reason).toMatch(/runaway retries.*operator/);
  });
  it("the env override always wins and cannot be lifted from the database", async () => {
    const s = mem([]); await s.setPause({ enabled: false, reason: null, setBy: null, setAt: null });
    expect(await checkPause(s, { NORTHLINE_PAUSE: "true" })).toMatchObject({ allowed: false, code: "EMERGENCY_PAUSE" });
    expect(await checkPause(s, { NORTHLINE_PAUSE: "false" })).toEqual({ allowed: true });
  });
  it("fails CLOSED when the governor state cannot be read", async () => {
    const s = mem([]); s.failReads = true;
    expect(await checkPause(s, noEnv)).toMatchObject({ allowed: false, code: "GOVERNOR_UNAVAILABLE" });
    const r = await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    expect(r.decision).toMatchObject({ allowed: false, code: "GOVERNOR_UNAVAILABLE" }); expect(r.reservation).toBeNull();
  });
  it("a paused system reserves nothing", async () => {
    const s = mem([lim("global", "", "images_per_day", 5)]); await s.setPause({ enabled: true, reason: null, setBy: null, setAt: null });
    const r = await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    expect(r.decision.allowed).toBe(false); expect(s.counters.size).toBe(0);
  });
});

describe("attempt caps (lifetime, derived from existing rows)", () => {
  const limits = [lim("global", "", "attempts_per_asset", 4), lim("global", "", "attempts_per_production", 5)];
  it("allows up to the cap and blocks at it, naming which cap", () => {
    expect(checkAttempts(limits, { attemptsForAsset: 3, attemptsForProduction: 4 })).toEqual({ allowed: true });
    expect(checkAttempts(limits, { attemptsForAsset: 4, attemptsForProduction: 4 })).toMatchObject({ allowed: false, code: "ATTEMPTS_PER_ASSET", limit: 4, used: 4 });
    expect(checkAttempts(limits, { attemptsForAsset: 2, attemptsForProduction: 5 })).toMatchObject({ allowed: false, code: "ATTEMPTS_PER_PRODUCTION" });
  });
  it("a disabled or missing limit is ignored", () => {
    expect(checkAttempts([lim("global", "", "attempts_per_asset", 1, false)], { attemptsForAsset: 9, attemptsForProduction: 9 })).toEqual({ allowed: true });
    expect(checkAttempts([], { attemptsForAsset: 9, attemptsForProduction: 9 })).toEqual({ allowed: true });
  });
});

describe("daily image caps", () => {
  const limits = [lim("global", "", "images_per_day", 6), lim("provider", "openai", "images_per_day", 5), lim("creator", "SIE", "images_per_day", 2), lim("creator", "ALE", "images_per_day", 9)];
  it("enforces creator, provider and global caps and reports the scope that stopped it", async () => {
    const s = mem(limits);
    const go = (creator: string, provider = "openai") => reserveImage(s, { creator, provider, now: NOW }, noEnv);
    expect((await go("SIE")).decision.allowed).toBe(true);
    expect((await go("SIE")).decision.allowed).toBe(true);
    const third = await go("SIE");
    expect(third.decision).toMatchObject({ allowed: false, code: "IMAGES_PER_DAY", scope: "creator", scopeKey: "SIE", limit: 2, used: 2, resetsAt: "2026-10-02T00:00:00.000Z" });
    expect((third.decision as { reason: string }).reason).toMatch(/creator SIE.*2\/2.*Resets/);
    for (let i = 0; i < 3; i++) expect((await go("ALE")).decision.allowed).toBe(true); // 2 + 3 = 5 = provider cap
    expect(await go("ALE")).toMatchObject({ decision: { allowed: false, scope: "provider", scopeKey: "openai" } });
  });
  it("is all-or-nothing: a refusal at a later scope rolls back counters taken at earlier scopes", async () => {
    const s = mem([lim("global", "", "images_per_day", 10), lim("creator", "SIE", "images_per_day", 1)]);
    await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    const r = await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    expect(r.decision.allowed).toBe(false);
    expect(await s.getUsed({ metric: "images_per_day", scope: "global", scopeKey: "", windowKey: dayKey(NOW) })).toBe(1); // not 2
  });
  it("CONCURRENT workers can never jointly exceed a cap", async () => {
    const s = mem([lim("global", "", "images_per_day", 10), lim("creator", "SIE", "images_per_day", 7)]);
    const out = await Promise.all(Array.from({ length: 40 }, () => reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv)));
    expect(out.filter((o) => o.decision.allowed)).toHaveLength(7);
    expect(await s.getUsed({ metric: "images_per_day", scope: "creator", scopeKey: "SIE", windowKey: dayKey(NOW) })).toBe(7);
    expect(await s.getUsed({ metric: "images_per_day", scope: "global", scopeKey: "", windowKey: dayKey(NOW) })).toBe(7); // refused requests left no residue
  });
  it("window semantics: a new UTC day starts a fresh counter and the old day is kept", async () => {
    const s = mem([lim("global", "", "images_per_day", 1)]);
    expect((await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv)).decision.allowed).toBe(true);
    expect((await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv)).decision.allowed).toBe(false);
    const tomorrow = new Date("2026-10-02T00:00:01Z");
    expect((await reserveImage(s, { creator: "SIE", provider: "openai", now: tomorrow }, noEnv)).decision.allowed).toBe(true);
    expect(await s.getUsed({ metric: "images_per_day", scope: "global", scopeKey: "", windowKey: "2026-10-01" })).toBe(1); // history kept
    expect(nextReset(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
  it("a non-billable failure releases the reservation; timeouts/unknown stay counted", async () => {
    const s = mem([lim("global", "", "images_per_day", 1)]);
    const r = await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    expect(shouldRelease("quota_exceeded") && shouldRelease("auth") && shouldRelease("provider_unavailable") && shouldRelease("rate_limited") && shouldRelease("invalid_request")).toBe(true);
    expect(shouldRelease("timeout") || shouldRelease("unknown") || shouldRelease(null) || shouldRelease(undefined)).toBe(false);
    await releaseImage(s, r.reservation);
    expect((await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv)).decision.allowed).toBe(true);
    await releaseImage(s, null); // no-op
  });
  it("operator-visible status shows pause, limits, usage today and the reset time", async () => {
    const s = mem([lim("global", "", "images_per_day", 3), lim("global", "", "attempts_per_asset", 4)]);
    await reserveImage(s, { creator: "SIE", provider: "openai", now: NOW }, noEnv);
    const st = await budgetStatus(s, NOW, noEnv);
    expect(st.paused).toBe(false);
    expect(st.limits).toEqual([
      { scope: "global", scopeKey: "", metric: "images_per_day", limit: 3, used: 1, remaining: 2, resetsAt: "2026-10-02T00:00:00.000Z", enabled: true },
      { scope: "global", scopeKey: "", metric: "attempts_per_asset", limit: 4, used: null, remaining: null, resetsAt: null, enabled: true },
    ]);
    expect((await budgetStatus(s, NOW, { NORTHLINE_PAUSE: "true" })).envOverride).toBe(true);
  });
});

// ---- the proposed migration, applied after 0001-0006 on embedded Postgres ----
const dir = path.join(process.cwd(), "supabase", "migrations");
async function migrated() {
  const db = new PGlite();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.exec(fs.readFileSync(path.join(process.cwd(), "docs", "design", "proposed-migrations", "0007_budget_governor.sql"), "utf8"));
  return db;
}
/** The port implemented with REAL SQL: the compare-and-set is UPDATE ... WHERE used = <value read>. */
class SqlGovernorStore implements GovernorStore {
  constructor(private db: PGlite) {}
  async getPause(): Promise<PauseFlag> { const r = (await this.db.query<{ enabled: boolean; reason: string | null; set_by: string | null }>("select enabled, reason, set_by from system_flags where key='emergency_pause'")).rows[0]; return { enabled: r.enabled, reason: r.reason, setBy: r.set_by, setAt: null }; }
  async setPause(p: PauseFlag) { await this.db.query("update system_flags set enabled=$1, reason=$2, set_by=$3, set_at=now(), updated_at=now() where key='emergency_pause'", [p.enabled, p.reason, p.setBy]); }
  async listLimits() { return (await this.db.query<{ scope: BudgetLimit["scope"]; scope_key: string; metric: BudgetLimit["metric"]; limit_value: number; enabled: boolean }>("select scope, scope_key, metric, limit_value, enabled from budget_limits")).rows.map((r) => ({ scope: r.scope, scopeKey: r.scope_key, metric: r.metric, limitValue: r.limit_value, enabled: r.enabled })); }
  private async row(r: CounterRef) { return (await this.db.query<{ id: string; used: number }>("select id, used from budget_counters where metric=$1 and scope=$2 and scope_key=$3 and window_key=$4", [r.metric, r.scope, r.scopeKey, r.windowKey])).rows[0]; }
  async getUsed(r: CounterRef) { return (await this.row(r))?.used ?? 0; }
  async incrementIfBelow(r: CounterRef, limit: number) {
    for (let i = 0; i < 100; i++) {
      let row = await this.row(r);
      if (!row) { await this.db.query("insert into budget_counters (metric, scope, scope_key, window_key, used) values ($1,$2,$3,$4,0) on conflict do nothing", [r.metric, r.scope, r.scopeKey, r.windowKey]); row = await this.row(r); }
      if (row!.used >= limit) return { ok: false, used: row!.used };
      const won = await this.db.query("update budget_counters set used = used + 1, updated_at = now() where id = $1 and used = $2 returning used", [row!.id, row!.used]);
      if (won.rows.length) return { ok: true, used: (won.rows[0] as { used: number }).used };
    }
    throw new Error("contention");
  }
  async decrement(r: CounterRef) { await this.db.query("update budget_counters set used = greatest(used - 1, 0), updated_at = now() where metric=$1 and scope=$2 and scope_key=$3 and window_key=$4", [r.metric, r.scope, r.scopeKey, r.windowKey]); }
}

describe("proposed migration 0007 (embedded Postgres, NOT applied to live)", () => {
  it("applies cleanly after 0001-0006 and is additive: new tables + one nullable column, RLS on, safe defaults", async () => {
    const db = await migrated();
    const t = (await db.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name in ('system_flags','budget_limits','budget_counters')")).rows.map((r) => r.table_name).sort();
    expect(t).toEqual(["budget_counters", "budget_limits", "system_flags"]);
    const rls = (await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname in ('system_flags','budget_limits','budget_counters')")).rows;
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    expect((await db.query("select enabled from system_flags where key='emergency_pause'")).rows).toEqual([{ enabled: false }]); // OFF by default
    const col = (await db.query<{ is_nullable: string }>("select is_nullable from information_schema.columns where table_name='agent_tasks' and column_name='blocked_reason'")).rows;
    expect(col).toEqual([{ is_nullable: "YES" }]);
    expect((await db.query("select count(*)::int as n from budget_limits")).rows[0]).toEqual({ n: 10 });
  });
  it("enforces its invariants: scope/scope_key pairing, known metrics, uniqueness, non-negative values", async () => {
    const db = await migrated();
    const ins = (scope: string, key: string, metric: string, v: number) => db.query("insert into budget_limits (scope, scope_key, metric, limit_value) values ($1,$2,$3,$4)", [scope, key, metric, v]);
    await expect(ins("global", "SIE", "images_per_day", 1)).rejects.toThrow(); // global must have empty key
    await expect(ins("creator", "", "images_per_day", 1)).rejects.toThrow(); // creator needs a key
    await expect(ins("global", "", "bogus_metric", 1)).rejects.toThrow();
    await expect(ins("global", "", "images_per_day", 1)).rejects.toThrow(); // duplicate of a seeded row
    await expect(ins("provider", "higgsfield", "images_per_day", -1)).rejects.toThrow();
    await ins("provider", "higgsfield", "images_per_day", 3); // a valid new row works
    await expect(db.query("insert into budget_counters (metric, scope, scope_key, window_key, used) values ('images_per_day','global','','2026-10-01',-1)")).rejects.toThrow();
  });
  it("the reservation protocol holds on real Postgres: 40 concurrent workers, caps 10 global / 7 creator -> exactly 7 granted, no residue", async () => {
    const db = await migrated();
    await db.query("update budget_limits set limit_value = 10 where scope='global' and metric='images_per_day'");
    await db.query("update budget_limits set limit_value = 7 where scope='creator' and scope_key='SIE'");
    const store = new SqlGovernorStore(db);
    const out = await Promise.all(Array.from({ length: 40 }, () => reserveImage(store, { creator: "SIE", provider: "openai", now: NOW }, noEnv)));
    expect(out.filter((o) => o.decision.allowed)).toHaveLength(7);
    const used = (scope: string, key: string) => db.query<{ used: number }>("select used from budget_counters where scope=$1 and scope_key=$2 and window_key='2026-10-01'", [scope, key]).then((r) => r.rows[0]?.used as number | undefined);
    expect(await used("creator", "SIE")).toBe(7);
    expect(await used("global", "")).toBe(7);
    expect(await used("provider", "openai")).toBe(7);
  });
  it("emergency pause stored in the database blocks reservations; a new window is a new row", async () => {
    const db = await migrated(); const store = new SqlGovernorStore(db);
    await store.setPause({ enabled: true, reason: "test", setBy: "operator", setAt: null });
    expect((await reserveImage(store, { creator: "SIE", provider: "openai", now: NOW }, noEnv)).decision).toMatchObject({ allowed: false, code: "EMERGENCY_PAUSE" });
    await store.setPause({ enabled: false, reason: null, setBy: null, setAt: null });
    expect((await reserveImage(store, { creator: "SIE", provider: "openai", now: NOW }, noEnv)).decision.allowed).toBe(true);
    expect((await reserveImage(store, { creator: "SIE", provider: "openai", now: new Date("2026-10-02T01:00:00Z") }, noEnv)).decision.allowed).toBe(true);
    expect((await db.query("select count(*)::int as n from budget_counters where scope='global'")).rows[0]).toEqual({ n: 2 }); // two windows kept
  });
  it("is NOT in supabase/migrations (cannot be applied by accident)", () => {
    expect(fs.readdirSync(dir).some((f) => f.includes("budget"))).toBe(false);
  });
});
