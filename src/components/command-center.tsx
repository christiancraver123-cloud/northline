import Link from "next/link";
import type { CommandCenter } from "@/lib/ops/command-center";
import { HEALTH_TONE, type HealthState } from "@/lib/llm/health-derived";
import { setPauseAction, unblockTaskAction } from "@/app/actions";
import { Card, Pill, ago } from "@/components/ui";

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex flex-wrap items-start justify-between gap-2 border-t border-edge py-1.5 text-[13px] first:border-0"><span className="text-muted">{k}</span><span className="text-right">{children}</span></div>;
const tone = (v: string) => (v === "UNKNOWN" || v === "NOT CONFIGURED" ? "mute" : v === "ON" || v === "ENABLED" ? "warn" : "ok") as "mute" | "warn" | "ok";

/** Operations overview. Anything without instrumentation reads UNKNOWN / NOT CONFIGURED rather than a made-up number. */
export function CommandCenterPanel({ cc, readOnly }: { cc: CommandCenter; readOnly: boolean }) {
  const { system: s, queue: q, budget: b } = cc;
  return (
    <section aria-label="Command Center" className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Command Center</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 font-bold">System</h3>
          <Row k="Mode"><Pill tone={s.mode === "read-only" ? "warn" : "ok"}>{s.mode}</Pill></Row>
          <Row k="Store">{s.store}</Row>
          <Row k="Budget governor"><Pill tone={s.governor === "ON" ? "ok" : "mute"}>{s.governor}</Pill></Row>
          <Row k="Durable jobs">{s.durableJobs}{s.durableJobs === "ON" ? ` · stage ${s.jobStage}` : ""}</Row>
          <Row k="Autonomous generation"><Pill tone={s.autonomousGeneration === "ENABLED" ? "warn" : "ok"}>{s.autonomousGeneration}</Pill></Row>
          <Row k="Migrations">{s.migrations}</Row>
        </Card>
        <Card>
          <h3 className="mb-1 font-bold">Workers</h3>
          <p className="mb-1 text-[11.5px] text-faint">{cc.workers.note}</p>
          <Row k="Active">{cc.workers.active.length ? cc.workers.active.map((w) => `${w.workerId} (${w.tasks})`).join(", ") : "none"}</Row>
          <Row k="Idle"><Pill tone="mute">{cc.workers.idle}</Pill></Row>
          <Row k="Failed tasks (24h)"><Pill tone={cc.workers.failed24h ? "bad" : "mute"}>{cc.workers.failed24h}</Pill></Row>
          <Row k="Last activity">{cc.workers.lastActivityAt ? ago(cc.workers.lastActivityAt) : "none recorded"}</Row>
        </Card>
        <Card>
          <h3 className="mb-2 font-bold">Job queue</h3>
          {([["Queued", q.queued], ["Running", q.running], ["Blocked", q.blocked], ["Failed", q.failed], ["Completed", q.completed]] as const).map(([k, n]) => <Row key={k} k={k}><Pill tone={k === "Failed" && n ? "bad" : k === "Blocked" && n ? "warn" : "mute"}>{n}</Pill></Row>)}
          {q.held.length > 0 && <div className="mt-2 text-[12px] text-warn">{q.held.length} queued task(s) held: {[...new Set(q.held.map((h) => h.reason))].slice(0, 2).join(" · ")}</div>}
        </Card>
        <Card>
          <h3 className="mb-1 font-bold">Budget</h3>
          <Row k="Emergency pause">{b.pause.paused === "UNKNOWN" ? <Pill tone="mute">UNKNOWN</Pill> : <Pill tone={b.pause.paused ? "bad" : "ok"}>{b.pause.paused ? `PAUSED (${b.pause.source})` : "not paused"}</Pill>}</Row>
          <Row k="Images generated today (UTC)">{b.imagesToday.total}</Row>
          {Object.entries(b.imagesToday.byCreator).map(([c, n]) => <Row key={c} k={`· creator ${c}`}>{n}</Row>)}
          {Object.entries(b.imagesToday.byProvider).map(([p, n]) => <Row key={p} k={`· provider ${p}`}>{n}</Row>)}
          {typeof b.limits === "string" ? <Row k="Limits"><Pill tone="mute">{b.limits}</Pill></Row> : b.limits.filter((l) => l.metric === "images_per_day").map((l) => <Row key={l.scope + l.scopeKey} k={`${l.scope === "global" ? "Global" : `${l.scope} ${l.scopeKey}`} daily`}>{l.used}/{l.limit} · {l.remaining} left</Row>)}
          <Row k="Resets">{b.resetsAt.slice(0, 16).replace("T", " ")} UTC</Row>
          {b.governor === "ON" && !readOnly && (
            <form action={setPauseAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="enabled" value={b.pause.paused === true ? "false" : "true"} />
              <input name="reason" placeholder="reason (optional)" className="min-w-0 flex-1 rounded-lg border border-edge bg-transparent px-2 py-1 text-[13px]" />
              <button className="rounded-lg border border-edge px-3 py-1 text-[13px] font-semibold">{b.pause.paused === true ? "Resume generation" : "Emergency pause"}</button>
            </form>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 font-bold">Provider health</h3>
          {cc.providers.map((p) => <Row key={p.id} k={p.label}><Pill tone={HEALTH_TONE[p.state as HealthState]}>{p.state.replace("_", " ")}</Pill></Row>)}
        </Card>
        <Card>
          <h3 className="mb-2 font-bold">Work in flight</h3>
          <Row k="Approvals waiting"><Link href="/approvals" className="text-blue2">{cc.approvalsWaiting}</Link></Row>
          <Row k="Productions in progress">{cc.productionsInProgress.length ? cc.productionsInProgress.map((p) => p.code).join(", ") : "none"}</Row>
          <Row k="Learnings (derived from decisions, advisory)">{cc.learningDerived.proposals} proposed · {cc.learningDerived.identityFlags} identity flag(s) for a human · from {cc.learningDerived.decisions} decision(s)</Row>
          <Row k="Stored learnings (proposed / testing / supported / awaiting approval)">{typeof cc.learnings === "string" ? <Pill tone="mute">{cc.learnings}</Pill> : `${cc.learnings.proposed} / ${cc.learnings.testing} / ${cc.learnings.supported} / ${cc.learnings.awaitingApproval}`}</Row>
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="mb-2 font-bold">Failures needing attention</h3>
          {cc.attention.length === 0 ? <div className="text-[13px] text-muted">Nothing failed or blocked in the last 7 days.</div> : cc.attention.map((a) => (
            <div key={a.kind + a.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-edge py-1.5 text-[13px] first:border-0">
              <span className="min-w-0 break-words"><Pill tone={a.kind === "blocked" ? "warn" : "bad"}>{a.kind}</Pill> {a.text}<span className="ml-2 text-faint">{ago(a.at)}</span></span>
              {a.kind === "blocked" && !readOnly && <form action={unblockTaskAction}><input type="hidden" name="id" value={a.id} /><button className="rounded-lg border border-edge px-2 py-0.5 text-[12px]">Unblock</button></form>}
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-2 font-bold">Recent completed work</h3>
          {cc.recentCompleted.length === 0 ? <div className="text-[13px] text-muted">Nothing completed yet.</div> : cc.recentCompleted.map((t) => <Row key={t.id} k={t.kind}>{ago(t.at)}</Row>)}
        </Card>
      </div>
    </section>
  );
}
