import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CreateForm } from "./CreateForm";
import { CreateStudio, type StudioCreator } from "./CreateStudio";
import { ImportDropzone } from "@/components/ImportDropzone";
import { isReadOnly } from "@/lib/runtime/mode";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { loadReferences } from "@/lib/references/service";
import { resolveImageProvider } from "@/lib/providers";
import { loadCommandCenter } from "@/lib/ops/load";
import { imageGenerationEnabled } from "@/lib/flags";
import { EMPTY_BRIEF, type StudioBrief } from "@/lib/pipeline/preview";
import { newestFirst } from "@/lib/db/order";
import type { TalentCode } from "@/lib/domain/types";

/** Founder-supplied price per image (USD, NORTHLINE_IMAGE_PRICE_USD). Without it the estimate is UNKNOWN — never guessed. */
function pricePerImage(mode: string): number | null {
  if (mode === "mock") return 0;
  const v = Number(process.env.NORTHLINE_IMAGE_PRICE_USD);
  return process.env.NORTHLINE_IMAGE_PRICE_USD && Number.isFinite(v) ? v : null;
}

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string; from?: string; creator?: string }> }) {
  const sp = await searchParams;
  const readOnly = isReadOnly();
  if (sp.mode === "planner") {
    return (<><PageHeader title="Create · planner" sub="Campaigns, carousels and multi-creator plans from one sentence." actions={<Link href="/create" className="text-blue2">← One-image studio</Link>} /><CreateForm error={sp.error} readOnly={readOnly} /></>);
  }
  const repo = await getRepo();
  const [prods, storylines, cc] = await Promise.all([repo.list("productions").then(newestFirst), repo.list("storylines"), loadCommandCenter(repo)]);
  const creators: StudioCreator[] = await Promise.all(ROSTER.map(async (t) => {
    const refs = await loadReferences(repo, t.code);
    return {
      code: t.code, name: t.name, color: t.color, active: t.launchStatus === "active", rules: t.criticalRules,
      refs: refs.map((r) => ({ id: r.id, type: r.referenceType, authority: r.authority, url: `/api/references/${r.id}/file` })),
      storyline: storylines.find((s) => s.status === "ACTIVE" && s.talent.includes(t.code))?.title ?? null,
      recent: prods.filter((p) => p.talent[0] === t.code).slice(0, 4).map((p) => ({ id: p.id, code: p.code, concept: p.concept, status: p.status })),
    };
  }));
  const generate = sp.mode === "generate" || !!sp.from;
  const tabs = (
    <div role="tablist" aria-label="Studio" className="mb-5 grid grid-cols-2 gap-2 sm:inline-grid sm:grid-cols-[auto_auto]">
      <Link role="tab" aria-selected={!generate} href={`/create${sp.creator ? `?creator=${sp.creator}` : ""}`} className={`rounded-xl border px-4 py-2.5 text-center font-bold ${!generate ? "border-blue2 bg-blue/20" : "border-edge text-muted hover:text-ink"}`}>⇪ Import asset</Link>
      <Link role="tab" aria-selected={generate} href={`/create?mode=generate${sp.creator ? `&creator=${sp.creator}` : ""}`} className={`rounded-xl border px-4 py-2.5 text-center font-bold ${generate ? "border-blue2 bg-blue/20" : "border-edge text-muted hover:text-ink"}`}>✦ Generate with AI</Link>
    </div>
  );
  const header = <PageHeader title="Studio" sub="Bring in images you made anywhere, or generate one. Everything goes through QA and your approval." actions={<Link href="/create?mode=planner" className="rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-[13px] font-bold">Campaign planner</Link>} />;
  if (!generate) {
    return (
      <>
        {header}{tabs}
        <section className="rounded-2xl border border-edge bg-panel/80 p-4 sm:p-5">
          <h2 className="mb-1 text-lg font-bold">Import asset</h2>
          <p className="mb-4 text-[13px] text-muted">Pick the creator, drop the images. No prompt and no AI provider needed.</p>
          <ImportDropzone readOnly={readOnly} defaultCreator={ROSTER.find((t) => t.code === sp.creator)?.code ?? null} creators={creators.map((x) => ({ code: x.code, name: x.name, color: x.color, masterUrl: x.refs.find((r) => r.type === "MASTER_FACE")?.url ?? null }))} />
        </section>
      </>
    );
  }
  const img = resolveImageProvider();
  const limits = cc.budget.limits;
  const day = Array.isArray(limits) ? limits.filter((l) => l.metric === "images_per_day" && l.enabled) : [];
  const global = day.find((l) => l.scope === "global");
  const budget = cc.budget.governor === "OFF" ? { text: "Governor OFF — no daily limit enforced", remaining: null as number | null }
    : !Array.isArray(limits) ? { text: `Daily limits ${limits}`, remaining: null }
    : { text: day.map((l) => `${l.scope === "global" ? "All creators" : l.scopeKey}: ${Math.max(0, l.limit - l.used)} of ${l.limit} left today`).join(" · ") || "No daily image limit configured", remaining: global ? Math.max(0, global.limit - global.used) : null };

  // "Edit prompt" from Approvals starts from an existing production's brief and its latest prompt.
  let initial: { code: TalentCode; brief: StudioBrief; prompt: string | null } | null = null;
  if (sp.from) {
    const p = await repo.get("productions", sp.from);
    if (p?.brief) {
      const prompt = (await repo.list("prompts", { productionId: p.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const shot = p.brief.shots[0];
      initial = { code: p.talent[0], prompt: prompt?.positive ?? null, brief: { ...EMPTY_BRIEF, scene: shot?.description ?? p.concept, location: p.brief.location, outfit: p.brief.outfit, lighting: p.brief.lighting, camera: shot?.camera ?? "", storyBeat: p.brief.storyBeat, notes: `Remake of ${p.code}` } };
    }
  }
  return (
    <>
      {header}{tabs}
      <CreateStudio creators={creators} error={sp.error} readOnly={readOnly} initial={initial} initialCreator={ROSTER.find((t) => t.code === sp.creator)?.code ?? null}
        provider={{ name: img.provider.name, model: img.provider.model ?? null, mode: img.mode, reason: img.reason, paidEnabled: imageGenerationEnabled() }}
        pricePerImage={pricePerImage(img.mode)} budget={budget} paused={cc.budget.pause.paused === true} />
    </>
  );
}
