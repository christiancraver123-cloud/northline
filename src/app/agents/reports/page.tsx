import Link from "next/link";
import { getRepo } from "@/lib/db";
import { AGENT_BY_CODE } from "@/lib/agents/ops/registry";
import { markReportAction } from "../../actions";
import { Btn, Card, DemoBadge, Empty, PageHeader, Pill, ago } from "@/components/ui";

export default async function ReportsInbox() {
  const reports = (await (await getRepo()).list("agentReports")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = reports.filter((r) => !r.read).length;
  return (
    <>
      <PageHeader title="Agent Reports" sub="Reports agents surfaced to you. Each is built from real Northline records and lists its sources." actions={unread > 0 ? <form action={markReportAction}><input type="hidden" name="reportId" value="ALL" /><Btn>Mark all read ({unread})</Btn></form> : <Link href="/agents" className="text-muted">← Agents</Link>} />
      {reports.length === 0 ? <Empty>No reports yet. Ask the Orchestrator for one (“Give me a report on all six creators”) or enable a schedule on an agent.</Empty> : (
        <div className="grid gap-3">{reports.map((r) => (
          <Card key={r.id} className={r.read ? "" : "border-blue2/50"}>
            <details open={!r.read}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span>{!r.read && <span className="mr-2 text-warn">●</span>}<b>{r.title}</b> <span className="text-[12px] text-muted">from {AGENT_BY_CODE[r.agentId]?.name} · {ago(r.createdAt)}</span></span><span className="flex gap-2"><Pill tone={r.kind === "ALERT" ? "bad" : "info"}>{r.kind}</Pill><DemoBadge origin={r.origin} /></span></summary>
              <pre className="mt-3 whitespace-pre-wrap text-[13px] text-[#c6cdf0]">{r.body}</pre>
              <div className="mt-2 flex items-center justify-between text-[11px] text-faint"><span>Sources: {r.sources.join(", ")}</span>
                <form action={markReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="read" value={r.read ? "0" : "1"} /><button className="text-blue2">{r.read ? "Mark unread" : "Mark read"}</button></form></div>
            </details>
          </Card>
        ))}</div>
      )}
    </>
  );
}
