// Budget governor — ISOLATED LIBRARY (not wired into the pipeline yet). See docs/design/budget-governor.md and
// docs/design/proposed-migrations/0007_budget_governor.sql. Counts only: no pricing needed, so every limit is enforceable today.
export type Metric = "images_per_day" | "attempts_per_asset" | "attempts_per_production";
export type Scope = "global" | "creator" | "provider";

export interface BudgetLimit { scope: Scope; scopeKey: string; metric: Metric; limitValue: number; enabled: boolean }
export interface PauseFlag { enabled: boolean; reason: string | null; setBy: string | null; setAt: string | null }
export interface CounterRef { metric: Metric; scope: Scope; scopeKey: string; windowKey: string }

/** Why a request was refused. `code` is machine-readable (stored as blocked_reason / failure_category='budget_blocked'); `reason` is operator text. */
export type BlockCode = "EMERGENCY_PAUSE" | "IMAGES_PER_DAY" | "ATTEMPTS_PER_ASSET" | "ATTEMPTS_PER_PRODUCTION" | "GOVERNOR_UNAVAILABLE";
export type Decision = { allowed: true } | { allowed: false; code: BlockCode; reason: string; scope?: Scope; scopeKey?: string; limit?: number; used?: number; resetsAt?: string | null };

/** Persistence port. The Supabase implementation uses repo.claim (compare-and-set) on budget_counters; tests use MemoryGovernorStore. */
export interface GovernorStore {
  getPause(): Promise<PauseFlag>;
  setPause(p: PauseFlag): Promise<void>;
  listLimits(): Promise<BudgetLimit[]>;
  /** Current counter value (0 if the row does not exist). */
  getUsed(ref: CounterRef): Promise<number>;
  /** Atomically add 1 iff used < limit. Returns whether it was applied and the resulting value. MUST be safe under concurrent callers. */
  incrementIfBelow(ref: CounterRef, limit: number): Promise<{ ok: boolean; used: number }>;
  /** Atomically subtract 1 (never below 0). */
  decrement(ref: CounterRef): Promise<void>;
}

export interface ImageRequest { creator: string; provider: string; now?: Date }
export interface Reservation { refs: CounterRef[]; at: string }
