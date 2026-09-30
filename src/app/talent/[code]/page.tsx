import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { newestFirst } from "@/lib/db/order";
import { getTalent } from "@/lib/talent/roster";
import { REFERENCE_TYPES } from "@/lib/domain/types";
import { uploadReferenceAction, referenceControlAction } from "../../actions";
import { loadIdentity } from "@/lib/identity/service";
import { ReferenceLibrary } from "@/components/ReferenceLibrary";
import { Avatar, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill } from "@/components/ui";

export default async function TalentDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ refError?: string; refOk?: string }> }) {
  const t = getTalent((await params).code.toUpperCase());
  if (!t) notFound();
  const repo = await getRepo();
  const [prods, refs, launch] = await Promise.all([repo.list("productions").then(newestFirst), repo.list("referenceAssets", { talent: t.code }), repo.list("launchStates", { talent: t.code })]);
  const sp = await searchParams;
  const loaded = await loadIdentity(repo, t.code); // persists the immutable snapshot on first view
  const ci = loaded.identity;
  const mine = prods.filter((p) => p.talent.includes(t.code));
  return (
    <>
      <PageHeader title={t.name} sub={`${t.code} · ${t.age} · ${t.markets.join(" / ")} · ${t.role}`} actions={<Avatar code={t.code} size={48} />} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Identity-critical rules</h2>
          <ul className="grid gap-2">{t.criticalRules.map((r) => <li key={r} className="rounded-lg border border-bad/30 bg-bad/5 p-2.5 text-[13px]">{r}</li>)}</ul>
          <h2 className="mb-2 mt-5 font-bold">Canonical identity</h2>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {(["hair", "eyes", "skin", "face", "body", "jewelry"] as const).map((k) => <><dt key={k + "d"} className="text-muted capitalize">{k}</dt><dd key={k}>{t.identity[k]}</dd></>)}
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
      <Card className="mt-5">
        <h2 className="mb-2 font-bold">Productions</h2>
        {mine.length === 0 ? <Empty>No productions yet.</Empty> : mine.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>)}
      </Card>
    </>
  );
}
