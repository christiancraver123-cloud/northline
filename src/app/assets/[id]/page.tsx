import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { REFERENCE_TYPES } from "@/lib/domain/types";
import { promoteAssetAction } from "../../actions";
import { AssetTile, Btn, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, QaPill, StatusPill } from "@/components/ui";

export default async function AssetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; promoted?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const a = await repo.get("assets", id);
  if (!a) notFound();
  const [prod, prompt, brief, attempt, job, qa, refs, approvals, jobs] = await Promise.all([
    repo.get("productions", a.productionId), a.promptId ? repo.get("prompts", a.promptId) : null, a.briefId ? repo.get("generationBriefs", a.briefId) : null,
    a.attemptId ? repo.get("generationAttempts", a.attemptId) : null, a.generationJobId ? repo.get("providerJobs", a.generationJobId) : null,
    repo.list("qaResults", { productionId: a.productionId }), Promise.all(a.referenceIds.map((r) => repo.get("referenceAssets", r))), repo.list("approvals", { productionId: a.productionId }), repo.list("providerJobs", { assetId: a.id }),
  ]);
  const myQa = qa.filter((q) => q.assetId === a.id || (q.assetId === null && q.attemptId === a.attemptId));
  const myApproval = approvals.find((x) => x.selectedAssetIds.includes(a.id));
  const row = (k: string, v: React.ReactNode) => <><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words">{v}</dd></>;
  return (
    <>
      <PageHeader title={a.filename} sub="Exactly how this image was created." actions={<span className="flex items-center gap-2"><DemoBadge origin={a.origin} /><StatusPill status={a.status} /><QaPill status={a.qaStatus} />{!a.current && <Pill>superseded</Pill>}</span>} />
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}
      {sp.promoted && <div className="mb-4 rounded-xl border border-ok/30 bg-ok/10 p-3 text-ok">Promoted to a canonical reference (explicit operator action). Find it on the Talent page.</div>}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div><AssetTile asset={a} /></div>
        <div className="grid content-start gap-4">
          <Card>
            <h2 className="mb-2 font-bold">Lineage</h2>
            <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              {row("Creator", a.talent.join(" + "))}
              {row("Production", prod ? <ProdLink p={prod} /> : "—")}
              {row("Identity version", <span className="font-mono">{a.identityVersion ?? "—"}</span>)}
              {row("Provider / model", <span className="font-mono">{a.provider}{a.model ? ` / ${a.model}` : ""}</span>)}
              {row("Generation attempt", attempt ? <>#{attempt.attemptNo} · {attempt.trigger}{attempt.reason ? ` · ${attempt.reason}` : ""} · <QaPill status={attempt.status} /></> : "—")}
              {row("Generation brief", brief ? <span className="font-mono">v{brief.version} · {brief.data.location}, {brief.data.timeOfDay}</span> : "—")}
              {row("Generation job", job ? <><StatusPill status={job.state} /> <span className="font-mono text-[11px] text-faint">retry {job.retryCount}{job.failureCategory ? ` · ${job.failureCategory}` : ""} · {job.startedAt?.slice(11, 19) ?? "—"}→{job.finishedAt?.slice(11, 19) ?? "—"}</span></> : "—")}
              {row("Created", a.createdAt.replace("T", " ").slice(0, 19))}
              {row("File", a.storagePath ? <span className="font-mono text-[12px]">{a.width}×{a.height} · {a.bytes} bytes · sha256 {a.sha256?.slice(0, 12)}…</span> : "no image file (mock/demo)")}
              {row("Approval", <><StatusPill status={a.approval} />{myApproval ? ` by ${myApproval.decidedBy} ${myApproval.decidedAt?.slice(0, 16).replace("T", " ")}${myApproval.notes ? ` — “${myApproval.notes}”` : ""}` : ""}</>)}
              {row("Publication", a.publication)}
              {row("References used", refs.filter(Boolean).length ? refs.filter(Boolean).map((r) => <span key={r!.id} className="mr-2 inline-block"><Pill tone={r!.authority === "MASTER" ? "info" : "mute"}>{r!.authority === "MASTER" ? "★ " : ""}{r!.referenceType}</Pill></span>) : "none (identity from written canonical identity only)")}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">QA results</h2>
            {myQa.length === 0 ? <Empty>No QA results yet.</Empty> : myQa.map((q) => (
              <div key={q.id} className="border-t border-edge py-2 text-[12.5px] first:border-0">
                <div className="flex flex-wrap items-center gap-2"><b>{q.kind}</b><span className="font-mono text-[11px] text-faint">{q.method}</span><QaPill status={q.status} />{q.inspectedImage ? <Pill tone="ok">image inspected{q.provider ? ` · ${q.provider}/${q.model}` : ""}</Pill> : <Pill>image not inspected</Pill>}</div>
                <p className="mt-1 text-muted">{q.summary}</p>
                {q.findings.map((f, i) => <p key={i} className={f.severity === "HARD_FAIL" ? "text-bad" : "text-warn"}>• {f.severity}: {f.message}</p>)}
                {q.recommendation && <p className="text-faint">Recommendation: {q.recommendation}</p>}
              </div>
            ))}
          </Card>
          {prompt && <Card><h2 className="mb-2 font-bold">Prompt (v{prompt.version})</h2><p className="text-[12.5px] text-[#c6cdf0]">{prompt.positive}</p><p className="mt-2 text-[12px] text-faint">{prompt.negative}</p></Card>}
          {jobs.length > 1 && <Card><h2 className="mb-2 font-bold">Job history</h2>{jobs.map((j) => <div key={j.id} className="flex justify-between border-t border-edge py-1 text-[12px] first:border-0"><span className="font-mono">retry {j.retryCount}{j.failureCategory ? ` · ${j.failureCategory}` : ""}{j.error ? ` · ${j.error}` : ""}</span><StatusPill status={j.state} /></div>)}</Card>}
          {a.approval === "APPROVED" && a.storagePath && (
            <Card>
              <h2 className="mb-1 font-bold">Promote to canonical reference</h2>
              <p className="mb-2 text-[12px] text-muted">Explicit operator action only. Generated images are never canonical unless you promote them here, with a reason.</p>
              <form action={promoteAssetAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="assetId" value={a.id} />
                <label className="text-[12px] text-muted">Reference type<select name="type" defaultValue="NATURAL_CANDID">{REFERENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
                <label className="text-[12px] text-muted">Operator<input name="operator" required defaultValue="operator" /></label>
                <label className="text-[12px] text-muted sm:col-span-2">Why is this canonical?<input name="notes" required maxLength={500} /></label>
                <Btn>Promote to reference</Btn></form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
