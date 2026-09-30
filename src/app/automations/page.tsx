import { getRepo } from "@/lib/db";
import { Card, Empty, PageHeader, Pill, StatusPill } from "@/components/ui";

export default async function Automations() {
  const runs = await (await getRepo()).list("workflowRuns");
  const secret = !!process.env.NORTHLINE_WEBHOOK_SECRET;
  return (
    <>
      <PageHeader title="Automations" sub="n8n integration contracts and Northline workflow runs." />
      <Card className="mb-4">
        <h2 className="mb-2 font-bold">NL-01 Production Orchestrator <Pill tone="info">Northline-native</Pill></h2>
        <p className="text-muted">Webhook: <code className="font-mono">POST /api/n8n/production-orchestrator</code> — {secret ? <Pill tone="ok">secret configured</Pill> : <Pill tone="warn">NORTHLINE_WEBHOOK_SECRET not set — endpoint rejects all calls</Pill>}</p>
        <p className="mt-1 text-muted">n8n instance: {process.env.N8N_BASE_URL ? "configured" : "not connected"} — no live n8n data is shown. Contract: docs/n8n.md</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Workflow runs</h2>
        {runs.length === 0 ? <Empty>No runs yet.</Empty> : runs.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span>{r.workflow} <span className="font-mono text-[11px] text-faint">{r.startedAt?.slice(0, 19).replace("T", " ")}</span>{r.error && <span className="block text-[12px] text-bad">{r.error}</span>}</span><span className="flex gap-2">{r.origin === "demo" && <Pill tone="warn">DEMO</Pill>}<StatusPill status={r.state} /></span></div>)}
      </Card>
    </>
  );
}
