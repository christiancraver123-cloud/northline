import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { getTalent } from "@/lib/talent/roster";
import { REFERENCE_SLOTS } from "@/lib/domain/types";
import { Avatar, Card, DemoBadge, Empty, PageHeader, Pill, ProdLink, StatusPill } from "@/components/ui";

export default async function TalentDetail({ params }: { params: Promise<{ code: string }> }) {
  const t = getTalent((await params).code.toUpperCase());
  if (!t) notFound();
  const repo = await getRepo();
  const [prods, refs, launch] = await Promise.all([repo.list("productions"), repo.list("referenceAssets", { talent: t.code }), repo.list("launchStates", { talent: t.code })]);
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
          <p className="mt-3 text-[12px] text-faint">Source: src/lib/talent/roster.ts. Generated images never replace these.</p>
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
            <h2 className="mb-2 font-bold">Reference hierarchy</h2>
            <div className="grid grid-cols-2 gap-1.5">{REFERENCE_SLOTS.map((s) => {
              const r = refs.find((x) => x.slot === s && x.storagePath);
              return <div key={s} className="flex items-center justify-between rounded-lg border border-edge px-2.5 py-1.5 text-[12px]"><span className="font-mono">{s}</span>{r ? <Pill tone="ok">set</Pill> : <Pill tone="warn">missing</Pill>}</div>;
            })}</div>
            <p className="mt-2 text-[12px] text-faint">Missing references stay missing — they are never backfilled from generated images. (Upload flow: TODO.)</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Launch</h2>
            <p className="text-[13px] text-muted">AI disclosure {launch[0]?.aiDisclosure ? "confirmed" : "not confirmed"} · handle {launch[0]?.handle ? `@${launch[0].handle}` : "not set"}. <a className="text-blue2" href="/launch">Manage →</a></p>
          </Card>
        </div>
      </div>
      <Card className="mt-5">
        <h2 className="mb-2 font-bold">Productions</h2>
        {mine.length === 0 ? <Empty>No productions yet.</Empty> : mine.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge py-2 first:border-0"><span className="flex items-center gap-3"><ProdLink p={p} /><span className="text-muted">{p.contentType} · {p.concept}</span><DemoBadge origin={p.origin} /></span><StatusPill status={p.status} /></div>)}
      </Card>
    </>
  );
}
