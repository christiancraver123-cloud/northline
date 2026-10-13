import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { CreatorAvatar } from "@/components/cc";
import { CaptionWriter } from "@/components/CaptionWriter";
import { CopyButton } from "@/components/CopyButton";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { AI_TAG, hashtagsFor } from "@/lib/captions/writer";
import { deliveryFor } from "@/lib/pipeline/derive";
import { isReadOnly } from "@/lib/runtime/mode";
import { deliveryAction, markProductionPostedAction } from "../../actions";

/** Post kit: everything needed to post by hand from a phone — right-size image, caption in her voice, hashtags, AI label reminder. */
export default async function PostKit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params, sp = await searchParams;
  const repo = await getRepo();
  const p = await repo.get("productions", id);
  if (!p) notFound();
  const [assets, captions, refs, cal, launch] = await Promise.all([repo.list("assets", { productionId: id }), repo.list("captions", { productionId: id }), repo.list("referenceAssets"), repo.list("calendarEntries", { productionId: id }), repo.list("launchStates")]);
  const t = ROSTER_BY_CODE[p.talent[0]], portraits = pickPortraits(refs), readOnly = isReadOnly();
  const imgs = assets.filter((a) => a.current && a.kind === "IMG" && a.storagePath && (p.status === "PUBLISHED" ? a.status === "APPROVED" : a.status !== "REJECTED")).sort((a, b) => a.seq - b.seq);
  const delivery = await deliveryFor(repo, id);
  const approved = ["APPROVED", "SCHEDULED"].includes(p.status), posted = p.status === "PUBLISHED";
  const slot = cal.find((c) => c.state !== "PUBLISHED");
  const handle = launch.find((l) => l.talent === t.code)?.handle;
  const caption = captions.find((c) => c.kind === "FEED")?.text ?? "";
  const dl = (kind: "assets" | "derivatives", fid: string, name: string) => `/api/${kind}/${fid}/file?download=1&name=${encodeURIComponent(name)}`;
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <CreatorAvatar code={t.code} portrait={portraits[t.code]} size={56} />
        <div className="min-w-0 flex-1"><p className="text-[12px] font-bold uppercase tracking-wider text-muted">Post kit · {p.code}</p><h1 className="text-2xl font-extrabold tracking-tight">{t.first}{handle ? <span className="ml-2 text-[15px] font-medium text-muted">@{handle}</span> : null}</h1><p className="line-clamp-2 text-[13px] text-muted">{p.concept}</p></div>
        <span className={`w-full rounded-full px-3 py-1 text-center text-[12px] font-bold sm:w-auto ${posted ? "bg-ok/20 text-ok" : approved ? "bg-blue/25 text-blue2" : "bg-warn/20 text-warn"}`}>{posted ? "Posted" : approved ? `Ready${slot ? ` · ${slot.date} ${slot.time}` : ""}` : "Not approved yet"}</span>
      </header>
      {sp.ok && <div role="status" className="mb-4 rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{sp.ok}</div>}
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}
      {!approved && !posted && <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">Approve this first. <Link href="/approvals" className="underline">Approvals →</Link></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Images" className="grid content-start gap-3">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">1 · Image{imgs.length > 1 ? `s (${imgs.length}, in order)` : ""}</h2>
          {imgs.map((a, i) => { const d = delivery.get(a.id); const png = a.filename.toLowerCase().endsWith(".png"); return (
            <div key={a.id} className="overflow-hidden rounded-2xl border border-edge bg-panel/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d ? `/api/derivatives/${d.id}/file` : `/api/assets/${a.id}/file`} alt={`${p.code} ${i + 1}`} className="mx-auto max-h-[70vh] w-auto" />
              <div className="flex flex-wrap items-center gap-2 border-t border-edge p-3 text-[13px]">
                {d ? <a href={dl("derivatives", d.id, `${p.code}_${i + 1}_4x5.png`)} className="rounded-lg bg-ok/85 px-3 py-1.5 font-bold text-[#0a0f24]">Download for Instagram (4:5)</a>
                  : png && !readOnly ? <form action={deliveryAction}><input type="hidden" name="productionId" value={p.id} /><input type="hidden" name="assetId" value={a.id} /><input type="hidden" name="back" value={`/post/${p.id}`} /><button className="rounded-lg bg-blue/80 px-3 py-1.5 font-bold">Make 4:5 Instagram size</button></form> : null}
                <a href={dl("assets", a.id, a.filename.split("/").pop() ?? `${p.code}.png`)} className="rounded-lg border border-edge px-3 py-1.5">Download original</a>
                {d && <span className="text-[11.5px] text-faint">{d.width}×{d.height}</span>}
              </div>
            </div>); })}
          {!imgs.length && <p className="rounded-xl border border-dashed border-edge p-6 text-center text-muted">No image yet.</p>}
        </section>

        <section aria-label="Caption and posting" className="grid content-start gap-5">
          <div><h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">2 · Caption in {t.first}&apos;s voice</h2>
            <CaptionWriter productionId={p.id} initial={caption} hashtags={hashtagsFor(t.code)} aiTag={AI_TAG} readOnly={readOnly} /></div>
          <div className="rounded-2xl border border-edge bg-panel/70 p-4">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">3 · Post it from your phone</h2>
            <ol className="grid gap-1.5 text-[13.5px]">
              <li>1. Download the image (above) — on your phone it saves to Photos.</li>
              <li>2. Copy the full caption.</li>
              <li>3. Instagram → <b>+</b> → pick the image → paste the caption.</li>
              <li>4. <b>Advanced settings → turn on “Add AI label”.</b> Every post, no exceptions.</li>
              <li>5. Post, then come back and record it below.</li>
            </ol>
            {handle && <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">Posting as <b className="text-ink">@{handle}</b><CopyButton text={handle} label="Copy handle" /></div>}
          </div>
          {approved && <form action={markProductionPostedAction} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 p-4">
            <input type="hidden" name="productionId" value={p.id} />
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="confirm" value="yes" required className="size-5 !w-auto" />I posted it on Instagram</label>
            <button disabled={readOnly} className="rounded-xl bg-ok/90 px-4 py-2 font-bold text-[#0a0f24] disabled:opacity-40">Record</button>
            <span className="text-[12px] text-muted">Northline never posts for you; this just records it.</span>
          </form>}
        </section>
      </div>
    </>
  );
}
