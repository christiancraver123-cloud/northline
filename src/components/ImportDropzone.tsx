"use client";
// Native drag-and-drop image import. States: idle → drag-over → (confirm) → uploading → success | failure.
// Validates type and size in the browser for fast feedback; the server re-validates by file content.
import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importAction, type ImportActionResult } from "@/app/actions";

export interface DropCreator { code: string; name: string; color: string; masterUrl: string | null }
type Item = { id: string; file: File; url: string; state: "ready" | "uploading" | "success" | "failure"; result?: ImportActionResult; error?: string };
const MAX = 10 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function ImportDropzone({ creators, fixedCreator, defaultCreator, replaceProductionId, readOnly, compact = false, details = true, title }: {
  creators: DropCreator[]; fixedCreator?: string; defaultCreator?: string | null; replaceProductionId?: string; readOnly: boolean; compact?: boolean; details?: boolean; title?: string;
}) {
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [creator, setCreator] = useState<string>(fixedCreator ?? defaultCreator ?? "");
  const [meta, setMeta] = useState({ scene: "", location: "", outfit: "", notes: "", caption: "", storyBeat: "" });
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const c = creators.find((x) => x.code === creator) ?? null;

  const add = useCallback((files: FileList | File[]) => {
    const next: Item[] = [...files].slice(0, replaceProductionId ? 1 : 12).map((file, i) => {
      const bad = !OK_TYPES.includes(file.type) ? "Only PNG, JPEG or WebP images." : file.size > MAX ? "Larger than 10 MB." : file.size === 0 ? "Empty file." : null;
      return { id: `${Date.now()}-${i}-${file.name}`, file, url: URL.createObjectURL(file), state: bad ? "failure" : "ready", error: bad ?? undefined };
    });
    setItems((prev) => (replaceProductionId ? next : [...prev.filter((x) => x.state !== "success"), ...next]));
  }, [replaceProductionId]);

  const upload = () => start(async () => {
    for (const it of items.filter((x) => x.state === "ready")) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, state: "uploading" } : x)));
      const fd = new FormData();
      fd.set("file", it.file); fd.set("talent", creator);
      if (replaceProductionId) fd.set("replaceProductionId", replaceProductionId);
      for (const [k, v] of Object.entries(meta)) fd.set(k, v);
      let r: ImportActionResult;
      try { r = await importAction(fd); } catch { r = { ok: false, error: "Upload failed (connection or server error)." }; }
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, state: r.ok ? "success" : "failure", result: r, error: r.ok ? undefined : r.error } : x)));
    }
    router.refresh();
  });

  const ready = items.filter((x) => x.state === "ready").length;
  const disabled = readOnly || pending;
  return (
    <div className="grid gap-3">
      {!fixedCreator && (
        <div role="radiogroup" aria-label="Creator" className="flex flex-wrap gap-2">
          {creators.map((x) => (
            <button key={x.code} type="button" role="radio" aria-checked={creator === x.code} onClick={() => setCreator(x.code)}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] font-semibold ${creator === x.code ? "border-transparent text-[#0a0f24]" : "border-edge text-muted hover:text-ink"}`} style={creator === x.code ? { background: x.color } : undefined}>
              <span className="h-6 w-6 overflow-hidden rounded-full" style={{ background: x.color }}>{x.masterUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.masterUrl} alt="" className="h-full w-full object-cover" />}</span>{x.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}
      <div
        role="button" tabIndex={0} aria-label={title ?? "Drop images here or click to choose"} aria-disabled={readOnly}
        onClick={() => !readOnly && input.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !readOnly) input.current?.click(); }}
        onDragEnter={(e) => { e.preventDefault(); if (!readOnly) setOver(true); }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = readOnly ? "none" : "copy"; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!readOnly && e.dataTransfer.files.length) add(e.dataTransfer.files); }}
        data-state={over ? "drag-over" : pending ? "uploading" : "idle"}
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed text-center transition ${compact ? "min-h-28 p-4" : "min-h-56 p-8"} ${readOnly ? "cursor-not-allowed opacity-50" : ""} ${over ? "border-blue2 bg-blue/15 scale-[1.01]" : "border-edge bg-panel/60 hover:border-blue2/60"}`}>
        <div>
          <div className={`mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full ${over ? "bg-blue2/30" : "bg-panel2"} text-xl`}>⇪</div>
          <p className="font-bold">{readOnly ? "Read-only mode: importing is disabled" : over ? "Drop to add" : title ?? "Drag images here"}</p>
          <p className="text-[12.5px] text-muted">{replaceProductionId ? "One image. It becomes a new version; the old one stays in history." : "PNG, JPEG or WebP · up to 10 MB each · or click to choose"}</p>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple={!replaceProductionId} className="hidden" aria-label="Choose image files" onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <ul className="grid gap-2">{items.map((it) => (
          <li key={it.id} className={`flex items-center gap-3 rounded-xl border p-2 ${it.state === "failure" ? "border-bad/50 bg-bad/10" : it.state === "success" ? "border-ok/40 bg-ok/10" : "border-edge"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" className="h-16 w-13 flex-none rounded-lg object-cover" style={{ width: "3.25rem" }} />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <div className="truncate font-semibold">{it.file.name}</div>
              <div className="text-muted">{size(it.file.size)} · {c ? c.name : "no creator chosen"}</div>
              {it.state === "uploading" && <div className="mt-1 h-1 overflow-hidden rounded bg-panel2"><div className="h-full w-1/2 animate-pulse bg-blue2" /></div>}
              {it.state === "failure" && <div className="text-bad">{it.error}</div>}
              {it.state === "success" && it.result?.ok && <div className="text-ok">Imported as <Link className="underline" href={`/productions/${it.result.productionId}`}>{it.result.code}</Link> · {it.result.status === "REVIEW" ? <Link className="underline" href="/approvals">in Approvals</Link> : it.result.status}</div>}
            </div>
            <span className="flex-none font-mono text-[11px] uppercase text-faint">{it.state === "ready" ? "ready" : it.state}</span>
            {it.state !== "uploading" && it.state !== "success" && <button type="button" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} className="flex-none px-1 text-muted hover:text-ink">✕</button>}
          </li>
        ))}</ul>
      )}

      {details && !replaceProductionId && items.some((x) => x.state === "ready") && (
        <details className="rounded-xl border border-edge p-3 text-[13px]">
          <summary className="cursor-pointer font-semibold text-muted">Add details (optional) — applied to {ready === 1 ? "this image" : `these ${ready} images`}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["scene", "location", "outfit", "storyBeat", "caption", "notes"] as const).map((k) => (
              <label key={k} className={k === "caption" || k === "notes" ? "sm:col-span-2" : ""}>{k === "storyBeat" ? "Storyline beat" : k[0].toUpperCase() + k.slice(1)}
                {k === "caption" ? <textarea rows={2} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /> : <input value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />}
              </label>
            ))}
          </div>
        </details>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={disabled || !ready || !creator} onClick={upload}
            className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">
            {pending ? "Importing…" : replaceProductionId ? `Replace image${c ? ` for ${c.name.split(" ")[0]}` : ""}` : `Import ${ready} image${ready === 1 ? "" : "s"}${c ? ` to ${c.name.split(" ")[0]}` : ""}`}
          </button>
          {!creator && <span className="text-[12.5px] text-warn">Choose the creator first.</span>}
          <span className="text-[12px] text-faint">Each image runs through QA and waits in Approvals. Imports never become canonical references.</span>
        </div>
      )}
    </div>
  );
}
