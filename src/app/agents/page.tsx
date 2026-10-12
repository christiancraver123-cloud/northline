import Link from "next/link";
import { getRepo } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { AGENT_BY_CODE } from "@/lib/agents/ops/registry";
import { agentControlAction } from "../actions";
import { ChatPanel } from "@/components/ChatPanel";
import { AgentStatusPill, Btn, Card, Empty, PageHeader, Pill, PROVIDER_STATE_TONE, ProviderPill, ago } from "@/components/ui";
import { llmProviderStatuses } from "@/lib/llm/status";
import { defaultRouter } from "@/lib/llm/router";
import { AGENT_TIER, tierModel } from "@/lib/llm/tiers";

export default async function Agents() {
  const repo = await getRepo();
  const [snaps, messages, events, reports, runs] = await Promise.all([snapshots(repo), repo.list("agentMessages", { agentId: "ORCHESTRATOR" }), repo.list("agentEvents"), repo.list("agentReports"), repo.list("agentRuns")]);
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const cost7 = (code: string) => { const r = runs.filter((x) => x.agentId === code && x.startedAt >= week && x.provider && x.provider !== "rules"); return r.length === 0 ? "$0 (no model calls)" : r.every((x) => x.costUsd != null) ? `$${r.reduce((a, x) => a + (x.costUsd ?? 0), 0).toFixed(3)}` : "UNKNOWN"; };
  const modelFor = (s: (typeof snaps)[number]) => { const pref = s.agent.config.model; if (pref && pref.provider !== "auto") return `${pref.provider}${pref.model ? ` · ${pref.model}` : ""} (set)`; const tier = AGENT_TIER[s.agent.code]; if (tier === "rules") return "rules (no model)"; const m = providers.find((p) => p.state === "configured" && p.name !== "mock"); return m ? `${m.name} · ${tierModel(m.name, tier) ?? `${m.model} (default)`}` : "no model configured → rules"; };
  const providers = await llmProviderStatuses(repo, defaultRouter());
  const unread = reports.filter((r) => !r.read).length;
  const feed = events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
  return (
    <>
      <PageHeader title="Agent Operations Center" sub="Persistent workers driven by queues, events and schedules. Idle agents use no model/API calls."
        actions={<span className="flex gap-2"><Link href="/agents/reports" className="rounded-xl border border-edge bg-panel2 px-3.5 py-2 font-bold">Reports inbox{unread > 0 && <span className="ml-2 rounded-full bg-warn/20 px-1.5 font-mono text-[11px] text-warn">{unread}</span>}</Link>
          <form action={agentControlAction}><input type="hidden" name="op" value="tick" /><input type="hidden" name="agent" value="ORCHESTRATOR" /><Btn title="Materialise due schedules and run eligible queued tasks">Run worker tick</Btn></form></span>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]"><span className="text-muted">Model providers:</span>{providers.filter((p) => p.name !== "mock" || p.state === "configured").map((p) => <span key={p.name} title={p.detail ?? ""}><Pill tone={PROVIDER_STATE_TONE[p.state] as never}>{p.name} · {p.state.replace("_", "-")}{p.calls ? ` · ${p.calls} call${p.calls > 1 ? "s" : ""}` : ""}</Pill></span>)}<Link href="/settings" className="text-blue2">details</Link></div>
      <Card className="mb-5 overflow-x-auto">
        <h2 className="mb-2 font-bold">Roster</h2>
        <table className="w-full min-w-[860px] text-[12.5px]"><thead className="text-left text-[11px] uppercase text-faint"><tr><th>Agent</th><th>Tier</th><th>Model</th><th>Task</th><th>Creator</th><th>Status</th><th>Elapsed</th><th>Next / blocker</th><th className="text-right">Cost 7d</th></tr></thead>
          <tbody>{snaps.map((s) => <tr key={s.agent.code} className="border-t border-edge align-top">
            <td className="py-1.5"><Link href={`/agents/${s.agent.code}`} className="font-semibold hover:underline">{s.agent.name}</Link><div className="text-[11px] text-faint">{AGENT_BY_CODE[s.agent.code].role.slice(0, 60)}</div></td>
            <td><Pill tone={AGENT_TIER[s.agent.code] === "premium" ? "warn" : "mute"}>{AGENT_TIER[s.agent.code]}</Pill></td>
            <td className="max-w-[12rem] text-muted">{modelFor(s)}</td>
            <td className="max-w-[14rem] truncate">{s.current?.title ?? "—"}</td>
            <td>{s.current?.talent ?? "—"}</td>
            <td><AgentStatusPill status={s.status} /></td>
            <td className="font-mono text-muted">{s.current?.startedAt ? ago(s.current.startedAt).replace(" ago", "") : "—"}</td>
            <td className="max-w-[14rem] text-muted">{s.status === "FAILED" ? <span className="text-bad">{s.lastError}</span> : s.blocked ? `${s.blocked} blocked` : s.queued ? `${s.queued} queued` : s.nextSchedule ? `${s.nextSchedule.name} ${s.nextSchedule.nextRunAt ? s.nextSchedule.nextRunAt.slice(0, 16).replace("T", " ") : ""}` : "idle"}</td>
            <td className="text-right font-mono text-muted">{cost7(s.agent.code)}</td>
          </tr>)}</tbody></table>
        <p className="mt-2 text-[11.5px] text-faint">Tiers: cheap = QA/captions/summaries, normal = agent work, premium = strategy only. Set GEMINI_MODEL_CHEAP / _NORMAL / _PREMIUM (or OPENAI_TEXT_MODEL_*) to choose models; unset = provider default. Cost is UNKNOWN unless LLM_PRICING_JSON is set.</p>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <h2 className="mb-1 font-bold">Northline · Orchestrator chat</h2>
          <p className="mb-3 text-[12px] text-muted">Ask about real state, or instruct: prioritise/pause creators, delegate to agents, run production workflows.</p>
          <ChatPanel agent="ORCHESTRATOR" name="Orchestrator" messages={messages} suggestions={["What is everyone doing?", "Give me a report on all six creators", "What failed?", "What needs approval?", "Have the Creative Director create three concepts for Sienna"]} />
        </Card>
        <div className="grid content-start gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {snaps.map((s) => (
              <Link key={s.agent.code} href={`/agents/${s.agent.code}`}>
                <Card className="h-full hover:border-blue2/50">
                  <div className="flex items-center justify-between gap-2"><b>{s.agent.name}</b><AgentStatusPill status={s.status} /></div>
                  <p className="mt-1 truncate text-[12px] text-muted">{s.current ? s.current.title : s.status === "WAITING" ? `${s.waiting} waiting on approval/deps` : s.status === "FAILED" ? s.lastError : AGENT_BY_CODE[s.agent.code].role}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">{s.queued} queued · {ago(s.lastEvent?.createdAt)}{s.lastRun && <ProviderPill provider={s.lastRun.provider} model={s.lastRun.model} fallback={s.lastRun.usedFallback} />}</p>
                </Card>
              </Link>
            ))}
          </div>
          <Card>
            <h2 className="mb-2 font-bold">System activity</h2>
            {feed.length === 0 ? <Empty>No agent activity yet.</Empty> : feed.map((e) => (
              <div key={e.id} className="flex gap-2 border-t border-edge py-1.5 text-[12px] first:border-0">
                <span className="w-16 flex-none font-mono text-faint">{ago(e.createdAt)}</span>
                <span className="w-20 flex-none truncate text-muted sm:w-32">{AGENT_BY_CODE[e.agentId]?.name}</span>
                <span className={`min-w-0 break-words ${e.level === "error" ? "text-bad" : e.level === "warn" ? "text-warn" : ""}`}>{e.message}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
