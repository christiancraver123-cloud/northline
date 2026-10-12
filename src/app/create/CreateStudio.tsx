"use client";
// Create studio: select creator → brief → settings → prompt preview (editable) → GENERATE 1 IMAGE (with a confirmation summary).
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ReferenceAuthority, ReferenceType, TalentCode } from "@/lib/domain/types";
import { ASPECT_RATIOS, IMAGE_QUALITIES, type GenerationSettings } from "@/lib/orchestrator/contracts";
import { briefComplete, EMPTY_BRIEF, previewPrompt, toCreative, type StudioBrief } from "@/lib/pipeline/preview";
import { createImageAction } from "../actions";

export interface StudioCreator {
  /** Canonical portrait (MASTER_FACE → best canonical reference → none). */
  portraitUrl: string | null;
  code: TalentCode; name: string; color: string; active: boolean; rules: string[]; storyline: string | null;
  refs: { id: string; type: ReferenceType; authority: ReferenceAuthority; url: string }[];
  recent: { id: string; code: string; concept: string; status: string }[];
}
interface Props {
  creators: StudioCreator[]; error?: string; readOnly: boolean; initial: { code: TalentCode; brief: StudioBrief; prompt: string | null } | null; initialCreator: TalentCode | null;
  provider: { name: string; model: string | null; mode: "mock" | "openai" | "unavailable"; reason: string | null; paidEnabled: boolean };
  pricePerImage: number | null; budget: { text: string; remaining: number | null }; paused: boolean;
}

