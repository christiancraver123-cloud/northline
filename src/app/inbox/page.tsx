import Link from "next/link";
import { Card, PageHeader, Pill } from "@/components/ui";
import { CreatorAvatar } from "@/components/cc";
import { instagramStatus } from "@/lib/flags";
import { getRepo } from "@/lib/db";
import { isReadOnly } from "@/lib/runtime/mode";
import { listBatches, readBatch } from "@/lib/inbox/folder-server";
import { INBOX_NOTE, type InboxItem } from "@/lib/inbox/folder";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { sendInboxAction } from "../actions";

const VERDICT_TONE = { post: "ok", fix: "warn", hold: "info", reject: "bad" } as const;
type SP = { batch?: string; folder?: string; ok?: string; error?: string };

/** Images: the folder inbox next to the app (read-only), sent into Northline on your click. DMs: placeholder until Instagram is reconnected. */
export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ig = instagramStatus();
  const readOnly = isReadOnly();
  const batches = await listBatches();
  const batch = batches.includes(sp.batch ?? "") ? sp.batch! : batches[0] ?? "";
  const items = batch ? await readBatch(batch) : [];
  const repo = await getRepo();
  const [prods, refs] = await Promise.all([repo.list("productions"), repo.list("referenceAssets")]);
  const portraits = pickPortraits(refs);
  const sentKeys = new Set(prods.flatMap((p) => (p.brief?.shots ?? []).map((s) => s.description)).flatMap((d) => { const i = d.indexOf(INBOX_NOTE); return i > -1 ? [d.slice(i + INBOX_NOTE.length).trim()] : []; }));
  const folders = [...new Set(items.map((i) => i.folder))].sort((a, b) => Number(items.find((i) => i.folder === b)!.group.kind === "creator") - Number(items.find((i) => i.folder === a)!.group.kind === "creator") || a.localeCompare(b));
  const folder = folders.includes(sp.folder ?? "") ? sp.folder! : folders[0] ?? "";
  const shown = items.filter((i) => i.folder === folder);
  const g = shown[0]?.group;
  const sendable = (i: InboxItem) => i.group.kind === "creator" && !sentKeys.has(i.key);
  const back = `/inbox?batch=${encodeURIComponent(batch)}&folder=${encodeURIComponent(folder)}`;
  const q = (o: Partial<SP>) => `/inbox?${new URLSearchParams({ batch, ...o } as Record<string, string>).toString()}`;
  return (
    <>
      <PageHeader title="Inbox" sub="Images waiting next to the app, and (later) creator DMs." />
      {sp.ok && <div role="status" className="mb-4 rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{sp.ok} <Link href="/approvals" className="underline">Open Approvals →</Link></div>}
      {sp.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">{sp.error}</div>}

      <section aria-label="Image inbox" className="mb-8">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">Images</h2>
        {!batches.length ? <p className="rounded-xl border border-dashed border-edge p-6 text-center text-muted">No inbox folder on this machine. Put batches in “_Inbox (unsorted Higgsfield + ChatGPT downloads)” next to the app, or set NORTHLINE_INBOX_DIR.</p> : <>
          <nav aria-label="Batch" className="mb-2 flex flex-wrap gap-1.5 text-[12.5px]">{batches.map((b) => <Link key={b} href={q({ batch: b })} className={`rounded-full border px-3 py-1 ${b === batch ? "border-blue2 bg-blue/20" : "border-edge text-muted"}`}>{b}</Link>)}</nav>
          <nav aria-label="Folder" className="mb-4 flex flex-wrap gap-1.5 text-[12.5px]">{folders.map((f) => { const gk = items.find((i) => i.folder === f)!.group; const n = items.filter((i) => i.folder === f).length; return (
            <Link key={f} href={q({ folder: f })} className={`flex items-center gap-1.5 rounded-full border py-0.5 pr-3 ${gk.kind === "creator" ? "pl-0.5" : "pl-3"} ${f === folder ? "border-blue2 bg-blue/20 font-semibold" : "border-edge text-muted"}`}>
              {gk.kind === "creator" && <CreatorAvatar code={gk.code} portrait={portraits[gk.code]} size={22} ring={false} />}{f}<span className="font-mono text-faint">{n}</span></Link>); })}</nav>
          <form action={sendInboxAction} className="grid gap-3">
            <input type="hidden" name="back" value={back} />
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              {g?.kind === "creator" ? <><b>{ROSTER_BY_CODE[g.code].name}</b><span className="text-muted">Tick images, then send them to Approvals (QA runs; nothing is posted). Up to 30 at a time.</span>
                <button disabled={readOnly || !shown.some(sendable)} className="ml-auto rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold disabled:opacity-40">Send ticked to Approvals</button></>
                : <span className="text-muted">{g?.kind === "collab" ? "Collab images need one creator per post, so they stay here for now." : "Reference material: shown for context, never sent to Approvals."}</span>}
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{shown.map((i) => { const done = sentKeys.has(i.key); return (
              <li key={i.key} className={`relative overflow-hidden rounded-xl border bg-panel/70 ${done ? "border-ok/40 opacity-60" : "border-edge"}`}>
                {sendable(i) && !readOnly && <label className="absolute left-2 top-2 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-black/60"><input type="checkbox" name="key" value={i.key} aria-label={`Select ${i.file}`} className="size-4 !w-auto" /></label>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/inbox/file?key=${encodeURIComponent(i.key)}`} alt={i.file} loading="lazy" className="aspect-[4/5] w-full object-cover" />
                <div className="grid gap-1 p-2 text-[11.5px]">
                  <span className="truncate text-muted" title={i.file}>{i.file}</span>
                  <span className="flex flex-wrap gap-1">{done && <Pill tone="ok">in Northline</Pill>}{i.review && <span title={i.review.note}><Pill tone={VERDICT_TONE[i.review.verdict]}>Claude: {i.review.verdict}</Pill></span>}</span>
                </div>
              </li>); })}</ul>
          </form>
        </>}
      </section>

      <details className="rounded-2xl border border-edge p-3">
        <summary className="cursor-pointer font-bold text-muted">DMs — {ig.label}</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-[13px]">{ig.detail}</p>
          <p className="text-[12.5px] text-muted">When the account is back, DMs will arrive through Meta&apos;s official messaging webhooks only — no browser automation, no unofficial logins. Replies about brands, money, contracts or anything sensitive will always wait for you.</p>
          <Card><h3 className="mb-2 font-bold">Accounts</h3>{["Sienna", "Alessia", "Mila", "Vesper", "Zoe", "Skye"].map((n) => <div key={n} className="flex items-center justify-between border-t border-edge py-1.5 text-[13px] first:border-0">{n}<Pill tone="mute">disconnected</Pill></div>)}</Card>
        </div>
      </details>
    </>
  );
}
