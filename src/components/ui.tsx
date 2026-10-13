import Link from "next/link";
import type { Portrait, Portraits } from "@/lib/talent/portrait";
import { isReadOnly } from "@/lib/runtime/mode";
import type { ReactNode } from "react";
import type { Asset, Production } from "@/lib/db/records";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { TalentCode } from "@/lib/domain/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-edge/70 bg-panel/80 p-4 shadow-[0_1px_0_rgba(255,255,255,.035)_inset,0_24px_48px_-36px_rgba(0,0,0,.9)] ${className}`}>{children}</section>;
}
/** Page title in the agency's editorial serif. `eyebrow` is for real context (a creator, a production code), never decoration. */
export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-muted">{eyebrow}</div>}
        <h1 className="display text-[34px] leading-[1.05] text-ink sm:text-[42px]">{title}</h1>
        {sub && <p className="mt-2 max-w-[68ch] text-[14.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
/** Section heading row: title, optional count and a right-side link/action. */
export function SectionHead({ title, count, action, id, className = "" }: { title: ReactNode; count?: number; action?: ReactNode; id?: string; className?: string }) {
  return (
    <div id={id} className={`mb-3 flex scroll-mt-20 items-baseline justify-between gap-3 ${className}`}>
      <h2 className="h-section flex items-baseline gap-2">{title}{count !== undefined && <span className="num text-[12px] font-medium text-faint">{count}</span>}</h2>
      {action}
    </div>
  );
}
/** Compact figure: label above, number below. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="min-w-0 rounded-xl border border-edge/70 bg-panel/60 px-4 py-3">
      <div className="truncate text-[12.5px] text-muted">{label}</div>
      <div className={`num mt-0.5 text-[22px] font-semibold leading-tight ${c}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[12px] text-faint">{hint}</div>}
    </div>
  );
}
const TONE: Record<string, string> = {
  ok: "text-ok bg-ok/10 border-ok/20", warn: "text-warn bg-warn/10 border-warn/20", bad: "text-bad bg-bad/10 border-bad/20", info: "text-blue2 bg-blue2/10 border-blue2/20", mute: "text-muted bg-white/[0.04] border-edge/70",
};
export function Pill({ children, tone = "mute" }: { children: ReactNode; tone?: keyof typeof TONE }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[11.5px] font-semibold leading-[18px] ${TONE[tone]}`}>{children}</span>;
}
const STATUS_TONE: Record<string, string> = {
  IDEA: "mute", GENERATING: "info", RAW: "warn", REVIEW: "info", APPROVED: "ok", SCHEDULED: "ok", PUBLISHED: "ok", REJECTED: "bad", ARCHIVED: "mute",
  PENDING: "warn", FAILED: "bad", REVISION_REQUESTED: "warn", COMPLETE: "ok", RUNNING: "info", QUEUED: "mute", RETRYING: "warn", WAITING: "warn", SUCCEEDED: "ok", SUBMITTED: "info", PROCESSING: "info", HARD_FAIL: "bad", MANUAL_REVIEW_REQUIRED: "warn", QA_PENDING: "mute", PASS: "ok", ERROR: "bad",
};
export const StatusPill = ({ status }: { status: string }) => <Pill tone={STATUS_TONE[status] ?? "mute"}>{humanize(status)}</Pill>;
/** "MANUAL_REVIEW_REQUIRED" -> "Manual review required". */
export const humanize = (s: string) => { const t = s.replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
export const DemoBadge = ({ origin }: { origin: string }) => (origin === "demo" ? <Pill tone="warn">Demo</Pill> : null);

/** Creator avatar. With a canonical portrait it shows the image (never generated content); without one, the colour/initial block. */
export function Avatar({ code, size = 32, portrait }: { code: TalentCode; size?: number; portrait?: Portrait | null }) {
  const t = ROSTER_BY_CODE[code];
  return (
    <span title={t.name} className="inline-grid flex-none place-items-center overflow-hidden rounded-xl font-extrabold text-[#141016]"
      style={{ width: size, height: size, background: t.color, boxShadow: `0 0 0 2px ${t.color}, 0 0 14px ${t.color}55`, fontSize: size * 0.42 }}>
      {portrait?.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={portrait.url} alt={t.name} loading="lazy" className="h-full w-full object-cover object-[50%_30%]" /> : t.first[0]}
    </span>
  );
}
export function TalentChips({ codes, portraits }: { codes: TalentCode[]; portraits?: Portraits }) {
  return <span className="inline-flex items-center gap-2">{codes.map((c) => <Link key={c} href={`/talent/${c}`} className="inline-flex items-center gap-1.5 hover:underline">{portraits ? <span className="inline-block h-6 w-6 flex-none overflow-hidden rounded-full" style={{ background: ROSTER_BY_CODE[c].color, boxShadow: `0 0 0 2px ${ROSTER_BY_CODE[c].color}` }}>{portraits[c].url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={portraits[c].url!} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_30%]" />}</span> : <span className="h-2 w-2 rounded-full" style={{ background: ROSTER_BY_CODE[c].color }} />}{ROSTER_BY_CODE[c].first}</Link>)}</span>;
}

/** Visual tile for an asset. Mock/demo assets have no file: shown as an explicit placeholder, never as a real image. */
export function AssetTile({ asset, label }: { asset: Asset; label?: string }) {
  const c = ROSTER_BY_CODE[asset.talent[0]].color;
  const has = !!asset.storagePath;
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-edge" style={{ background: `linear-gradient(160deg, ${c}33, var(--color-sheet) 70%)` }}>
      {has ? /* eslint-disable-next-line @next/next/no-img-element */ <img alt={asset.filename} src={`/api/assets/${asset.id}/file`} className="h-full w-full object-cover" />
        : <div className="grid h-full place-items-center p-2 text-center text-[11px] text-muted">{asset.status === "FAILED" ? "generation failed" : asset.status === "PENDING" ? "pending" : `${asset.provider} · no image`}<br />{asset.kind}-{String(asset.seq).padStart(2, "0")}</div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5 pt-6"><StatusPill status={asset.status} />{label && <span className="font-mono text-[10px]">{label}</span>}</div>
    </div>
  );
}
export const ProdLink = ({ p }: { p: Pick<Production, "id" | "code"> }) => <Link href={`/productions/${p.id}`} className="font-mono text-blue2 hover:underline">{p.code}</Link>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="rounded-2xl border border-dashed border-edge/80 bg-panel/30 px-6 py-8 text-center text-[13.5px] text-muted">{children}</div>;
export const BTN_PRIMARY = "border-transparent bg-blue2 text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab]";
export const BTN_QUIET = "border-edge bg-panel2 text-ink hover:border-[#4a414c] hover:bg-[#2b262d]";
export const Btn = ({ children, primary, ...rest }: { children: ReactNode; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...rest} disabled={rest.disabled || isReadOnly()} title={isReadOnly() ? "Read-only mode: changes are disabled" : rest.title} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${primary ? BTN_PRIMARY : BTN_QUIET} ${rest.className ?? ""}`}>{children}</button>
);

// ---- Agent Operations Center ------------------------------------------------
const AGENT_TONE: Record<string, string> = { WORKING: "info", QUEUED: "info", WAITING: "warn", SCHEDULED: "mute", IDLE: "mute", FAILED: "bad", PAUSED: "warn" };
export const AgentStatusPill = ({ status }: { status: string }) => <Pill tone={AGENT_TONE[status] ?? "mute"}>{status === "WORKING" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue2" />}{humanize(status)}</Pill>;

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Shows the ACTUAL provider/model that did the work ("rules" = deterministic, no model call). */
export function ProviderPill({ provider, model, fallback }: { provider: string | null | undefined; model?: string | null; fallback?: boolean }) {
  if (!provider) return null;
  const tone = provider === "rules" ? "mute" : provider === "mock" ? "warn" : "info";
  return <Pill tone={tone}>{provider}{model ? ` · ${model}` : ""}{fallback ? " · fallback" : ""}</Pill>;
}
export const PROVIDER_STATE_TONE: Record<string, string> = { configured: "ok", unavailable: "mute", rate_limited: "warn", quota_exhausted: "bad", failed: "bad" };

export const QA_TONE: Record<string, string> = { PASS: "ok", REVIEW: "warn", HARD_FAIL: "bad", MANUAL_REVIEW_REQUIRED: "warn", QA_PENDING: "mute", NOT_RUN: "mute" };
export const QaPill = ({ status }: { status: string }) => <Pill tone={QA_TONE[status] as never ?? "mute"}>{status === "MANUAL_REVIEW_REQUIRED" ? "Manual review" : humanize(status)}</Pill>;
