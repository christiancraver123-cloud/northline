// Loads the rows the Command Center needs and builds the view-model. Read-only; never calls a provider. A failed governor read becomes UNKNOWN, never a guess.
import type { Repo } from "@/lib/db/repo";
import { deriveProviderHealth } from "@/lib/llm/health-derived";
import { budgetStatus } from "@/lib/governor/governor";
import { RepoGovernorStore } from "@/lib/governor/repo-store";
import { governorEnabled } from "@/lib/governor/service";
import { buildCommandCenter, type CommandCenter, type CommandCenterInput } from "./command-center";

export async function loadCommandCenter(repo: Repo, now = new Date()): Promise<CommandCenter> {
  const [tasks, jobs, llmCalls, productions, approvals, runs] = await Promise.all([repo.list("agentTasks"), repo.list("providerJobs"), repo.list("llmCalls"), repo.list("productions"), repo.list("approvals", { state: "PENDING" }), repo.list("agentRuns")]);
  let budgetLimits: CommandCenterInput["budgetLimits"] = null, dbPause: CommandCenterInput["dbPause"] = null;
  if (governorEnabled()) {
    try { const s = await budgetStatus(new RepoGovernorStore(repo), now); budgetLimits = s.limits; dbPause = { enabled: s.pause.enabled, reason: s.pause.reason }; } catch { budgetLimits = "error"; dbPause = "error"; }
  }
  const lastRunAt = runs.reduce<string | null>((m, r) => (!m || r.startedAt > m ? r.startedAt : m), null);
  return buildCommandCenter({ tasks, jobs, llmCalls, productions, approvalsPending: approvals.length, health: deriveProviderHealth({ llmCalls, jobs, now: now.getTime() }), budgetLimits, dbPause, storeDriver: repo.driver, now, lastRunAt });
}
