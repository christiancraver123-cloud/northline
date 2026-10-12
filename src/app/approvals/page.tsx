import Link from "next/link";
import { getRepo } from "@/lib/db";
import { approvalBlockers } from "@/lib/orchestrator/approvals";
import { archiveProductionAction, decideAction, publishAction, regenerateAction, retryPublishAction } from "../actions";
import { REJECT_TAGS } from "@/lib/feedback/reasons";
import { qaTriad } from "@/lib/pipeline/qa-triad";
import { listIfMigrated, resolvePublisher } from "@/lib/publishing/service";
import { MOCK_OUTCOMES } from "@/lib/publishing/provider";
import { instagramStatus } from "@/lib/flags";
import { isReadOnly } from "@/lib/runtime/mode";
import { Btn, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill, TalentChips, ago } from "@/components/ui";
import { TriadDetail, TriadPills } from "@/components/cc";
import { ImportDropzone } from "@/components/ImportDropzone";
import { ApprovalBoard, type BoardCard } from "./ApprovalBoard";
import { visibleQueue } from "@/lib/orchestrator/bulk";
import { MANUAL_UPLOAD } from "@/lib/pipeline/import";
import { ROSTER, ROSTER_BY_CODE } from "@/lib/talent/roster";

type SP = { error?: string; ok?: string; id?: string; asset?: string; view?: string; creator?: string };

