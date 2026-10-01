import type { BudgetLimit, CounterRef, GovernorStore, PauseFlag } from "./types";

/** In-memory GovernorStore for tests. incrementIfBelow is a read-then-conditional-write with an artificial yield between them, so tests prove the
 *  protocol (not JavaScript's single thread) keeps concurrent callers within the cap: the write is a compare-and-set on the value that was read. */
export class MemoryGovernorStore implements GovernorStore {
  pause: PauseFlag = { enabled: false, reason: null, setBy: null, setAt: null };
  limits: BudgetLimit[] = [];
  counters = new Map<string, number>();
  failReads = false;
  private key = (r: CounterRef) => `${r.metric}|${r.scope}|${r.scopeKey}|${r.windowKey}`;
  async getPause() { if (this.failReads) throw new Error("db down"); return this.pause; }
  async setPause(p: PauseFlag) { this.pause = p; }
  async listLimits() { if (this.failReads) throw new Error("db down"); return this.limits; }
  async getUsed(r: CounterRef) { return this.counters.get(this.key(r)) ?? 0; }
  async incrementIfBelow(r: CounterRef, limit: number) {
    for (let tries = 0; tries < 1000; tries++) {
      const cur = this.counters.get(this.key(r)) ?? 0;
      if (cur >= limit) return { ok: false, used: cur };
      await Promise.resolve(); // yield: other callers interleave here
      if ((this.counters.get(this.key(r)) ?? 0) === cur) { this.counters.set(this.key(r), cur + 1); return { ok: true, used: cur + 1 }; } // CAS succeeded
      // CAS lost: re-read and retry
    }
    throw new Error("contention");
  }
  async decrement(r: CounterRef) { this.counters.set(this.key(r), Math.max(0, (this.counters.get(this.key(r)) ?? 0) - 1)); }
}
