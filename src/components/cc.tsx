// Shared Command Center visuals: canonical creator portrait and the Identity / Anatomy / Realism QA pills.
import type { TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { Triad, TriadPart } from "@/lib/pipeline/qa-triad";
import { Pill } from "./ui";

/** The creator's canonical MASTER_FACE when one is uploaded; otherwise a labelled colour block (never a generated image). */
export function CreatorPortrait({ code, refId, className = "" }: { code: TalentCode; refId?: string | null; className?: string }) {
  const t = ROSTER_BY_CODE[code];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, ${t.color}66, #0b1128 80%)` }}>
      {refId ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/references/${refId}/file`} alt={`${t.name} — canonical master reference`} className="h-full w-full object-cover" />
        : <span className="grid h-full place-items-center text-center text-[10px] leading-tight text-muted"><b className="text-2xl text-ink">{t.first[0]}</b>no master</span>}
    </div>
  );
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