export default async function Approvals({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const readOnly = isReadOnly();
  const creator = ROSTER.find((t) => t.code === sp.creator)?.code ?? "";
  const grid = sp.view === "grid";
  const pending = await visibleQueue(repo, { creator: creator || null }); // the visible queue — bulk actions use exactly this set
  const allPending = (await repo.list("approvals", { state: "PENDING" })).length;
  const idx = Math.max(0, pending.findIndex((a) => a.id === sp.id));
  const ap = pending[idx] ?? null;
  const qs = (o: Partial<SP>) => `/approvals?${new URLSearchParams(Object.fromEntries(Object.entries({ creator: creator || undefined, ...o }).filter(([, v]) => v)) as Record<string, string>).toString()}`;
  const prods = new Map((await repo.list("productions")).map((p) => [p.id, p]));
  const allAssets = await repo.list("assets");
  const qaAll = await repo.list("qaResults");
  const refsAll = await repo.list("referenceAssets");
  const thumb = (a: { id: string; storagePath: string | null } | undefined | null) => (a?.storagePath ? `/api/assets/${a.id}/file` : null);
  const firstAsset = (pid: string) => allAssets.filter((x) => x.productionId === pid && x.current && x.kind !== "REEL").sort((x, y) => x.seq - y.seq)[0] ?? null;

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="View" className="inline-flex rounded-xl border border-edge p-0.5">
        <Link role="tab" aria-selected={!grid} href={qs({ view: undefined })} className={`rounded-lg px-3 py-1.5 text-[13px] font-bold ${!grid ? "bg-blue/25" : "text-muted"}`}>Focus</Link>
        <Link role="tab" aria-selected={grid} href={qs({ view: "grid" })} className={`rounded-lg px-3 py-1.5 text-[13px] font-bold ${grid ? "bg-blue/25" : "text-muted"}`}>Grid</Link>
      </div>
      <nav aria-label="Creator filter" className="flex flex-wrap gap-1 text-[12.5px]">
        <Link href={`/approvals?${grid ? "view=grid" : ""}`} className={`rounded-full border px-2.5 py-1 ${!creator ? "border-blue2 bg-blue/20" : "border-edge text-muted"}`}>All · {allPending}</Link>
        {ROSTER.map((t) => <Link key={t.code} href={`/approvals?creator=${t.code}${grid ? "&view=grid" : ""}`} className={`rounded-full border px-2.5 py-1 ${creator === t.code ? "border-transparent text-[#0a0f24]" : "border-edge text-muted"}`} style={creator === t.code ? { background: t.color } : undefined}>{t.first}</Link>)}
      </nav>
      {!grid && pending.length > 1 && <span className="ml-auto flex items-center gap-2 text-[13px]"><span className="font-mono text-muted">{idx + 1} / {pending.length}</span><Link href={qs({ id: pending[(idx - 1 + pending.length) % pending.length].id })} className="rounded-lg border border-edge px-2.5 py-1">← Prev</Link><Link href={qs({ id: pending[(idx + 1) % pending.length].id })} className="rounded-lg border border-edge px-2.5 py-1">Next →</Link></span>}
    </div>
  );

  let body: React.ReactNode;
  if (grid) {
    const decided = (await repo.list("approvals")).filter((a) => a.state !== "PENDING").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
    const done = (state: string) => decided.filter((a) => a.state === state && (!creator || prods.get(a.productionId)?.talent[0] === creator)).map((a) => { const p = prods.get(a.productionId); const asset = allAssets.filter((x) => x.productionId === a.productionId && x.kind !== "REEL").sort((x, y) => y.attemptNo - x.attemptNo)[0]; return { id: a.id, code: p?.code ?? "", thumb: thumb(asset), color: ROSTER_BY_CODE[p?.talent[0] ?? "SIE"].color }; });
    const cards: BoardCard[] = await Promise.all(pending.map(async (a) => {
      const p = prods.get(a.productionId)!, asset = firstAsset(p.id);
      return { approvalId: a.id, productionId: p.id, code: p.code, creator: ROSTER_BY_CODE[p.talent[0]].first, color: ROSTER_BY_CODE[p.talent[0]].color, thumb: thumb(asset), qa: asset ? qaTriad(qaAll, asset.id).overall : "NOT RUN", blockers: await approvalBlockers(repo, p.id) };
    }));
    body = <ApprovalBoard cards={cards} approved={done("APPROVED")} rejected={done("REJECTED")} creator={creator} back={qs({ view: "grid" })} readOnly={readOnly} tags={REJECT_TAGS.map(([t, c]) => [t, c] as const)} />;
  } else if (!ap) {
    body = <Empty>Nothing to review{creator ? ` for ${ROSTER_BY_CODE[creator].first}` : ""}. <Link className="text-blue2" href="/create">Import or create an image →</Link></Empty>;
  } else {
    const p = prods.get(ap.productionId)!;
    const assets = allAssets.filter((x) => x.productionId === p.id && x.current && x.kind !== "REEL").sort((x, y) => x.seq - y.seq);
    const asset = assets.find((x) => x.id === sp.asset) ?? assets[0] ?? null;
    const [captions, blockers, prompts, jobs] = await Promise.all([repo.list("captions", { productionId: p.id }), approvalBlockers(repo, p.id), repo.list("prompts", { productionId: p.id }), repo.list("providerJobs", { productionId: p.id })]);
    const prompt = asset?.promptId ? prompts.find((x) => x.id === asset.promptId) : undefined;
    const job = asset ? jobs.find((j) => j.id === asset.generationJobId) : undefined;
    const triad = asset ? qaTriad(qaAll, asset.id) : null;
    const used = asset ? refsAll.filter((r) => asset.referenceIds.includes(r.id)) : [];
    const history = allAssets.filter((x) => x.productionId === p.id && !x.current && x.kind !== "REEL").sort((a, b) => b.attemptNo - a.attemptNo);
    const t = ROSTER_BY_CODE[p.talent[0]];
    body = (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-edge" style={{ background: `linear-gradient(160deg, ${t.color}33, #0b1128 75%)` }}>
            {asset?.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${asset.id}/file`} alt={`${p.code} frame ${asset.seq}`} className="mx-auto max-h-[74vh] w-auto object-contain" />
              : <div className="grid aspect-[4/5] place-items-center p-6 text-center text-muted">{asset ? `${asset.provider} produced no image file.` : "No asset attached."}</div>}
          </div>
          {assets.length > 1 && <div className="flex gap-2 overflow-x-auto">{assets.map((x) => <Link key={x.id} href={qs({ id: ap.id, asset: x.id })} aria-current={x.id === asset?.id ? "true" : undefined} className={`flex-none rounded-lg border px-2 py-1 font-mono text-[12px] ${x.id === asset?.id ? "border-blue2 bg-blue/20" : "border-edge text-muted"}`}>frame {x.seq}</Link>)}</div>}
          {assets.length <= 1 && !readOnly && <details className="rounded-xl border border-edge p-3"><summary className="cursor-pointer text-[13px] font-semibold text-muted">Replace this image (drop a new version)</summary><div className="mt-2"><ImportDropzone compact readOnly={readOnly} fixedCreator={p.talent[0]} replaceProductionId={p.id} creators={[{ code: t.code, name: t.name, color: t.color, masterUrl: null }]} title="Drop the replacement image" /></div></details>}
        </div>
        <div className="grid content-start gap-4">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-lg font-extrabold"><span className="h-3 w-3 rounded-full" style={{ background: t.color }} />{t.name}</div><p className="text-[13.5px] text-muted">{p.concept}</p></div>
            <span className="flex-none font-mono text-[12px] text-faint">{p.code}</span>
          </div>
          {triad && <div className="flex flex-wrap gap-1.5"><TriadPills triad={triad} /></div>}
          {captions.map((c) => <p key={c.id} className="rounded-xl border border-edge p-2.5 text-[13.5px]">“{c.text}”</p>)}
          {blockers.length > 0 && <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-[13px] text-warn">Can’t approve yet: {blockers.join("; ")}. <Link href="/launch" className="underline">Launch →</Link></p>}
          <form action={decideAction} className="grid gap-3">
            <input type="hidden" name="approvalId" value={ap.id} />
            {assets.length > 1 ? <div className="flex flex-wrap gap-3 text-[12.5px]">{assets.map((x) => <label key={x.id} className="flex items-center gap-1.5"><input type="checkbox" name="asset" value={x.id} defaultChecked={x.status === "RAW" && x.qaStatus !== "HARD_FAIL"} className="size-4 !w-auto" />approve frame {x.seq}</label>)}</div> : asset && <input type="hidden" name="asset" value={asset.id} />}
            <div className="grid grid-cols-2 gap-2">
              <Btn primary name="decision" value="APPROVED" disabled={blockers.length > 0} className="py-3 text-[15px]">Approve</Btn>
              <Btn name="decision" value="REJECTED" className="border-bad/50 py-3 text-[15px] text-bad">Deny</Btn>
            </div>
            <details className="rounded-xl border border-edge p-3 text-[13px]"><summary className="cursor-pointer font-semibold text-muted">Reasons, notes, request revision</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">{REJECT_TAGS.map(([tag, code]) => <label key={tag} className="flex cursor-pointer items-center gap-1 rounded-full border border-edge px-2.5 py-1 text-[12px] has-[:checked]:border-bad/60 has-[:checked]:bg-bad/15"><input type="checkbox" name="reason" value={code} className="sr-only" />{tag}</label>)}</div>
              <input name="notes" className="mt-2" placeholder="Notes (stored as your feedback; never changes canonical identity)" aria-label="Notes" />
              <Btn name="decision" value="REVISION_REQUESTED" className="mt-2">Request revision</Btn>
            </details>
          </form>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <form action={regenerateAction} className="flex min-w-0 flex-1 gap-2"><input type="hidden" name="productionId" value={p.id} /><input name="notes" placeholder="What to change (regenerate with AI)" className="min-w-0 flex-1" aria-label="Regeneration notes" /><Btn>Regenerate</Btn></form>
            <Link href={`/create?from=${p.id}`} className="rounded-xl border border-edge bg-panel2 px-3.5 py-2 font-bold">Edit prompt</Link>
            <form action={archiveProductionAction}><input type="hidden" name="productionId" value={p.id} /><Btn>Archive</Btn></form>
            {asset?.storagePath && <a href={`/api/assets/${asset.id}/file`} target="_blank" rel="noreferrer" className="rounded-xl border border-edge px-3.5 py-2 font-bold">Open ↗</a>}
          </div>
          <details className="rounded-xl border border-edge p-3 text-[12.5px]">
            <summary className="cursor-pointer font-semibold text-muted">Details — QA, provider, prompt, lineage</summary>
            {triad && <div className="mt-2"><TriadDetail triad={triad} /></div>}
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
              <dt className="text-muted">Source</dt><dd>{asset?.provider === MANUAL_UPLOAD ? "Manual upload" : asset ? `${asset.provider}${asset.model ? ` · ${asset.model}` : ""}` : "—"}</dd>
              <dt className="text-muted">Cost</dt><dd>{job?.costUsd != null ? `$${job.costUsd.toFixed(2)}` : asset?.provider === "mock" || asset?.provider === MANUAL_UPLOAD ? "$0" : "UNKNOWN"}</dd>
              <dt className="text-muted">Attempt</dt><dd>{asset?.attemptNo ?? "—"}{history.length ? ` · ${history.length} earlier version(s) kept` : ""}</dd>
              <dt className="text-muted">Job</dt><dd className="break-all font-mono text-[11px]">{job?.id ?? "none"}</dd>
              <dt className="text-muted">File</dt><dd>{asset ? `${asset.width ?? "?"}×${asset.height ?? "?"} · ${asset.bytes ? `${Math.round(asset.bytes / 1024)} KB` : "?"} · sha ${asset.sha256?.slice(0, 10) ?? "—"}` : "—"}</dd>
              <dt className="text-muted">Identity</dt><dd className="font-mono">{asset?.identityVersion ?? p.identityVersion ?? "—"}</dd>
              <dt className="text-muted">References</dt><dd>{used.length ? used.map((r) => r.referenceType.replace(/_/g, " ").toLowerCase()).join(", ") : "none"}</dd>
              <dt className="text-muted">Created</dt><dd>{ago(asset?.createdAt ?? p.createdAt)}</dd>
            </dl>
            {prompt && <p className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-muted">{prompt.positive}</p>}
            {history.length > 0 && <div className="mt-2 flex gap-2">{history.slice(0, 6).map((h) => <Link key={h.id} href={`/assets/${h.id}`} title={`attempt ${h.attemptNo}`} className="h-16 w-13 overflow-hidden rounded-md border border-edge" style={{ width: "3.25rem" }}>{h.storagePath && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${h.id}/file`} alt={`attempt ${h.attemptNo}`} className="h-full w-full object-cover" />}</Link>)}</div>}
          </details>
        </div>
      </div>
    );
  }

  // ---- ready to publish + failed publishes ----
  const publications = await listIfMigrated(repo, "publications");
  const retryPending = new Set((publications ?? []).filter((x) => x.status === "FAILED" && x.retryable && x.attempts < x.maxAttempts).map((x) => x.assetId));
  const approvedAssets = (await repo.list("assets")).filter((a) => a.status === "APPROVED" && a.current && a.kind === "IMG" && a.publication !== "PUBLISHED" && !retryPending.has(a.id)); // retryable failures are handled by Retry below
  const publisher = resolvePublisher();
  const failedPubs = (publications ?? []).filter((x) => x.status === "FAILED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const ig = instagramStatus();
  const decidedRecent = (await repo.list("approvals")).filter((a) => a.state !== "PENDING").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).slice(0, 6);

  return (
    <>
      <PageHeader title="Approvals" sub="Review, approve or deny. Approving never publishes; publishing is a separate confirmed click." />
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}
      {sp.ok && <div role="status" className="mb-4 rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{sp.ok}</div>}
      {toolbar}
      {body}

      <Card className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Ready to publish</h2><span className="flex items-center gap-2 text-[12px]"><Pill tone="bad">{ig.label}</Pill>{publisher.provider ? <Pill tone="warn">{publisher.provider.name}</Pill> : <Pill tone="mute">publishing off</Pill>}</span></div>
        {publications === null ? <p className="text-[13px] text-warn">Publishing tables are missing — migration 0009 has not been applied to this database.</p>
          : !publisher.provider ? <p className="text-[13px] text-muted">{publisher.reason}</p>
          : approvedAssets.length === 0 ? <p className="text-[13px] text-muted">No approved, unpublished images.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{approvedAssets.map((a) => {
            const p = prods.get(a.productionId);
            return (
              <div key={a.id} className="flex gap-3 rounded-xl border border-edge p-2.5">
                <div className="h-28 w-[5.6rem] flex-none overflow-hidden rounded-lg border border-edge bg-panel2">{a.storagePath ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${a.id}/file`} alt={a.filename} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[10px] text-muted">no file</span>}</div>
                <details className="min-w-0 flex-1 text-[12.5px]">
                  <summary className="cursor-pointer"><b>{p?.code ?? "—"}</b> · <TalentChips codes={a.talent} /><span className="block truncate text-muted">{p?.concept}</span><span className="mt-1 inline-block rounded-lg bg-gradient-to-br from-blue to-[#4d5cf0] px-3 py-1 font-bold text-white">Publish…</span></summary>
                  <form action={publishAction} className="mt-2 grid gap-1.5 rounded-lg border border-edge p-2">
                    <input type="hidden" name="assetId" value={a.id} /><input type="hidden" name="back" value="/approvals" />
                    <p>Publish this image to <b>{publisher.provider!.name === "MOCK_INSTAGRAM" ? "the mock Instagram provider (nothing is posted)" : "Instagram"}</b> for {a.talent[0]}?</p>
                    {publisher.provider!.name === "MOCK_INSTAGRAM" && <label className="text-[12px]">Mock outcome<select name="mockOutcome" defaultValue="success">{MOCK_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></label>}
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" value="yes" required className="size-4 !w-auto" />I confirm this publish.</label>
                    <Btn primary disabled={readOnly}>Publish now</Btn>
                  </form>
                </details>
              </div>
            );
          })}</div>
        )}
        {failedPubs.length > 0 && (
          <div className="mt-4 border-t border-edge pt-3"><h3 className="mb-1 font-bold text-bad">Failed publishes</h3>{failedPubs.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-1.5 text-[12.5px] first:border-0">
              <span className="min-w-0 break-words">{prods.get(x.productionId)?.code} · attempt {x.attempts}/{x.maxAttempts} · <span className="text-bad">{x.error}</span></span>
              {x.retryable ? <form action={retryPublishAction} className="flex items-center gap-1.5"><input type="hidden" name="publicationId" value={x.id} /><input type="hidden" name="back" value="/approvals" />{x.provider === "MOCK_INSTAGRAM" && <select name="mockOutcome" defaultValue="retryable" aria-label="Mock outcome" className="!w-auto">{MOCK_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select>}<Btn>Retry</Btn></form> : <Pill tone="mute">not retryable</Pill>}
            </div>
          ))}</div>
        )}
      </Card>

      {decidedRecent.length > 0 && <details className="mt-5 rounded-2xl border border-edge p-3"><summary className="cursor-pointer font-bold text-muted">Recent decisions</summary>{decidedRecent.map((d) => <div key={d.id} className="flex justify-between gap-2 border-t border-edge py-1.5 text-[12.5px] first:border-0"><span className="min-w-0 truncate text-muted">{prods.get(d.productionId)?.code} · {d.decidedBy} · {ago(d.decidedAt)}{d.notes ? ` — ${d.notes}` : ""}</span><StatusPill status={d.state} /></div>)}</details>}
      <p className="mt-4 text-[12px] text-faint">QA reads PASS only when an automated inspector actually looked at the image; otherwise it says REVIEW with confidence “none”, and you are the check.</p>
    </>
  );
}
