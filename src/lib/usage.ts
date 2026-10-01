// Usage summary from persisted records. Usage (units) is always known; price is NOT invented: dollars appear only when records carry a real cost.
import type { AgentTask, LlmCall, ProviderJob } from "@/lib/db/records";

export interface UsageSummary {
  sinceIso: string;
  images: { succeeded: number; failed: number; inputTokens: number; imageInputTokens: number; textInputTokens: number; outputTokens: number; withUsage: number };
  llm: { calls: number; ok: number; failed: number; skipped: number; tokens: number; tokensKnownFor: number };
  tasks: { complete: number; failed: number };
  costUsd: number | null; // null = unknown (no record carried a cost)
  costNote: string;
}
type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { image_tokens?: number; text_tokens?: number } };

export function summarizeUsage(input: { jobs: ProviderJob[]; llmCalls: LlmCall[]; tasks: AgentTask[]; since: Date }): UsageSummary {
  const since = input.since.toISOString();
  const jobs = input.jobs.filter((j) => (j.finishedAt ?? j.createdAt) >= since && j.operation.startsWith("image"));
  const images = { succeeded: 0, failed: 0, inputTokens: 0, imageInputTokens: 0, textInputTokens: 0, outputTokens: 0, withUsage: 0 };
  let cost = 0, costKnown = false;
  for (const j of jobs) {
    if (j.state === "SUCCEEDED") images.succeeded++; else if (j.state === "FAILED") images.failed++;
    const u = (j.metadata as { usage?: Usage } | undefined)?.usage;
    if (u) { images.withUsage++; images.inputTokens += u.input_tokens ?? 0; images.outputTokens += u.output_tokens ?? 0; images.imageInputTokens += u.input_tokens_details?.image_tokens ?? 0; images.textInputTokens += u.input_tokens_details?.text_tokens ?? 0; }
    if (j.costUsd != null) { cost += j.costUsd; costKnown = true; }
  }
  const calls = input.llmCalls.filter((c) => c.startedAt >= since);
  const llm = { calls: 0, ok: 0, failed: 0, skipped: 0, tokens: 0, tokensKnownFor: 0 };
  for (const c of calls) {
    if (c.status === "SKIPPED") { llm.skipped++; continue; }
    llm.calls++; if (c.status === "COMPLETE") llm.ok++; else llm.failed++;
    if (c.totalTokens != null) { llm.tokens += c.totalTokens; llm.tokensKnownFor++; }
    if (c.costUsd != null) { cost += c.costUsd; costKnown = true; }
  }
  const tasks = input.tasks.filter((t) => (t.finishedAt ?? t.createdAt) >= since);
  return { sinceIso: since, images, llm, tasks: { complete: tasks.filter((t) => t.status === "COMPLETE").length, failed: tasks.filter((t) => t.status === "FAILED").length }, costUsd: costKnown ? cost : null, costNote: costKnown ? "sum of recorded costs only" : "unknown — no pricing configuration, so no dollar figure is stated" };
}
