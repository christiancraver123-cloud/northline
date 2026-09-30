import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { approvalBlockers } from "@/lib/orchestrator/approvals";
import { retryAssetAction, reelVideoAction, resubmitAction } from "../../actions";
import { AssetTile, Btn, Card, DemoBadge, Empty, PageHeader, Pill, StatusPill, TalentChips } from "@/components/ui";

export default async function ProductionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const p = await repo.get("productions", id);
  if (!p) notFound();
  const [assets, prompts, captions, approvals, jobs, blockers, campaign] = await Promise.all([
    repo.list("assets", { productionId: id }), repo.list("prompts", { productionId: id }), repo.list("captions", { productionId: id }),
    repo.list("approvals", { productionId: id }), repo.list("providerJobs", { productionId: id }), approvalBlockers(repo, id),
    p.campaignId ? repo.get("campaigns", p.campaignId) : null,
  ]);
  assets.sort((a, b) => a.kind.localeCompare(b.kind) || a.seq - b.seq);
  const err = (await searchParams).error;
  const reel = assets.find((a) => a.kind === "REEL");
  return (
    <>
      <PageHeader title={p.code} sub={`${p.contentType} · ${p.concept}`} actions={<span className="flex items-center gap-2"><DemoBadge origin={p.origin} /><StatusPill status={p.status} /></span>} />
      {err && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{err}</div>}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-muted"><TalentChips codes={p.talent} />{campaign && <Pill tone="info">Campaign: {campaign.name}</Pill>}<Pill>{p.scope}</Pill><Pill>{p.platform}</Pill><Pill>cost {p.costUsd ? `$${p.costUsd.toFixed(2)}` : "unknown/none"}</Pill></div>
      {p.qaNotes.length > 0 && <Card className="mb-4 border-warn/30"><h2 className="mb-1 font-bold text-warn">QA notes</h2><ul className="list-disc pl-4 text-[13px]">{p.qaNotes.map((n) => <li key={n}>{n}</li>)}</ul></Card>}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Assets</h2>
          <span className="flex gap-2">
            {reel && reel.status === "PENDING" && <form action={reelVideoAction}><input type="hidden" name="productionId" value={p.id} /><Btn>Generate video (Higgsfield stage)</Btn></form>}
            {p.status === "RAW" && !assets.some((a) => a.status === "FAILED" || a.status === "PENDING") && <form action={resubmitAction}><input type="hidden" name="productionId" value={p.id} /><Btn primary>Submit for review</Btn></form>}
          </span></div>
        {assets.length === 0 ? <Empty>No assets — generation was blocked (see QA notes).</Empty> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{assets.map((a) => (
            <div key={a.id}><AssetTile asset={a} /><div className="mt-1 truncate font-mono text-[10px] text-faint" title={a.filename}>{a.filename}</div>
              {a.status === "FAILED" && <form action={retryAssetAction}><input type="hidden" name="productionId" value={p.id} /><input type="hidden" name="assetId" value={a.id} /><Btn className="mt-1 w-full">Retry</Btn></form>}</div>
          ))}</div>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Creative brief</h2>
          {p.brief ? <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[13px]"><dt className="text-muted">Hook</dt><dd>{p.brief.hook}</dd><dt className="text-muted">Location</dt><dd>{p.brief.location}</dd><dt className="text-muted">Outfit</dt><dd>{p.brief.outfit}</dd><dt className="text-muted">Lighting</dt><dd>{p.brief.lighting}</dd><dt className="text-muted">Story</dt><dd>{p.brief.storyBeat}</dd></dl> : <Empty>No brief.</Empty>}
          {p.brief?.reel && <div className="mt-3 rounded-lg border border-edge p-2.5 text-[12px]"><b>Reel plan</b> · {p.brief.reel.durationSec}s · {p.brief.reel.cameraMovement}<br /><span className="text-muted">Source still: {p.brief.reel.sourceStill}<br />Loop: {p.brief.reel.loopStrategy}<br />Audio: {p.brief.reel.audioConcept}</span><pre className="mt-1 whitespace-pre-wrap text-[11px] text-[#c6cdf0]">{p.brief.reel.higgsfieldPrompt}</pre></div>}
          <h2 className="mb-2 mt-4 font-bold">Captions</h2>
          {captions.map((c) => <p key={c.id} className="rounded-lg border border-edge p-2 text-[13px]">{c.text} <StatusPill status={c.approval} /></p>)}
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <h2 className="mb-2 font-bold">History</h2>
            <ul className="grid gap-1 text-[13px]">
              {approvals.map((a) => <li key={a.id} className="flex items-center justify-between"><span>Approval {a.decidedAt ? `by ${a.decidedBy} ${a.decidedAt.slice(0, 16).replace("T", " ")}` : "requested"}{a.notes ? ` — ${a.notes}` : ""}</span><StatusPill status={a.state} /></li>)}
              {jobs.map((j) => <li key={j.id} className="flex items-center justify-between text-muted"><span>{j.operation} #{j.shotN} · {j.provider}{j.error ? ` — ${j.error}` : ""}</span><StatusPill status={j.state} /></li>)}
            </ul>
            {p.status === "REVIEW" && blockers.length > 0 && <p className="mt-2 text-warn">Approval blocked: {blockers.join("; ")}</p>}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Prompts ({prompts.length})</h2>
            {prompts.map((pr) => <details key={pr.id} className="border-t border-edge py-1.5 first:border-0"><summary className="cursor-pointer">Shot {pr.shotN} · v{pr.version} {pr.qa.ok ? <Pill tone="ok">identity QA ✓</Pill> : <Pill tone="bad">identity QA ✗</Pill>}</summary><p className="mt-1 text-[12px] text-muted">{pr.positive}</p><p className="mt-1 text-[12px] text-faint">{pr.negative}</p></details>)}
          </Card>
        </div>
      </div>
    </>
  );
}
