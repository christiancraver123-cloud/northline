"use client";
import { useMemo, useState } from "react";
import { ROSTER } from "@/lib/talent/roster";
import { CONTENT_TYPES, type ContentType, type TalentCode } from "@/lib/domain/types";
import { parseIntent } from "@/lib/orchestrator/intent";
import { planRequest } from "@/lib/orchestrator/plan";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import { createAction } from "../actions";

const EXAMPLES = ["Create a Miami weekend campaign for Sienna and Zoe", "Create a Pilates to coffee carousel for Zoe", "Create a Reel for Vesper at a rooftop party", "Give Sienna three Miami nightlife posts"];

export function CreateForm({ error }: { error?: string }) {
  const [text, setText] = useState("");
  const [talent, setTalent] = useState<TalentCode[]>([]);
  const [format, setFormat] = useState<ContentType>("CAROUSEL");
  const [concept, setConcept] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [assetCount, setAssetCount] = useState<number | "">("");
  const [issues, setIssues] = useState<string[]>([]);

  function interpret() {
    const { request, issues } = parseIntent(text);
    setIssues(issues);
    if (!request) return;
    setTalent(request.talent); setFormat(request.format); setConcept(request.concept); setQuantity(request.quantity); setAssetCount(request.asset_count ?? "");
  }
  const request = useMemo(() => {
    const r = CreateRequestSchema.safeParse({ talent, format, concept, quantity, asset_count: assetCount === "" ? undefined : assetCount });
    return r.success ? r.data : null;
  }, [talent, format, concept, quantity, assetCount]);
  const plan = useMemo(() => (request ? planRequest(request) : null), [request]);

  return (
    <form action={createAction} className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <div className="grid content-start gap-4">
        {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{error}</div>}
        <div className="rounded-2xl border border-edge bg-panel/80 p-4">
          <label className="mb-1 block font-bold" htmlFor="nl">Describe what you want</label>
          <textarea id="nl" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Create a Miami weekend campaign for Sienna and Zoe" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={interpret} className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-3.5 py-2 font-bold">Interpret</button>
            {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-edge px-2.5 py-1 text-[12px] text-muted hover:text-ink">{e}</button>)}
          </div>
          {issues.map((i) => <p key={i} className="mt-2 text-warn">{i}</p>)}
        </div>
        <div className="rounded-2xl border border-edge bg-panel/80 p-4">
          <div className="mb-1 font-bold">Talent</div>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Talent">
            {ROSTER.map((t) => {
              const on = talent.includes(t.code);
              return <button key={t.code} type="button" aria-pressed={on} onClick={() => setTalent(on ? talent.filter((c) => c !== t.code) : [...talent, t.code])}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${on ? "border-transparent text-[#0a0f24]" : "border-edge text-muted"}`} style={on ? { background: t.color } : undefined}>{t.first}</button>;
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>Format<select value={format} onChange={(e) => setFormat(e.target.value as ContentType)}>{CONTENT_TYPES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Quantity<input type="number" min={1} max={10} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(10, +e.target.value || 1)))} /></label>
            <label>Frames (optional)<input type="number" min={1} max={10} value={assetCount} onChange={(e) => setAssetCount(e.target.value ? +e.target.value : "")} /></label>
          </div>
          <label className="mt-3 block">Concept<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Pilates to coffee run" /></label>
        </div>
      </div>
      <div className="grid content-start gap-4">
        <div className="rounded-2xl border border-edge bg-panel/80 p-4">
          <h2 className="mb-2 font-bold">Plan preview</h2>
          {!plan ? <p className="text-muted">Pick at least one creator.</p> : (
            <>
              {plan.campaign && <p className="mb-2">Campaign <b>{plan.campaign.name}</b> · {plan.campaign.scope.replace("_", " ")}</p>}
              <ul className="mb-3 grid gap-1 text-[13px]">{plan.productions.map((p, i) => <li key={i} className="flex justify-between border-t border-edge pt-1 first:border-0 first:pt-0"><span>{p.talent.map((c) => ROSTER.find((t) => t.code === c)!.first).join(" + ")}</span><span className="text-muted">{p.contentType}{p.role === "shared" ? " · shared" : ""}</span></li>)}</ul>
              <ol className="grid gap-0.5 text-[12px] text-muted">{plan.tasks.map((t) => <li key={t.id}><span className="font-mono text-blue2">{t.agent}</span> — {t.summary}</li>)}</ol>
            </>
          )}
        </div>
        <input type="hidden" name="request" value={JSON.stringify(request ?? {})} />
        <button disabled={!request} className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-3 font-bold disabled:opacity-40">Generate drafts →</button>
        <p className="text-[12px] text-faint">Creates production records and assets, then queues them for approval. Nothing is published.</p>
      </div>
    </form>
  );
}
