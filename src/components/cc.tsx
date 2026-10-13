// Shared Command Center visuals: canonical creator portrait and the Identity / Anatomy / Realism QA pills.
import type { TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { Triad, TriadPart } from "@/lib/pipeline/qa-triad";
import { Pill } from "./ui";
import { portraitUrl, type Portrait } from "@/lib/talent/portrait";

/** Creator portrait from the canonical library: MASTER_FACE → best active canonical reference → colour/initial fallback. Never a generated image. */
export function CreatorPortrait({ code, refId, portrait, className = "", label = true }: { code: TalentCode; refId?: string | null; portrait?: Portrait | null; className?: string; label?: boolean }) {
  const t = ROSTER_BY_CODE[code];
  const url = portrait ? portrait.url : refId ? portraitUrl(refId) : null;
  const src = portrait?.source ?? (refId ? "MASTER_FACE" : "FALLBACK");
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, ${t.color}66, #0c0a0d 80%)` }} title={src === "MASTER_FACE" ? `${t.name} · canonical master face` : src === "CANONICAL_REFERENCE" ? `${t.name} · canonical reference (no master face yet)` : `${t.name} · no canonical image yet`}>
      {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={`${t.name} — canonical ${src === "MASTER_FACE" ? "master face" : "reference"}`} loading="lazy" className="h-full w-full object-cover object-top" />
        : <span className="grid h-full place-items-center text-center leading-tight"><span><b className="block text-[2.2em] font-extrabold" style={{ color: t.color }}>{t.first[0]}</b>{label && <span className="text-[10px] text-muted">no canonical image</span>}</span></span>}
    </div>
  );
}

/** Small round creator avatar (canonical source only) with the creator colour as a ring. */
export function CreatorAvatar({ code, portrait, size = 28, ring = true, className = "" }: { code: TalentCode; portrait?: Portrait | null; size?: number; ring?: boolean; className?: string }) {
  const t = ROSTER_BY_CODE[code];
  return (
    <span className={`relative inline-grid flex-none place-items-center overflow-hidden rounded-full ${className}`} title={t.name}
      style={{ width: size, height: size, background: `linear-gradient(160deg, ${t.color}aa, #0c0a0d)`, boxShadow: ring ? `0 0 0 2px ${t.color}` : undefined }}>
      {portrait?.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={portrait.url} alt={t.name} loading="lazy" className="h-full w-full object-cover object-[50%_30%]" />
        : <b style={{ fontSize: size * 0.45 }} className="text-ink">{t.first[0]}</b>}
    </span>
  );
}

/** Avatar + first name, for rows and cards. */
export function CreatorTag({ code, portrait, size = 22, className = "" }: { code: TalentCode; portrait?: Portrait | null; size?: number; className?: string }) {
  const t = ROSTER_BY_CODE[code];
  return <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}><CreatorAvatar code={code} portrait={portrait} size={size} /><span className="truncate font-semibold">{t.first}</span></span>;
}

const TONE = { PASS: "ok", REVIEW: "warn", FAIL: "bad", "NOT RUN": "mute" } as const;
export function TriadPills({ triad, compact = false }: { triad: Triad; compact?: boolean }) {
  const parts: [string, TriadPart][] = [["Identity", triad.identity], ["Anatomy", triad.anatomy], ["Realism", triad.realism]];
  return <>{parts.map(([k, p]) => <span key={k} title={`${k}: ${p.verdict} · confidence ${p.confidence}${p.issues.length ? ` — ${p.issues.join("; ")}` : ""}`}><Pill tone={TONE[p.verdict]}>{compact ? k[0] : k} {p.verdict === "NOT RUN" ? "–" : p.verdict}</Pill></span>)}</>;
}

export function TriadDetail({ triad }: { triad: Triad }) {
  const parts: [string, TriadPart][] = [["Identity", triad.identity], ["Anatomy", triad.anatomy], ["Realism", triad.realism]];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {parts.map(([k, p]) => (
        <div key={k} className="rounded-xl border border-edge p-2.5 text-[12.5px]">
          <div className="mb-1 flex items-center justify-between gap-2"><b>{k}</b><Pill tone={TONE[p.verdict]}>{p.verdict}</Pill></div>
          <div className="text-faint">Confidence: {p.confidence}{p.inspected ? "" : " · not visually inspected"}</div>
          {p.issues.length > 0 && <ul className="mt-1 grid gap-0.5 text-muted">{p.issues.map((i) => <li key={i}>• {i}</li>)}</ul>}
          <p className="mt-1">{p.recommendation}</p>
        </div>
      ))}
    </div>
  );
}