const FIELDS: [keyof StudioBrief, string, string, boolean?][] = [
  ["scene", "Scene", "Morning coffee on her balcony overlooking the bay", true], ["location", "Location", "Brickell high-rise balcony, Miami", true],
  ["activity", "Activity", "holding an iced latte, checking her phone"], ["outfit", "Outfit", "oversized white linen shirt, gold hoops", true],
  ["mood", "Mood", "relaxed, a little mischievous"], ["pose", "Pose", "leaning on the railing, three-quarter to camera"],
  ["camera", "Camera style", "candid iPhone, slightly low angle"], ["lighting", "Lighting", "soft golden-hour sun from the left", true],
  ["storyBeat", "Storyline beat", "first morning back in Miami"], ["notes", "Custom notes", "keep the background uncluttered"],
];
const Step = ({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) => (
  <section className="rounded-2xl border border-edge bg-panel/80 p-4">
    <h2 className="mb-3 flex items-center gap-2 font-bold"><span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] ${done ? "bg-ok/25 text-ok" : "bg-blue/25 text-blue2"}`}>{done ? "✓" : n}</span>{title}</h2>
    {children}
  </section>
);

export function CreateStudio({ creators, error, readOnly, initial, initialCreator, provider, pricePerImage, budget, paused }: Props) {
  const [code, setCode] = useState<TalentCode | null>(initial?.code ?? initialCreator);
  const [brief, setBrief] = useState<StudioBrief>(initial?.brief ?? EMPTY_BRIEF);
  const [settings, setSettings] = useState<GenerationSettings>({ aspectRatio: "4:5", quality: "high", identityMode: "strict" });
  const [edited, setEdited] = useState<string | null>(initial?.prompt ?? null);
  const [confirm, setConfirm] = useState(false);
  const c = creators.find((x) => x.code === code) ?? null;
  const ready = !!c && briefComplete(brief);
  const preview = useMemo(() => (c && ready ? previewPrompt(c.code, brief, settings, c.refs, { name: provider.name, model: provider.model }) : null), [c, ready, brief, settings, provider.name, provider.model]);
  const finalPrompt = edited ?? preview?.finalPrompt ?? "";
  const overridden = !!preview && edited !== null && edited.trim() !== preview.finalPrompt.trim();
  const request = c && ready ? {
    talent: [c.code], format: "POST", platform: "instagram", concept: brief.scene.slice(0, 500), quantity: 1, asset_count: 1,
    creative: toCreative(brief, { ...settings, ...(overridden ? { promptOverride: finalPrompt.trim() } : {}) }),
  } : null;
  const unavailable = provider.mode === "unavailable";
  const blockers = [readOnly && "Read-only mode: generation is disabled on this deployment", unavailable && `PROVIDER NOT CONFIGURED — ${provider.reason}`, paused && "Emergency pause is ON", budget.remaining === 0 && "Daily image budget used up", preview?.severity === "HARD_FAIL" && "The prompt breaks a canonical identity hard lock"].filter(Boolean) as string[];
  const cost = pricePerImage === null ? "UNKNOWN (no pricing configured)" : `$${pricePerImage.toFixed(2)}`;

  return (
    <form action={createImageAction} className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{error}</div>}
        <Step n={1} title="Select creator" done={!!c}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Creator">
            {creators.map((x) => {
              const on = x.code === code;
              return (
                <button key={x.code} type="button" role="radio" aria-checked={on} onClick={() => { setCode(x.code); setEdited(null); }}
                  className={`group relative overflow-hidden rounded-xl border text-left transition ${on ? "border-transparent" : "border-edge opacity-70 hover:opacity-100"}`} style={on ? { boxShadow: `0 0 0 3px ${x.color}, 0 12px 30px -12px ${x.color}` } : undefined}>
                  <div className="aspect-[3/4] w-full" style={{ background: `linear-gradient(160deg, ${x.color}55, #0b1128 75%)` }}>
                    {x.portraitUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.portraitUrl} alt={`${x.name} canonical portrait`} className="h-full w-full object-cover object-top" /> : <span className="grid h-full place-items-center text-3xl font-extrabold" style={{ color: x.color }}>{x.name[0]}</span>}
                  </div>
                  {on && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-[13px] font-black text-[#0a0f24]" style={{ background: x.color }}>✓</span>}
                  <div className="px-2 py-1.5 text-[12.5px] font-bold">{x.name.split(" ")[0]}<span className={`ml-1.5 text-[10px] font-normal ${x.active ? "text-ok" : "text-warn"}`}>{x.active ? "active" : "setup"}</span></div>
                </button>
              );
            })}
          </div>
          {c && (
            <div className="mt-3 grid gap-3 text-[12.5px] sm:grid-cols-2">
              <div><div className="mb-1 font-semibold text-muted">Identity rules (locked)</div><ul className="grid gap-0.5">{c.rules.map((r) => <li key={r}>• {r}</li>)}</ul>
                <p className="mt-1 text-faint">{c.refs.length ? `${c.refs.length} canonical reference(s): ${c.refs.map((r) => r.type.replace(/_/g, " ").toLowerCase()).join(", ")}` : "No canonical references uploaded — identity relies on the written record only."}</p></div>
              <div><div className="mb-1 font-semibold text-muted">Storyline</div><p>{c.storyline ?? "No active storyline."}</p>
                <div className="mb-1 mt-2 font-semibold text-muted">Recent productions</div>{c.recent.length ? c.recent.map((p) => <Link key={p.id} href={`/productions/${p.id}`} className="block truncate text-blue2 hover:underline"><span className="font-mono">{p.code}</span> · {p.concept} <span className="text-faint">({p.status})</span></Link>) : <p className="text-faint">None yet.</p>}</div>
            </div>
          )}
        </Step>
        <Step n={2} title="Content brief" done={ready}>
          <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-blue2/60 bg-blue/20 px-3 py-1 font-semibold">Image</span>
            <span className="rounded-full border border-edge px-3 py-1 text-faint" title="Coming later">Carousel · later</span>
            <span className="rounded-full border border-edge px-3 py-1 text-faint" title="Coming later">Reel · later</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, label, ph, req]) => (
              <label key={k} className={k === "scene" || k === "notes" ? "sm:col-span-2" : ""}>{label}{req && <span className="text-warn"> *</span>}
                <input value={brief[k]} placeholder={ph} maxLength={k === "scene" || k === "notes" ? 400 : 200} onChange={(e) => { setBrief({ ...brief, [k]: e.target.value }); setEdited(null); }} />
              </label>
            ))}
          </div>
        </Step>
        <Step n={3} title="Generation settings" done={ready}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><div className="mb-1 text-[13px]">Aspect ratio</div><div className="flex gap-1.5">{ASPECT_RATIOS.map((a) => <button key={a} type="button" aria-pressed={settings.aspectRatio === a} onClick={() => setSettings({ ...settings, aspectRatio: a })} className={`rounded-lg border px-3 py-1.5 font-mono text-[12.5px] ${settings.aspectRatio === a ? "border-blue2 bg-blue/25" : "border-edge text-muted"}`}>{a}</button>)}</div></div>
            <label>Quality<select value={settings.quality} onChange={(e) => setSettings({ ...settings, quality: e.target.value as GenerationSettings["quality"] })}>{IMAGE_QUALITIES.map((q) => <option key={q}>{q}</option>)}</select></label>
            <div><div className="mb-1 text-[13px]">Identity mode</div><div className="rounded-lg border border-edge px-3 py-1.5 text-[12.5px]"><b>Very strict</b> face + body · flexible styling</div></div>
          </div>
          <p className="mt-2 text-[12px] text-faint">{preview ? `Provider renders ${preview.size} (${preview.aspect}).` : "4:5 and 9:16 are delivered as crops of a 2:3 render; 1:1 renders square."} Strict mode sends the master reference at high input fidelity.</p>
        </Step>
      </div>

      <div className="grid content-start gap-4 xl:sticky xl:top-4">
        <Step n={4} title="Prompt preview" done={!!preview}>
          {!preview ? <p className="text-muted">Pick a creator and fill the starred fields to see exactly what is sent.</p> : (
            <>
              <div className="grid gap-2">{preview.sections.map((s) => (
                <details key={s.key} className="rounded-lg border border-edge px-3 py-2 text-[12.5px]" open={s.key === "scene"}><summary className="cursor-pointer font-semibold uppercase tracking-wide text-muted">{s.label}</summary><p className="mt-1 whitespace-pre-wrap break-words">{s.text}</p></details>
              ))}</div>
              <label className="mt-3 block font-semibold">Final prompt {overridden && <span className="ml-1 rounded-full bg-warn/20 px-2 text-[11px] text-warn">edited</span>}
                <textarea rows={8} value={finalPrompt} onChange={(e) => setEdited(e.target.value)} className="mt-1 font-mono text-[12px]" />
              </label>
              <div className="mt-1 flex flex-wrap gap-3 text-[12px]">{overridden && <button type="button" onClick={() => setEdited(null)} className="text-blue2">Reset to assembled prompt</button>}<span className="text-faint">Edits still pass the identity hard-lock check before anything is generated.</span></div>
              {preview.findings.length > 0 && !overridden && <p className={`mt-2 text-[12.5px] ${preview.severity === "HARD_FAIL" ? "text-bad" : "text-warn"}`}>Identity check: {preview.findings.join("; ")}</p>}
            </>
          )}
        </Step>
        <Step n={5} title="Generate">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted">Creator</dt><dd>{c?.name ?? "—"}</dd>
            <dt className="text-muted">Provider</dt><dd className={unavailable ? "text-bad" : provider.mode === "mock" ? "text-warn" : ""}>{unavailable ? "PROVIDER NOT CONFIGURED" : `${provider.name}${provider.model ? ` · ${provider.model}` : ""}${provider.mode === "mock" ? " (mock — no paid call)" : ""}`}</dd>
            <dt className="text-muted">Aspect ratio</dt><dd>{settings.aspectRatio} · quality {settings.quality}</dd>
            <dt className="text-muted">Identity mode</dt><dd>Very strict face + body</dd>
            <dt className="text-muted">Estimated cost</dt><dd>{cost}</dd>
            <dt className="text-muted">Budget</dt><dd>{budget.text}</dd>
          </dl>
          {blockers.length > 0 && <ul className="mt-3 grid gap-1 rounded-lg border border-warn/40 bg-warn/10 p-2 text-[12.5px] text-warn">{blockers.map((b) => <li key={b}>• {b}</li>)}</ul>}
          <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 !w-auto" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />I confirm: generate exactly one image for {c?.name.split(" ")[0] ?? "this creator"}.</label>
          <input type="hidden" name="request" value={JSON.stringify(request ?? {})} />
          <input type="hidden" name="confirmed" value={confirm ? "yes" : ""} />
          <button disabled={!request || !confirm || blockers.length > 0} title={readOnly ? "Read-only mode: changes are disabled" : undefined}
            className="mt-3 w-full rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-3 text-[15px] font-extrabold tracking-wide disabled:cursor-not-allowed disabled:opacity-40">GENERATE 1 IMAGE</button>
          <p className="mt-2 text-[12px] text-faint">The image goes through Identity, Anatomy and Realism QA, then waits in Approvals. Nothing is posted.</p>
        </Step>
      </div>
    </form>
  );
}
