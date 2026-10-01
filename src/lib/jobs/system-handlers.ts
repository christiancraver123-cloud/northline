// Safe NON-PROVIDER test jobs for exercising the durable-job machinery. They never call a model, image provider or storage.
// system.noop completes; system.echo returns its input; system.flaky fails transiently until `succeedOnAttempt`; system.fail fails permanently;
// system.slow sleeps `ms` (lease / heartbeat tests); system.blocked raises a quota-class failure (BLOCKED).
import type { Handler } from "@/lib/agents/ops/handlers";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const SYSTEM_HANDLERS: Record<string, Handler> = {
  "system.noop": async () => ({ output: { ok: true }, summary: "no-op completed" }),
  "system.echo": async (c) => ({ output: { echo: c.task.input }, summary: "echoed input" }),
  "system.flaky": async (c) => {
    const ok = num(c.task.input.succeedOnAttempt, 2), n = c.task.attempts + 1; // c.task is the pre-claim snapshot
    if (n < ok) throw new Error(`temporary failure: unavailable (attempt ${n}, succeeds on ${ok})`);
    return { output: { attempt: n }, summary: `succeeded on attempt ${n}` };
  },
  "system.fail": async () => { throw new Error("validation failed: deliberate permanent failure"); },
  "system.blocked": async () => { throw new Error("quota exhausted: deliberate blocked test"); },
  "system.slow": async (c) => { await new Promise((r) => setTimeout(r, Math.min(num(c.task.input.ms, 50), 60_000))); return { output: { slept: true }, summary: "slow job done" }; },
};
