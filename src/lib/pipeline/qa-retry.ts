// Bounded retry/backoff for transient (429/503/unavailable) vision-inspector failures.
// RULES: retries go to the SAME provider the router chose (never a silent fallback); non-transient errors are never retried;
// once retries are exhausted in a run, remaining assets in that run get a single attempt (provider is clearly down).
import type { QaRetryInfo } from "@/lib/db/records";
import type { VisionInspector, VisionOutcome, VisionRequest } from "./qa";

export interface RetryPolicy { maxAttempts: number; backoffMs: number[]; maxWaitMs: number; sleep: (ms: number) => Promise<void> }
export const defaultRetryPolicy = (): RetryPolicy => ({ maxAttempts: 3, backoffMs: [2000, 6000], maxWaitMs: 20_000, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
/** Run-scoped memory: after one asset exhausted its retries on a transient error, stop burning time retrying the rest of this run. */
export interface RetryRunState { providerDown: boolean }

export async function visionWithRetry(vision: VisionInspector, req: VisionRequest, policy: RetryPolicy = defaultRetryPolicy(), state: RetryRunState = { providerDown: false }): Promise<{ outcome: VisionOutcome; retry: QaRetryInfo | null }> {
  const errors: string[] = [];
  const max = state.providerDown ? 1 : Math.max(1, policy.maxAttempts);
  let outcome: VisionOutcome = { text: null, provider: null, model: null, error: "no attempt made" };
  let n = 0;
  while (n < max) {
    n++;
    outcome = await vision({ ...req, retryAttempt: n });
    if (outcome.text) break;
    if (outcome.error) errors.push(`attempt ${n}: ${outcome.error}`);
    if (!outcome.transient || n >= max) break;
    const wait = Math.min(outcome.retryAfterMs ?? policy.backoffMs[Math.min(n - 1, policy.backoffMs.length - 1)] ?? 2000, policy.maxWaitMs);
    await policy.sleep(wait);
  }
  const failedTransient = !outcome.text && !!outcome.transient;
  if (failedTransient && n >= max) state.providerDown = true;
  const retry: QaRetryInfo | null = n > 1 || failedTransient
    ? { attempts: n, maxAttempts: Math.max(1, policy.maxAttempts), transient: failedTransient || errors.length > 0, errors, exhausted: failedTransient, note: failedTransient ? (max === 1 && policy.maxAttempts > 1 ? "retries skipped: the provider already failed all retries earlier in this run" : `provider still unavailable after ${n} attempt(s)`) : `succeeded on attempt ${n}` }
    : null;
  return { outcome, retry };
}
