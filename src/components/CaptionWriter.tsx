"use client";
// Pick a caption in her voice: 3 options at a time ("Write more" for new ones), edit, save. Copy includes hashtags + AI tag.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCaptionAction, writeCaptionsAction } from "@/app/actions";

export function CaptionWriter({ productionId, initial, hashtags, aiTag, readOnly }: { productionId: string; initial: string; hashtags: string[]; aiTag: string; readOnly: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [opts, setOpts] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [tags, setTags] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const full = [text.trim(), tags ? [...hashtags, aiTag].join(" ") : aiTag].filter(Boolean).join("\n\n");
  const write = () => start(async () => {
    const r = await writeCaptionsAction(productionId, seed, seen);
    if (!r.ok) { setNote(r.error ?? "Couldn't write captions."); return; }
    setOpts(r.options); setSeen((s) => [...s, ...r.options]); setSeed((n) => n + 1);
    setNote(r.source === "ai" ? "Written by AI in her voice." : r.note ?? "From her voice templates (free). Add a text-AI key in settings for fresh AI captions.");
  });
  const save = (t = text) => start(async () => { const r = await saveCaptionAction(productionId, t); if (r.ok) { setSaved(t); router.refresh(); } else setNote(r.error ?? "Couldn't save."); });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={write} disabled={pending || readOnly} className="rounded-xl bg-gradient-to-br from-violet to-blue px-4 py-2 font-bold disabled:opacity-40">{pending ? "Writing…" : opts.length ? "✦ Write more" : "✦ Write captions"}</button>
        {note && <span className="self-center text-[12px] text-muted">{note}</span>}
      </div>
      {opts.length > 0 && <ul className="grid gap-2">{opts.map((o) => (
        <li key={o}><button type="button" onClick={() => { setText(o); save(o); }} disabled={readOnly} className={`w-full rounded-xl border px-3 py-2.5 text-left text-[14px] transition hover:border-blue2/60 ${text === o ? "border-blue2 bg-blue/15" : "border-edge bg-panel2/60"}`}>“{o}” <span className="float-right text-[11px] text-blue2">{text === o ? "using" : "use this"}</span></button></li>))}</ul>}
      <label className="text-[12px] text-muted">Caption<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write or pick a caption" className="mt-1 text-[14px]" /></label>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <button type="button" disabled={readOnly || pending || text === saved} onClick={() => save()} className="rounded-lg border border-edge px-3 py-1.5 disabled:opacity-40">{text === saved ? "Saved" : "Save caption"}</button>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={tags} onChange={(e) => setTags(e.target.checked)} className="size-4 !w-auto" />Add hashtags</label>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }} className="ml-auto rounded-lg bg-ok/85 px-3 py-1.5 font-bold text-[#0a0f24]">{copied ? "Copied ✓" : "Copy full caption"}</button>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-dashed border-edge p-3 font-sans text-[13px] text-muted">{full || "—"}</pre>
    </div>
  );
}
