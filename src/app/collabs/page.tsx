import Link from "next/link";
import { getRepo } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CreatorAvatar } from "@/components/cc";
import { NetworkGraph } from "@/components/NetworkGraph";
import { EDGES } from "@/lib/collab/network";
import { planCollab, type CollabPlan } from "@/lib/collab/plan";
import { collabMembers } from "@/lib/collab/members";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER, ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { TalentCode } from "@/lib/domain/types";
import { isReadOnly } from "@/lib/runtime/mode";
import { createCollabAction } from "../actions";

type SP = { c?: string | string[]; event?: string; location?: string; ok?: string; error?: string };

/** Collab planner (ported from the original Command Center): friend graph → believable line-up → per-account posts. */
export default async function Collabs({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [members, refs, prods] = await Promise.all([collabMembers(repo), repo.list("referenceAssets"), repo.list("productions")]);
  const portraits = pickPortraits(refs);
  const live = Object.fromEntries(members.map((m) => [m.code, m.live]));
  const picked = (Array.isArray(sp.c) ? sp.c : sp.c ? [sp.c] : []).filter((c) => c in ROSTER_BY_CODE);
  let plan: CollabPlan | null = null, problem = "";
  if (picked.length && sp.event) { try { plan = planCollab({ codes: picked, event: sp.event, location: sp.location }, members); } catch (e) { problem = e instanceof Error ? e.message : "Can't plan this."; } }
  const first = (c: string) => ROSTER_BY_CODE[c as TalentCode]?.first ?? c;
  const existing = prods.filter((p) => p.contentType === "COLLAB" || (p.contentType === "REEL" && p.talent.length > 1)).slice(-12).reverse();
  return (
    <>
      <PageHeader title="Collabs" sub="Who knows whom, and how a shared day rolls out across their accounts." />
      {sp.ok && <div role="status" className="mb-4 rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{sp.ok} <Link href="/productions" className="underline">Productions</Link></div>}
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}
      <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-edge bg-panel/70 p-4">
          <h2 className="mb-2 font-bold">Friend map</h2>
          <NetworkGraph portraits={portraits} live={live} highlight={picked} />
          <ul className="mt-3 grid gap-1.5 text-[12.5px] text-muted">{EDGES.map((e) => <li key={e.a + e.b}><b className="text-ink">{first(e.a)} + {first(e.b)}</b>: {e.how}.</li>)}</ul>
        </section>
        <section className="rounded-2xl border border-edge bg-panel/70 p-4">
          <h2 className="mb-2 font-bold">Plan a collab</h2>
          <form className="grid gap-3">
            <div role="group" aria-label="Creators" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ROSTER.map((t) => (
                <label key={t.code} className="relative cursor-pointer overflow-hidden rounded-xl border border-edge has-[:checked]:border-transparent has-[:checked]:ring-2 has-[:checked]:ring-blue2">
                  <input type="checkbox" name="c" value={t.code} defaultChecked={picked.includes(t.code)} className="peer sr-only" />
                  <span className="block aspect-[3/4]" style={{ background: t.color }}>{portraits[t.code].url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={portraits[t.code].url!} alt="" className="h-full w-full object-cover object-top" />}</span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 text-[12px] font-bold">{t.first}</span>
                  <span className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-full bg-blue2 text-[11px] font-black text-[#141016] peer-checked:grid">✓</span>
                </label>
              ))}
            </div>
            <label>Event<input name="event" defaultValue={sp.event ?? ""} placeholder="Miami boat day" required /></label>
            <label>Location (optional)<input name="location" defaultValue={sp.location ?? ""} placeholder="Biscayne Bay" /></label>
            <button className="justify-self-start rounded-xl border border-edge bg-panel2 px-4 py-2 font-bold">Preview plan</button>
          </form>
          {problem && <p role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">{problem}</p>}
        </section>
      </div>

      {plan && (
        <section aria-label="Plan" className="mb-8 rounded-2xl border border-edge bg-panel/70 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-extrabold">{plan.title} <span className="text-[12px] font-normal text-muted">· {plan.kind === "event" ? "all-six event" : plan.kind} · {plan.timeOfDay}</span></h2></div>
          <p className="mb-3 max-w-4xl text-[13px] text-muted">{plan.storyline}</p>
          <ol className="grid gap-2">{plan.posts.map((p, k) => (
            <li key={k} className="flex flex-wrap items-start gap-3 rounded-xl border border-edge p-2.5 text-[13px]">
              <span className="w-14 flex-none font-mono text-[11px] text-muted">day {p.day}</span>
              <CreatorAvatar code={p.owner as TalentCode} portrait={portraits[p.owner as TalentCode]} size={30} />
              <span className="min-w-0 flex-1"><b>{first(p.owner)}</b> <span className="font-mono text-[11px] text-muted">{p.format}</span>{p.waitsForLaunch && <span className="ml-1 text-[11px] text-warn">waits for launch</span>}<span className="block">“{p.caption}”</span>
                {p.stories.length > 0 && <span className="block text-[11.5px] text-faint">{p.stories.map((s) => `${first(s.by)}: ${s.what}`).join(" ")}</span>}</span>
            </li>))}</ol>
          <p className="mt-2 text-[12px] text-faint">Reel: {plan.reel.beats.join(" → ")}</p>
          {plan.notes.length > 0 && <ul className="mt-2 grid gap-1 text-[12px] text-warn">{plan.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
          <form action={createCollabAction} className="mt-3 flex flex-wrap items-center gap-3">
            {picked.map((c) => <input key={c} type="hidden" name="c" value={c} />)}<input type="hidden" name="event" value={sp.event} /><input type="hidden" name="location" value={sp.location ?? ""} />
            <button disabled={isReadOnly()} className="rounded-xl bg-blue2 text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab] px-4 py-2 font-bold disabled:opacity-40">Create {plan.posts.length} productions</button>
            <span className="text-[12px] text-faint">They start as ideas with captions and prompts. Nothing is generated, scheduled or posted.</span>
          </form>
        </section>
      )}

      {existing.length > 0 && <section><h2 className="mb-2 h-section">Recent collab productions</h2><ul className="grid gap-1 text-[13px]">{existing.map((p) => <li key={p.id}><Link href={`/productions/${p.id}`} className="text-blue2">{p.code}</Link> <span className="text-muted">{p.concept}</span></li>)}</ul></section>}
    </>
  );
}
