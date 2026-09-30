import { uploadReferenceAction, referenceControlAction } from "@/app/actions";
import type { ReferenceAsset } from "@/lib/db/records";
import { REFERENCE_TYPES, type TalentCode } from "@/lib/domain/types";
import { Btn, Card, Empty, Pill } from "./ui";

function RefTile({ r, talent }: { r: ReferenceAsset; talent: TalentCode }) {
  const master = r.authority === "MASTER";
  return (
    <div className={`overflow-hidden rounded-xl border ${master ? "border-blue2 shadow-[0_0_24px_rgba(91,140,255,.35)]" : "border-edge"} bg-panel2`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/references/${r.id}/file`} alt={`${r.referenceType} reference`} className={`w-full object-cover ${master ? "aspect-square" : "aspect-[4/5]"}`} />
      <div className="grid gap-1.5 p-2.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {master ? <Pill tone="info">★ MASTER</Pill> : <Pill>SUPPORTING</Pill>}
          <span className="font-mono">{r.referenceType}</span>
          {r.source === "promoted_from_generated" && <Pill tone="warn">promoted from generated</Pill>}
        </div>
        <div className="text-faint">{r.identityVersion} · added {r.createdAt.slice(0, 10)} · authority {master ? "100 (highest)" : "80"}</div>
        {r.notes && <div className="text-muted">{r.notes}</div>}
        <div className="flex gap-1.5">
          {!master && ["FACE_FRONT", "FACE_3Q_LEFT", "FACE_3Q_RIGHT", "FACE_PROFILE", "NATURAL_CANDID"].includes(r.referenceType) && <form action={referenceControlAction}><input type="hidden" name="talent" value={talent} /><input type="hidden" name="id" value={r.id} /><Btn name="op" value="master">Set as master</Btn></form>}
          <form action={referenceControlAction}><input type="hidden" name="talent" value={talent} /><input type="hidden" name="id" value={r.id} /><Btn name="op" value="archive">Archive</Btn></form>
        </div>
      </div>
    </div>
  );
}

export function ReferenceLibrary({ talent, refs, identityId, error, ok }: { talent: TalentCode; refs: ReferenceAsset[]; identityId: string; error?: string; ok: boolean }) {
  const active = refs.filter((r) => r.status === "ACTIVE");
  const master = active.find((r) => r.authority === "MASTER");
  const supporting = active.filter((r) => r.authority !== "MASTER").sort((a, b) => a.referenceType.localeCompare(b.referenceType));
  const archived = refs.filter((r) => r.status === "ARCHIVED");
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Canonical references <Pill tone="info">identity authority</Pill></h2><span className="text-[12px] text-muted">For {identityId}. Generated content has zero canonical authority and is never listed here.</span></div>
      {error && <div role="alert" className="mb-3 rounded-lg border border-bad/40 bg-bad/10 p-2 text-bad">{error}</div>}
      {ok && !error && <div className="mb-3 rounded-lg border border-ok/30 bg-ok/10 p-2 text-ok">Saved.</div>}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-blue2">Master</div>
          {master ? <RefTile r={master} talent={talent} /> : <Empty>No master face yet. Upload a MASTER_FACE — it is the highest identity authority.</Empty>}
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Supporting references ({supporting.length})</div>
          {supporting.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{supporting.map((r) => <RefTile key={r.id} r={r} talent={talent} />)}</div> : <Empty>No supporting references. Missing references stay missing — they are never backfilled from generated images.</Empty>}
        </div>
      </div>
      <form action={uploadReferenceAction} className="mt-5 grid gap-2 rounded-xl border border-edge p-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_1fr_170px_auto]">
        <input type="hidden" name="talent" value={talent} />
        <label className="text-[12px] text-muted">Image (PNG/JPEG/WebP, ≤10MB)<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required /></label>
        <label className="text-[12px] text-muted">Type<select name="type" defaultValue={master ? "FACE_FRONT" : "MASTER_FACE"}>{REFERENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-[12px] text-muted">Notes<input name="notes" maxLength={500} placeholder="optional" /></label>
        <label className="text-[12px] text-muted">Replaces (archives it)<select name="replaceId" defaultValue=""><option value="">— none —</option>{active.map((r) => <option key={r.id} value={r.id}>{r.referenceType} · {r.createdAt.slice(0, 10)}</option>)}</select></label>
        <div className="flex items-end"><Btn primary>Upload reference</Btn></div>
      </form>
      {archived.length > 0 && <details className="mt-3 text-[12px] text-muted"><summary className="cursor-pointer">Archived ({archived.length})</summary>{archived.map((r) => <div key={r.id} className="border-t border-edge py-1 font-mono">{r.referenceType} · {r.createdAt.slice(0, 10)} · {r.filename}{r.replacedById ? " · replaced" : ""}</div>)}</details>}
    </Card>
  );
}
