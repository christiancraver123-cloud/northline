import Link from "next/link";
import { getRepo } from "@/lib/db";
import { snapshots } from "@/lib/agents/ops/service";
import { AGENT_BY_CODE } from "@/lib/agents/ops/registry";
import { agentControlAction } from "../actions";
import { ChatPanel } from "@/components/ChatPanel";
import { AgentStatusPill, Btn, Card, Empty, PageHeader, Pill, ago } from "@/components/ui";

export default async function Agents() {
  const repo = await getRepo();
  const [snaps, messages, events, reports] = await Promise.all([snapshots(repo), repo.list("agentMessages", { agentId: "ORCHESTRATOR" }), repo.list("agentEvents"), repo.list("agentReports")]);
  const unread = reports.filter((r) => !r.read).length;
  const feed = events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
  return (
    <>
      <PageHeader title="Agent Operations Center" sub="Persistent workers driven by queues, events and schedules. Idle agents use no model/API calls."
        actions={<span className="flex gap-2"><Link href="/agents/reports" className="rounded-xl border border-edge bg-panel2 px-3.5 py-2 font-bold">Reports inbox{unread > 0 && <span className="ml-2 rounded-full bg-warn/20 px-1.5 font-mono text-[11px] text-warn">{unread}</span>}</Link>
          <form action={agentControlAction}><input type="hidden" name="op" value="tick" /><input type="hidden" name="agent" value="ORCHESTRATOR" /><Btn title="Materialise due schedules and run eligible queued tasks">Run worker tick</Btn></form></span>} />
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
                  <p className="mt-1 text-[11px] text-faint">{s.queued} queued · last activity {ago(s.lastEvent?.createdAt)}</p>
                </Card>
              </Link>
            ))}
          </div>
          <Card>
            <h2 className="mb-2 font-bold">System activity</h2>
            {feed.length === 0 ? <Empty>No agent activity yet.</Empty> : feed.map((e) => (
              <div key={e.id} className="flex gap-2 border-t border-edge py-1.5 text-[12px] first:border-0">
                <span className="w-16 flex-none font-mono text-faint">{ago(e.createdAt)}</span>
                <span className="w-32 flex-none truncate text-muted">{AGENT_BY_CODE[e.agentId]?.name}</span>
                <span className={e.level === "error" ? "text-bad" : e.level === "warn" ? "text-warn" : ""}>{e.message}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
