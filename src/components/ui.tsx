import Link from "next/link";
import type { ReactNode } from "react";
import type { Asset, Production } from "@/lib/db/records";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { TalentCode } from "@/lib/domain/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-edge bg-panel/80 p-4 ${className}`}>{children}</section>;
}
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{sub && <p className="text-muted">{sub}</p>}</div>
      {actions}
    </header>
  );
}
const TONE: Record<string, string> = {
  ok: "text-ok border-ok/30", warn: "text-warn border-warn/30", bad: "text-bad border-bad/30", info: "text-blue2 border-blue2/30", mute: "text-muted border-edge",
};
export function Pill({ children, tone = "mute" }: { children: ReactNode; tone?: keyof typeof TONE }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] ${TONE[tone]}`}>{children}</span>;
}
const STATUS_TONE: Record<string, string> = {
  IDEA: "mute", GENERATING: "info", RAW: "warn", REVIEW: "info", APPROVED: "ok", SCHEDULED: "ok", PUBLISHED: "ok", REJECTED: "bad", ARCHIVED: "mute",
  PENDING: "warn", FAILED: "bad", REVISION_REQUESTED: "warn", COMPLETE: "ok", RUNNING: "info", QUEUED: "mute", RETRYING: "warn", WAITING: "warn",
};
export const StatusPill = ({ status }: { status: string }) => <Pill tone={STATUS_TONE[status] ?? "mute"}>{status.replace("_", " ")}</Pill>;
export const DemoBadge = ({ origin }: { origin: string }) => (origin === "demo" ? <Pill tone="warn">DEMO</Pill> : null);

export function Avatar({ code, size = 32 }: { code: TalentCode; size?: number }) {
  const t = ROSTER_BY_CODE[code];
  return (
    <span title={t.name} className="inline-grid flex-none place-items-center rounded-xl font-extrabold text-[#0a0f24]"
      style={{ width: size, height: size, background: t.color, boxShadow: `0 0 14px ${t.color}55`, fontSize: size * 0.42 }}>{t.first[0]}</span>
  );
}
export function TalentChips({ codes }: { codes: TalentCode[] }) {
  return <span className="inline-flex items-center gap-1.5">{codes.map((c) => <Link key={c} href={`/talent/${c}`} className="inline-flex items-center gap-1 hover:underline"><span className="h-2 w-2 rounded-full" style={{ background: ROSTER_BY_CODE[c].color }} />{ROSTER_BY_CODE[c].first}</Link>)}</span>;
}

/** Visual tile for an asset. Mock/demo assets have no file: shown as an explicit placeholder, never as a real image. */
export function AssetTile({ asset, label }: { asset: Asset; label?: string }) {
  const c = ROSTER_BY_CODE[asset.talent[0]].color;
  const has = !!asset.storagePath;
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-edge" style={{ background: `linear-gradient(160deg, ${c}33, #0b1128 70%)` }}>
      {has ? /* eslint-disable-next-line @next/next/no-img-element */ <img alt={asset.filename} src={`/api/assets/${asset.id}/file`} className="h-full w-full object-cover" />
        : <div className="grid h-full place-items-center p-2 text-center text-[11px] text-muted">{asset.status === "FAILED" ? "generation failed" : asset.status === "PENDING" ? "pending" : `${asset.provider} · no image`}<br />{asset.kind}-{String(asset.seq).padStart(2, "0")}</div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 p-1.5"><StatusPill status={asset.status} />{label && <span className="font-mono text-[10px]">{label}</span>}</div>
    </div>
  );
}
export const ProdLink = ({ p }: { p: Pick<Production, "id" | "code"> }) => <Link href={`/productions/${p.id}`} className="font-mono text-blue2 hover:underline">{p.code}</Link>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="rounded-xl border border-dashed border-edge p-6 text-center text-muted">{children}</div>;
export const Btn = ({ children, primary, ...rest }: { children: ReactNode; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...rest} className={`rounded-xl border px-3.5 py-2 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "border-transparent bg-gradient-to-br from-blue to-[#4d5cf0] text-white" : "border-edge bg-panel2 text-ink hover:brightness-125"} ${rest.className ?? ""}`}>{children}</button>
);
