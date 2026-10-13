import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { newestFirst } from "@/lib/db/order";
import { getTalent } from "@/lib/talent/roster";
import { REFERENCE_TYPES } from "@/lib/domain/types";
import { uploadReferenceAction, referenceControlAction } from "../../actions";
import { loadIdentity } from "@/lib/identity/service";
import { ReferenceLibrary } from "@/components/ReferenceLibrary";
import { AssetTile, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, SectionHead, StatusPill, ago } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Link from "next/link";
import { CreatorPortrait } from "@/components/cc";
import { ImagePicker, type PickerImage } from "@/components/ImagePicker";
import { isLibraryProduction } from "@/lib/pipeline/library";
import { pickPortrait, PORTRAIT_TYPE_ORDER } from "@/lib/talent/portrait";
import { ImportDropzone } from "@/components/ImportDropzone";
import { isReadOnly } from "@/lib/runtime/mode";
import { creatorOverviews } from "@/lib/ops/creators";
import { listIfMigrated } from "@/lib/publishing/service";
import { weightsFromEnv } from "@/lib/priority";

export default async function TalentDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ refError?: string; refOk?: string; ok?: string; error?: string }> }) {
  const t = getTalent((await params).code.toUpperCase());
  if (!t) notFound();
  const repo = await getRepo();
  const [prods, refs, launch] = await Promise.all([repo.list("productions").then(newestFirst), repo.list("referenceAssets", { talent: t.code }), repo.list("launchStates", { talent: t.code })]);
  const sp = await searchParams;
  const loaded = await loadIdentity(repo, t.code); // persists the immutable snapshot on first view
  const ci = loaded.identity;
  const mine = prods.filter((p) => p.talent.includes(t.code));
  const [assets, analytics, calendar, jobs, launchAll, storylines, tasks, publications] = await Promise.all([repo.list("assets"), repo.list("analytics"), repo.list("calendarEntries"), repo.list("providerJobs"), repo.list("launchStates"), repo.list("storylines"), repo.list("agentTasks"), listIfMigrated(repo, "publications")]);
  const ov = creatorOverviews({ productions: prods, assets, publications, analytics, calendar, jobs, launch: launchAll, storylines, tasks }, new Date(), weightsFromEnv()).find((o) => o.code === t.code)!;
  const approved = assets.filter((a) => a.talent[0] === t.code && a.current && a.kind === "IMG" && a.status === "APPROVED").slice(-12).reverse();
  const myPubs = (publications ?? []).filter((x) => x.talent === t.code && x.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const portrait = pickPortrait(refs, t.code); // MASTER_FACE → best canonical reference → fallback; never generated content
  const strip = refs.filter((r) => r.status === "ACTIVE").sort((a, b) => (a.referenceType === "MASTER_FACE" ? -1 : b.referenceType === "MASTER_FACE" ? 1 : PORTRAIT_TYPE_ORDER.indexOf(a.referenceType) - PORTRAIT_TYPE_ORDER.indexOf(b.referenceType)));
  const recent = assets.filter((a) => a.talent[0] === t.code && a.current && a.kind === "IMG").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const readOnly = isReadOnly();
  const libProds = new Set(prods.filter(isLibraryProduction).map((p) => p.id));
  const allImages: PickerImage[] = assets.filter((a) => a.talent[0] === t.code && a.current && a.kind === "IMG" && a.storagePath).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => {
    const lib = libProds.has(a.productionId);
    return { id: a.id, url: `/api/assets/${a.id}/file`, label: a.filename, library: lib, status: lib ? "not reviewed" : a.publication === "PUBLISHED" ? "posted" : a.status === "APPROVED" ? "approved" : a.status === "REJECTED" ? "denied" : "in review", href: `/assets/${a.id}` };
  });
  return (
    <>
      <section className="mb-10 grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-edge/70" style={{ boxShadow: `0 30px 60px -40px ${t.color}` }}>
          <CreatorPortrait code={t.code} portrait={portrait} className="aspect-[3/4] w-full" />
          {portrait.source !== "FALLBACK" && <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md">{portrait.source === "MASTER_FACE" ? "Master face" : `Canonical ${portrait.referenceType?.replace(/_/g, " ").toLowerCase()}`}</span>}
        </div>
        <div className="grid min-w-0 content-start gap-5 sm:pt-2">
          <div>
            <div className="flex items-center gap-2.5 text-[13px] text-muted"><span className="h-px w-8" style={{ background: t.color }} />{t.role}</div>
            <h1 className="display mt-2 text-[44px] font-semibold leading-[0.98] sm:text-[60px]">{t.name}</h1>
            <p className="mt-2.5 text-[14.5px] text-muted">{t.age} · {t.markets.join(" / ")} · <span className="font-mono text-[12.5px]">{t.code}</span></p>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Priority", String(ov.priority.score), ov.priority.reasons.slice(0, 3).join("; ")], ["Ready to post", String(ov.approvedReady), "Approved and not yet posted"], ["Last post", ov.lastContentAt ? ago(ov.lastContentAt) : "Never", ""], ["Storyline", ov.storyline ?? "None active", ""]] as const).map(([k, v, title]) => (
              <div key={k} title={title || undefined} className="min-w-0 rounded-xl border border-edge/70 bg-panel/50 px-3.5 py-2.5"><dt className="text-[12px] text-muted">{k}</dt><dd className={`mt-0.5 truncate font-semibold ${k === "Priority" || k === "Ready to post" ? "num text-[20px]" : "text-[15px]"}`} style={k === "Priority" ? { color: t.color } : undefined}>{v}</dd></div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5">{t.criticalRules.map((r) => <span key={r} className="inline-flex items-center gap-1.5 rounded-full border border-bad/25 bg-bad/[0.06] px-2.5 py-1 text-[12px] text-ink/90"><span className="h-1 w-1 rounded-full bg-bad" />{r}</span>)}</div>
          <div className="flex flex-wrap gap-2">
            <a href="#generated" className="inline-flex items-center gap-2 rounded-xl bg-blue2 px-4 py-2.5 text-[13.5px] font-semibold text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab]"><Icon name="upload" size={15} />Import for {t.first}</a>
            <Link href={`/create?mode=generate&creator=${t.code}`} className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-4 py-2.5 text-[13.5px] font-semibold hover:border-[#4a414c]"><Icon name="spark" size={15} />Generate</Link>
            <a href="#all" className="inline-flex items-center gap-2 rounded-xl border border-edge px-4 py-2.5 text-[13.5px] font-semibold text-muted hover:text-ink"><Icon name="image" size={15} />All {allImages.length} images</a>
          </div>
        </div>
      </section>
      <SectionHead title={<>Canonical references <span className="text-[13px] font-normal text-muted">The identity authority. Imports and generated images never land here.</span></>} />
      <div className="mb-5 rounded-2xl border border-edge/70 bg-panel/40 p-3">
        {strip.length === 0 ? <p className="p-3 text-center text-[13px] text-muted">No canonical images uploaded for {t.first} yet. <a href="#references" className="text-blue2">Add a master face</a></p> : (
          <ul aria-label="Canonical reference images" className="flex gap-2.5 overflow-x-auto pb-1">{strip.map((r) => (
            <li key={r.id} className="w-28 flex-none sm:w-32">
              <a href="#references" className={`block overflow-hidden rounded-xl border-2 ${r.referenceType === "MASTER_FACE" ? "" : "border-edge"}`} style={r.referenceType === "MASTER_FACE" ? { borderColor: t.color } : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/references/${r.id}/file`} alt={`${t.first} ${r.referenceType}`} loading="lazy" className="aspect-[3/4] w-full object-cover object-top" />
              </a>
              <span className="mt-1 block truncate text-[11px] text-muted">{r.referenceType === "MASTER_FACE" ? <b className="text-ink">Master face</b> : r.referenceType.replace(/_/g, " ").toLowerCase()}</span>
            </li>
          ))}</ul>
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Identity-critical rules</h2>
          <ul className="grid gap-2">{t.criticalRules.map((r) => <li key={r} className="rounded-lg border border-bad/30 bg-bad/5 p-2.5 text-[13px]">{r}</li>)}</ul>
          <h2 className="mb-2 mt-5 font-bold">Canonical identity</h2>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {(["hair", "eyes", "skin", "face", "body", "jewelry"] as const).map((k) => <Fragment key={k}><dt className="text-muted capitalize">{k}</dt><dd>{t.identity[k]}</dd></Fragment>)}
          </dl>
          <p className="mt-3 text-[12px] text-faint">Canonical identity <b className="font-mono text-ink">{ci.id}</b> — stored snapshot in the database{loaded.drift ? " (code facts drifted — bump the version)" : ""}; productions record this version. Source: src/lib/identity/canonical.ts + roster.ts. Generated images never replace it.</p>
          <h2 className="mb-2 mt-5 font-bold">Hard locks <span className="text-[11px] font-normal text-faint">(violation = HARD_FAIL)</span></h2>
          <ul className="grid gap-1.5 text-[12.5px]">{ci.hardLocks.map((l) => <li key={l.id} className="rounded-lg border border-bad/30 p-2"><span className="font-mono text-[11px] text-bad">{l.id}</span> {l.description}</li>)}</ul>
          <h2 className="mb-2 mt-4 font-bold">Soft locks <span className="text-[11px] font-normal text-faint">(violation = REVIEW)</span></h2>
          <ul className="grid gap-1.5 text-[12.5px]">{ci.softLocks.map((l) => <li key={l.id} className="rounded-lg border border-warn/30 p-2"><span className="font-mono text-[11px] text-warn">{l.id}</span> {l.description}</li>)}</ul>
          <p className="mt-3 text-[12px] text-muted">Creative variables (free to change): {ci.creativeVariables.join(", ")}.</p>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-2 font-bold">Personality &amp; voice</h2>
            <div className="mb-2 flex flex-wrap gap-1.5">{t.personality.map((p) => <Pill key={p}>{p}</Pill>)}</div>
            <p className="text-[13px] text-muted">{t.voice.tone}. {t.voice.style}.</p>
            <p className="mt-1 italic">“{t.voice.sample}”</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Visual language</h2>
            <p className="text-[13px] text-muted">Palette: {t.visual.palette.join(", ")}</p>
            <p className="text-[13px] text-muted">Lighting: {t.visual.lighting.join(", ")}</p>
            <p className="text-[13px] text-muted">Places: {t.visual.environments.join(", ")}</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Launch</h2>
            <p className="text-[13px] text-muted">AI disclosure {launch[0]?.aiDisclosure ? "confirmed" : "not confirmed"} · handle {launch[0]?.handle ? `@${launch[0].handle}` : "not set"}. <a className="text-blue2" href="/launch">Manage</a></p>
          </Card>
        </div>
      </div>
      <div id="references" className="mt-5"><ReferenceLibrary talent={t.code} refs={refs} identityId={ci.id} error={sp.refError} ok={!!sp.refOk} /></div>
      <SectionHead id="generated" className="mt-12" title={<>Add images <span className="text-[13px] font-normal text-muted">Generated and imported content never changes her identity.</span></>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-2xl border border-edge bg-panel/70 p-4"><h3 className="mb-2 font-bold">Import to {t.first}</h3><ImportDropzone readOnly={readOnly} fixedCreator={t.code} creators={[{ code: t.code, name: t.name, color: t.color, masterUrl: portrait.url }]} title={`Drop images for ${t.first}`} /></div>
        <div className="rounded-2xl border border-edge bg-panel/70 p-4"><h3 className="mb-2 font-bold">How images get here</h3><p className="text-[13px] text-muted">Drop new images on the left, or tick images below that haven&apos;t been reviewed yet and send them to Approvals in one go.</p></div>
      </div>
      <SectionHead id="all" className="mt-12" title={`All of ${t.first}’s images`} count={allImages.length} />
      {(sp.ok || sp.error) && <div role={sp.error ? "alert" : "status"} className={`mb-3 rounded-xl border p-2.5 text-[13px] ${sp.error ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok"}`}>{sp.error ?? sp.ok} {sp.ok && <Link href={`/approvals?view=grid&creator=${t.code}`} className="underline">Open Approvals</Link>}</div>}
      <ImagePicker images={allImages} back={`/talent/${t.code}#all`} readOnly={readOnly} />
      <SectionHead className="mt-12" title="Approved and ready to post" count={approved.length} />
      {approved.length === 0 ? <Empty>Nothing approved yet.</Empty> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{approved.map((a) => <Link key={a.id} href={`/post/${a.productionId}`} title="Open post kit"><AssetTile asset={a} label={a.publication === "PUBLISHED" ? "posted" : undefined} /></Link>)}</div>}
      <SectionHead className="mt-12" title={<>Posted {myPubs.some((x) => x.provider === "MOCK_INSTAGRAM") && <Pill tone="warn">mock</Pill>}</>} />
      {publications === null ? <p className="text-[13px] text-warn">Migration 0009 not applied — no publishing records.</p> : myPubs.length === 0 ? <p className="text-[13px] text-muted">Nothing published through Northline yet.</p> : <div className="grid gap-0 text-[12.5px]">{myPubs.slice(0, 8).map((x) => <div key={x.id} className="flex justify-between gap-2 border-t border-edge py-1.5 first:border-0"><span className="min-w-0 truncate">{x.caption || "no caption"}</span><span className="flex-none text-faint">{ago(x.publishedAt)}</span></div>)}</div>}
      <details className="mt-8 rounded-2xl border border-edge p-3"><summary className="cursor-pointer font-bold text-muted">Priority breakdown</summary><ul className="mt-2 grid gap-0.5 text-[13px]">{ov.priority.parts.filter((x) => x.reason !== "base").map((x) => <li key={x.reason} className="flex justify-between gap-2"><span>{x.reason}</span><span className="font-mono text-muted">{x.points > 0 ? "+" : ""}{x.points || ""}</span></li>)}</ul><p className="mt-2 text-[11.5px] text-faint">Base {ov.priority.parts[0].points}. It ranks only; it never generates, spends or publishes.</p></details>
      <Card className="mt-5">
        <h2 className="mb-2 font-bold">Productions</h2>
        {mine.length === 0 ? <Empty>No productions yet.</Empty> : mine.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>)}
      </Card>
    </>
  );
}
