// GovernorStore over the Repo boundary (budget_counters / budget_limits / system_flags). Counters use repo.claim (compare-and-set), so concurrent
// workers on Supabase cannot jointly exceed a cap; the unique (metric,scope,scope_key,window_key) index makes the first-insert race lose and retry.
import type { Repo } from "@/lib/db/repo";
import type { BudgetLimit, CounterRef, GovernorStore, PauseFlag } from "./types";

const PAUSE_KEY = "emergency_pause";
const sameRef = (r: CounterRef) => ({ metric: r.metric, scope: r.scope, scopeKey: r.scopeKey, windowKey: r.windowKey });

export class RepoGovernorStore implements GovernorStore {
  private chain: Promise<unknown> = Promise.resolve(); // in-process serialisation for first inserts (the file store has no unique index)
  constructor(private repo: Repo) {}

  async getPause(): Promise<PauseFlag> {
    const row = (await this.repo.list("systemFlags", { key: PAUSE_KEY }))[0];
    if (!row) throw new Error("system_flags.emergency_pause is missing (is migration 0007 applied?)"); // fail closed upstream
    return { enabled: row.enabled, reason: row.reason, setBy: row.setBy, setAt: row.setAt };
  }
  async setPause(p: PauseFlag) {
    const row = (await this.repo.list("systemFlags", { key: PAUSE_KEY }))[0];
    if (!row) throw new Error("system_flags.emergency_pause is missing (is migration 0007 applied?)");
    await this.repo.update("systemFlags", row.id, { enabled: p.enabled, reason: p.reason, setBy: p.setBy, setAt: p.setAt ?? new Date().toISOString() });
  }
  async listLimits(): Promise<BudgetLimit[]> {
    return (await this.repo.list("budgetLimits")).map((l) => ({ scope: l.scope, scopeKey: l.scopeKey, metric: l.metric, limitValue: l.limitValue, enabled: l.enabled }));
  }
  async getUsed(ref: CounterRef) { return (await this.repo.list("budgetCounters", sameRef(ref)))[0]?.used ?? 0; }

  async incrementIfBelow(ref: CounterRef, limit: number): Promise<{ ok: boolean; used: number }> {
    for (let i = 0; i < 200; i++) {
      const row = (await this.repo.list("budgetCounters", sameRef(ref)))[0];
      if (!row) {
        if (limit < 1) return { ok: false, used: 0 };
        const made = await this.insertFirst(ref);
        if (made) return { ok: true, used: 1 };
        continue; // lost the creation race: re-read and CAS
      }
      if (row.used >= limit) return { ok: false, used: row.used };
      const won = await this.repo.claim("budgetCounters", row.id, { used: row.used }, { used: row.used + 1 });
      if (won) return { ok: true, used: row.used + 1 };
    }
    throw new Error("budget counter contention: could not reserve (fail closed)");
  }
  private insertFirst(ref: CounterRef): Promise<boolean> {
    const run = this.chain.then(async () => {
      if ((await this.repo.list("budgetCounters", sameRef(ref)))[0]) return false;
      try { await this.repo.insert("budgetCounters", { ...sameRef(ref), used: 1 }); return true; } catch { return false; } // unique violation on another process
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
  async decrement(ref: CounterRef) {
    for (let i = 0; i < 200; i++) {
      const row = (await this.repo.list("budgetCounters", sameRef(ref)))[0];
      if (!row || row.used <= 0) return;
      if (await this.repo.claim("budgetCounters", row.id, { used: row.used }, { used: row.used - 1 })) return;
    }
    throw new Error("budget counter contention: could not release");
  }
}
