import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { newestFirst } from "@/lib/db/order";
import { getTalent } from "@/lib/talent/roster";
import { REFERENCE_TYPES } from "@/lib/domain/types";
import { uploadReferenceAction, referenceControlAction } from "../../actions";
import { loadIdentity } from "@/lib/identity/service";
import { ReferenceLibrary } from "@/components/ReferenceLibrary";
import { AssetTile, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill, ago } from "@/components/ui";
import Link from "next/link";
import { CreatorPortrait } from "@/components/cc";
import { pickPortrait, PORTRAIT_TYPE_ORDER } from "@/lib/talent/portrait";
import { ImportDropzone } from "@/components/ImportDropzone";
import { isReadOnly } from "@/lib/runtime/mode";
import { creatorOverviews } from "@/lib/ops/creators";
import { listIfMigrated } from "@/lib/publishing/service";
import { weightsFromEnv } from "@/lib/priority";

export default async function TalentDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ refError?: string; refOk?: string }> }) {
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
  return (
    <>
      <section className="mb-8 grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="relative rounded-2xl p-[2px]" style={{ background: `linear-gradient(160deg, ${t.color}, transparent 70%)` }}><CreatorPortrait code={t.code} portrait={portrait} className="aspect-[3/4] w-full rounded-[14px]" />{portrait.source !== "FALLBACK" && <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur">{portrait.source === "MASTER_FACE" ? "Master face" : `Canonical · ${portrait.referenceType?.replace(/_/g, " ").toLowerCase()}`}</span>}</div>
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-3xl font-extrabold tracking-tight">{t.name}</h1><p className="text-muted">{t.code} · {t.age} · {t.markets.join(" / ")} · {t.role}</p></div>
            <div className="text-right"><span className="block font-mono text-3xl font-bold" style={{ color: t.color }}>{ov.priority.score}</span><span className="text-[10px] uppercase tracking-wider text-faint">priority</span></div>
          </div>
          <div className="flex flex-wrap gap-1.5">{t.criticalRules.map((r) => <span key={r} className="rounded-full border border-bad/30 bg-bad/5 px-2.5 py-1 text-[12px]">{r}</span>)}</div>
          <p className="text-[13.5px]"><span className="text-muted">Storyline:</span> {ov.storyline ?? "none active"} · <span className="text-muted">Last post:</span> {ov.lastContentAt ? ago(ov.lastContentAt) : "never"} · <span className="text-muted">Ready:</span> {ov.approvedReady}</p>
          {ov.priority.reasons.length > 0 && <p className="text-[12.5px] text-muted">Priority because: {ov.priority.reasons.slice(0, 3).join(" · ")}</p>}
          <div className="flex flex-wrap gap-2"><a href="#generated" className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold">⇪ Import</a><Link href={`/create?mode=generate&creator=${t.code}`} className="rounded-xl border border-edge bg-panel2 px-4 py-2 font-bold">✦ Generate</Link></div>
        </div>
      </section>
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted"><span className="h-px w-6 bg-bad/60" />Canonical references — identity authority, protected (imports and generated images never land here)</h2>
      <div className="mb-5 rounded-2xl border border-bad/25 bg-bad/[0.03] p-3">
        {strip.length === 0 ? <p className="p-3 text-center text-[13px] text-muted">No canonical images uploaded for {t.first} yet. <a href="#references" className="text-blue2">Add a master face →</a></p> : (
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
            <p className="text-[13px] text-muted">AI disclosure {launch[0]?.aiDisclosure ? "confirmed" : "not confirmed"} · handle {launch[0]?.handle ? `@${launch[0].handle}` : "not set"}. <a className="text-blue2" href="/launch">Manage →</a></p>
          </Card>
        </div>
      </div>
      <div id="references" className="mt-5"><ReferenceLibrary talent={t.code} refs={refs} identityId={ci.id} error={sp.refError} ok={!!sp.refOk} /></div>
      <h2 id="generated" className="mb-3 mt-10 flex scroll-mt-4 items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted"><span className="h-px w-6 bg-blue2/60" />Generated content — zero identity authority</h2>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-2xl border border-edge bg-panel/70 p-4"><h3 className="mb-2 font-bold">Import to {t.first}</h3><ImportDropzone readOnly={readOnly} fixedCreator={t.code} creators={[{ code: t.code, name: t.name, color: t.color, masterUrl: portrait.url }]} title={`Drop images for ${t.first}`} /></div>
        <div className="rounded-2xl border border-edge bg-panel/70 p-4"><h3 className="mb-2 font-bold">Recent content</h3>{recent.length === 0 ? <Empty>No content yet.</Empty> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{recent.map((a) => <Link key={a.id} href={`/assets/${a.id}`}><AssetTile asset={a} /></Link>)}</div>}</div>
      </div>
      <h2 className="mb-3 mt-10 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted"><span className="h-px w-6 bg-ok/60" />Approved · ready to publish</h2>
      {approved.length === 0 ? <Empty>Nothing approved yet.</Empty> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{approved.map((a) => <Link key={a.id} href={`/assets/${a.id}`}><AssetTile asset={a} label={a.publication === "PUBLISHED" ? "posted" : undefined} /></Link>)}</div>}
      <h2 className="mb-3 mt-10 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted"><span className="h-px w-6 bg-violet/60" />Published {myPubs.some((x) => x.provider === "MOCK_INSTAGRAM") && <Pill tone="warn">mock</Pill>}</h2>
      {publications === null ? <p className="text-[13px] text-warn">Migration 0009 not applied — no publishing records.</p> : myPubs.length === 0 ? <p className="text-[13px] text-muted">Nothing published through Northline yet.</p> : <div className="grid gap-0 text-[12.5px]">{myPubs.slice(0, 8).map((x) => <div key={x.id} className="flex justify-between gap-2 border-t border-edge py-1.5 first:border-0"><span className="min-w-0 truncate">{x.caption || "no caption"}</span><span className="flex-none text-faint">{ago(x.publishedAt)}</span></div>)}</div>}
      <details className="mt-8 rounded-2xl border border-edge p-3"><summary className="cursor-pointer font-bold text-muted">Priority breakdown</summary><ul className="mt-2 grid gap-0.5 text-[13px]">{ov.priority.parts.filter((x) => x.reason !== "base").map((x) => <li key={x.reason} className="flex justify-between gap-2"><span>{x.reason}</span><span className="font-mono text-muted">{x.points > 0 ? "+" : ""}{x.points || ""}</span></li>)}</ul><p className="mt-2 text-[11.5px] text-faint">Base {ov.priority.parts[0].points}. It ranks only; it never generates, spends or publishes.</p></details>
      <Card className="mt-5">
        <h2 className="mb-2 font-bold">Productions</h2>
        {mine.length === 0 ? <Empty>No productions yet.</Empty> : mine.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>)}
      </Card>
    </>
  );
}
