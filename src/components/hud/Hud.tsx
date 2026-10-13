"use client";
// Command HUD — full-screen mission control. Real data only (passed in from /hud); animation and sound are decoration.
// Interactive: focus a creator, review/approve/deny the queue in a holographic inspector, type or speak commands, spoken briefing.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hudDecideAction } from "@/app/actions";
import { isMuted, setMuted, sfx, speak } from "./fx";

export interface HudCreator { code: string; name: string; first: string; color: string; portrait: string | null; active: boolean; priority: number; ready: number; pending: number; images: number; refs: number; lastPost: string | null; city: string }
export interface HudQueueItem { id: string; code: string; concept: string; talent: string; color: string; thumb: string | null; qa: string; age: number; blockers: string[] }
export interface HudData {
  generatedAt: string;
  creators: HudCreator[];
  queue: HudQueueItem[];
  pending: number;
  pipeline: { key: string; label: string; count: number }[];
  system: { mode: string; store: string; instagram: string; governor: string; autonomous: string; imagesToday: number; queue: { queued: number; running: number; failed: number; blocked: number }; providers: { label: string; state: string }[] };
  totals: { images: number; refs: number; productions: number; approved: number };
  activity: number[];
  log: { at: string; level: string; kind: string; message: string }[];
  schedule: { date: string; time: string; talent: string; color: string; code: string; productionId: string }[];
  attention: { text: string; tone: string; href: string }[];
}
type Line = { at: string; level: string; kind: string; message: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ny = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
const ago = (iso: string | null, now: number) => { if (!iso) return "never"; const s = Math.max(0, (now - new Date(iso).getTime()) / 1000); return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const okState = (s: string) => s === "configured" || s === "ok";
const DOT = "h-1.5 w-1.5 rounded-full bg-[var(--h-cyan)] shadow-[0_0_8px_var(--h-cyan)]";

function Panel({ title, tag, children, className = "", onTitle }: { title: string; tag?: string; children: React.ReactNode; className?: string; onTitle?: () => void }) {
  const head = <div className="hud-title"><span className={DOT} />{title}{tag && <span className="tag">{tag}</span>}</div>;
  return (
    <section className={`hud-panel flex min-h-0 flex-col ${className}`}>
      {onTitle ? <button type="button" onClick={onTitle} onMouseEnter={() => sfx("hover")} className="hud-link block w-full text-left">{head}</button> : head}
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

/* ───────────── studio core (rings + orbit) ───────────── */
function Core({ d, pending, hover, setHover, onPick, onCenter }: { d: HudData; pending: number; hover: string | null; setHover: (c: string | null) => void; onPick: (c: string) => void; onCenter: () => void }) {
  const C = 300;
  const ticks = useMemo(() => Array.from({ length: 120 }, (_, i) => i), []);
  const totalStages = Math.max(1, d.pipeline.reduce((s, p) => s + p.count, 0));
  let acc = 0;
  const arcs = d.pipeline.filter((p) => p.count > 0).map((p) => { const a0 = (acc / totalStages) * 360; acc += p.count; return { ...p, a0, a1: (acc / totalStages) * 360 }; });
  // rounded: server and browser trig can differ in the last digits, which breaks hydration
  const polar = (r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [Math.round((C + r * Math.cos(a)) * 100) / 100, Math.round((C + r * Math.sin(a)) * 100) / 100] as const; };
  const arcPath = (r: number, a0: number, a1: number) => { const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const shade = ["#5ce8ff", "#3fb8d8", "#a8f4ff", "#ffb347", "#5dffb0", "#2b8fb0", "#ff5d6c", "#7fd9ff"];
  const orbitR = 205;
  const paused = hover ? { animationPlayState: "paused" } : {};
  return (
    <svg viewBox="0 0 600 600" className="h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${pending} images awaiting review`}>
      <defs>
        <radialGradient id="hcore" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#5ce8ff" stopOpacity=".35" /><stop offset=".55" stopColor="#0b4c66" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id="hsweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5ce8ff" stopOpacity="0" /><stop offset="1" stopColor="#5ce8ff" stopOpacity=".35" /></linearGradient>
        <filter id="hglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        {d.creators.map((c) => <clipPath key={c.code} id={`hc-${c.code}`}><circle r="30" /></clipPath>)}
      </defs>
      <circle cx={C} cy={C} r="290" fill="url(#hcore)" />
      <g className="hud-spin" style={{ ["--d" as string]: "160s" }}>
        <circle cx={C} cy={C} r="288" fill="none" stroke="rgba(92,232,255,.18)" />
        {ticks.map((i) => { const long = i % 10 === 0; const [x0, y0] = polar(288, i * 3), [x1, y1] = polar(long ? 272 : 281, i * 3); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={long ? "#5ce8ff" : "rgba(92,232,255,.4)"} strokeWidth={long ? 2 : 1} />; })}
      </g>
      <g className="hud-spin-r" style={{ ["--d" as string]: "70s" }}><circle cx={C} cy={C} r="262" fill="none" stroke="#5ce8ff" strokeOpacity=".55" strokeWidth="3" strokeDasharray="60 22 8 22" /></g>
      <g filter="url(#hglow)">
        <circle cx={C} cy={C} r="244" fill="none" stroke="rgba(92,232,255,.12)" strokeWidth="10" />
        {arcs.map((a, i) => <path key={a.key} d={arcPath(244, a.a0 + 0.8, Math.max(a.a0 + 1.6, a.a1 - 0.8))} fill="none" stroke={shade[i % shade.length]} strokeWidth="10"><title>{`${a.label}: ${a.count}`}</title></path>)}
      </g>
      <g className="hud-spin" style={{ ["--d" as string]: "7s" }}><path d={`M${C} ${C} L${C} ${C - 230} A230 230 0 0 1 ${polar(230, 50)[0]} ${polar(230, 50)[1]} Z`} fill="url(#hsweep)" opacity=".5" /></g>
      <circle cx={C} cy={C} r={orbitR} fill="none" stroke="rgba(92,232,255,.25)" strokeDasharray="2 6" />
      <g className="hud-orbit" style={{ ["--d" as string]: "140s", transformOrigin: "300px 300px", transformBox: "view-box", ...paused } as React.CSSProperties}>
        {d.creators.map((c, i) => {
          const [x, y] = polar(orbitR, (i / d.creators.length) * 360);
          const on = hover === c.code;
          return (
            <g key={c.code} transform={`translate(${x} ${y})`}>
              <g className="hud-counter" style={{ ["--d" as string]: "140s", transformBox: "fill-box", transformOrigin: "center", ...paused } as React.CSSProperties}>
                <g role="button" tabIndex={0} aria-label={`Focus ${c.name}`} className="cursor-pointer outline-none" onClick={() => onPick(c.code)} onKeyDown={(e) => { if (e.key === "Enter") onPick(c.code); }} onMouseEnter={() => { setHover(c.code); sfx("hover"); }} onMouseLeave={() => setHover(null)}
                  style={{ transform: on ? "scale(1.22)" : "scale(1)", transition: "transform .2s cubic-bezier(.2,.7,.2,1)" }}>
                  {on && <circle r="56" fill="none" stroke={c.color} strokeWidth="1.5" strokeDasharray="10 6" className="hud-spin" style={{ ["--d" as string]: "4s" }} />}
                  <circle r="38" fill="rgba(2,12,20,.85)" stroke={c.color} strokeOpacity=".9" strokeWidth={on ? 3 : 2} />
                  <circle r="44" fill="none" stroke={c.color} strokeOpacity=".35" strokeDasharray="4 5" />
                  {c.portrait ? <image href={c.portrait} x="-30" y="-30" width="60" height="60" preserveAspectRatio="xMidYMin slice" clipPath={`url(#hc-${c.code})`} /> : <text textAnchor="middle" dy="6" fill={c.color} fontSize="20">{c.first[0]}</text>}
                  <text y="60" textAnchor="middle" fill={on ? c.color : "#d8f7ff"} fontSize="12" fontWeight="700" letterSpacing="2">{c.first.toUpperCase()}</text>
                  {c.pending > 0 && <g transform="translate(28 -28)"><circle r="12" fill="#ffb347" /><text textAnchor="middle" dy="4" fontSize={c.pending > 99 ? 8.5 : 11} fontWeight="700" fill="#1a0f00">{c.pending}</text></g>}
                </g>
              </g>
            </g>
          );
        })}
      </g>
      <g className="hud-spin" style={{ ["--d" as string]: "22s" }}><circle cx={C} cy={C} r="134" fill="none" stroke="#5ce8ff" strokeWidth="6" strokeDasharray="140 70" opacity=".8" filter="url(#hglow)" /></g>
      <g className="hud-spin-r" style={{ ["--d" as string]: "36s" }}><circle cx={C} cy={C} r="118" fill="none" stroke="#a8f4ff" strokeWidth="1.5" strokeDasharray="3 7" /></g>
      <g role="button" tabIndex={0} aria-label="Start review" className="cursor-pointer outline-none" onClick={onCenter} onKeyDown={(e) => { if (e.key === "Enter") onCenter(); }} onMouseEnter={() => sfx("hover")}>
        <circle cx={C} cy={C} r="104" fill="rgba(2,14,24,.85)" stroke="rgba(92,232,255,.35)" className="transition-[stroke] hover:stroke-[#5ce8ff]" />
        <text x={C} y={C - 30} textAnchor="middle" fill="#6fb6c9" fontSize="12" letterSpacing="4">AWAITING REVIEW</text>
        <text x={C} y={C + 30} textAnchor="middle" fill={pending ? "#ffb347" : "#5ce8ff"} fontSize="72" fontWeight="700" filter="url(#hglow)">{pending}</text>
        <text x={C} y={C + 58} textAnchor="middle" fill="#6fb6c9" fontSize="11" letterSpacing="3">{pending ? "CLICK TO START REVIEW" : "QUEUE CLEAR"}</text>
      </g>
    </svg>
  );
}

/* ───────────── creator focus (replaces the core) ───────────── */
function Focus({ c, queue, onClose, onReview, now }: { c: HudCreator; queue: HudQueueItem[]; onClose: () => void; onReview: () => void; now: number }) {
  const mine = queue.filter((q) => q.talent === c.code);
  return (
    <div className="anim-pop absolute inset-0 grid gap-4 overflow-auto p-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="relative min-h-[320px] overflow-hidden rounded-sm border" style={{ borderColor: c.color, boxShadow: `0 0 40px -10px ${c.color}` }}>
        {c.portrait && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.portrait} alt={c.name} className="absolute inset-0 h-full w-full object-cover object-top" />}
        <span className="hud-scan" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 50%, rgba(2,9,18,.95))" }} />
        {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "left-2 bottom-2 border-l-2 border-b-2", "right-2 bottom-2 border-r-2 border-b-2"].map((k) => <span key={k} className={`absolute h-6 w-6 ${k}`} style={{ borderColor: c.color }} />)}
        <div className="absolute inset-x-4 bottom-4">
          <div className="hud-label" style={{ color: c.color }}>Identity locked · {c.code}</div>
          <div className="text-[34px] font-bold leading-none tracking-[.12em]">{c.first.toUpperCase()}</div>
          <div className="mt-1 text-[12px] tracking-[.14em] text-[#9fd3e2]">{c.name.toUpperCase()} · {c.city.toUpperCase()}</div>
        </div>
      </div>
      <div className="grid content-start gap-3">
        <div className="flex items-center justify-between gap-2"><span className="hud-title !border-0 !p-0"><span className={DOT} />Creator dossier</span><button type="button" className="hud-btn" onClick={onClose}>Back to core</button></div>
        <div className="grid grid-cols-3 gap-2">
          {[["Priority", c.priority], ["In review", c.pending], ["Ready", c.ready], ["Images", c.images], ["Canon refs", c.refs], ["Last post", c.lastPost ? ago(c.lastPost, now) : "Never"]].map(([k, v]) => (
            <div key={String(k)} className="border border-[var(--h-line)] px-2.5 py-2"><div className="hud-label">{k}</div><div className={`hud-num mt-0.5 text-[20px] leading-tight ${k === "In review" && Number(v) > 0 ? "hud-amber" : "hud-glow"}`}>{v}</div></div>
          ))}
        </div>
        <div className="h-[3px] bg-[rgba(92,232,255,.12)]"><div className="h-full" style={{ width: `${Math.min(100, c.priority)}%`, background: c.color, boxShadow: `0 0 10px ${c.color}` }} /></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!mine.length} onClick={onReview} className="hud-btn !border-[var(--h-amber)] !text-[var(--h-amber)] disabled:opacity-40">Review her queue ({mine.length})</button>
          <Link href={`/talent/${c.code}`} className="hud-btn">Open profile</Link>
          <Link href={`/create?creator=${c.code}`} className="hud-btn">Import images</Link>
        </div>
        <div className="hud-label mt-1">Waiting for review</div>
        {mine.length === 0 ? <div className="text-[12px] tracking-[.14em] text-[#6fb6c9]">NOTHING WAITING</div> : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">{mine.slice(0, 15).map((q) => (
            <div key={q.id} className="relative aspect-[4/5] overflow-hidden rounded-sm border border-[var(--h-line)]">{q.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.thumb} alt={q.code} loading="lazy" className="h-full w-full object-cover" />}</div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

/* ───────────── review inspector (full screen) ───────────── */
function Inspector({ items, index, setIndex, onClose, onDecide, busy, flash }: { items: HudQueueItem[]; index: number; setIndex: (n: number) => void; onClose: () => void; onDecide: (q: HudQueueItem, d: "APPROVED" | "REJECTED") => void; busy: boolean; flash: null | "APPROVED" | "REJECTED" | "ERROR" }) {
  const q = items[index];
  if (!q) return (
    <div className="anim-fade fixed inset-0 z-[75] grid place-items-center bg-[#020912]/90 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel px-10 py-8 text-center"><div className="hud-glow text-[22px] font-bold tracking-[.3em]">QUEUE CLEAR</div><div className="hud-label mt-2">Nothing left to review here · Esc to close</div></div>
    </div>
  );
  const blocked = q.blockers.length > 0;
  return (
    <div className="anim-fade fixed inset-0 z-[75] bg-[#020912]/92 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="anim-pop mx-auto grid h-full max-w-[1400px] gap-3 lg:grid-cols-[minmax(0,1fr)_380px]" onClick={(e) => e.stopPropagation()}>
        <div className="hud-panel relative grid min-h-[50vh] place-items-center overflow-hidden">
          {q.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img key={q.id} src={q.thumb} alt={q.code} className="anim-fade absolute inset-0 h-full w-full object-contain p-3" />}
          <span className="hud-scan" />
          {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "left-3 bottom-3 border-l-2 border-b-2", "right-3 bottom-3 border-r-2 border-b-2"].map((k) => <span key={k} className={`absolute h-8 w-8 ${k}`} style={{ borderColor: q.color }} />)}
          {flash && <div key={q.id + flash} className="anim-fade pointer-events-none absolute inset-0 grid place-items-center" style={{ background: flash === "APPROVED" ? "rgba(93,255,176,.12)" : flash === "REJECTED" ? "rgba(255,93,108,.12)" : "rgba(255,179,71,.12)" }}>
            <span className="border-2 px-6 py-2 text-[34px] font-bold tracking-[.4em]" style={{ color: flash === "APPROVED" ? "var(--h-green)" : flash === "REJECTED" ? "var(--h-red)" : "var(--h-amber)", borderColor: "currentColor", textShadow: "0 0 20px currentColor" }}>{flash === "APPROVED" ? "APPROVED" : flash === "REJECTED" ? "DENIED" : "BLOCKED"}</span>
          </div>}
          <div className="absolute left-4 top-4 bg-black/60 px-2 py-1 text-[11px] tracking-[.16em]" style={{ color: q.color }}>{q.talent} · {q.code}</div>
          <div className="absolute right-4 top-4 bg-black/60 px-2 py-1 text-[11px] tracking-[.16em] text-[#9fd3e2]">{index + 1} / {items.length}</div>
        </div>
        <div className="hud-panel flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between"><span className="hud-title !border-0 !p-0"><span className={DOT} />Review inspector</span><button type="button" className="hud-btn" onClick={onClose}>Close · Esc</button></div>
          <div>
            <div className="hud-label">Subject</div>
            <div className="mt-1 text-[22px] font-bold tracking-[.12em]" style={{ color: q.color }}>{q.talent}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-[#9fd3e2]">{q.concept}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-[var(--h-line)] px-2.5 py-2"><div className="hud-label">QA scan</div><div className="hud-num mt-0.5 text-[16px]" style={{ color: q.qa === "PASS" ? "var(--h-green)" : q.qa === "FAIL" ? "var(--h-red)" : "var(--h-amber)" }}>{q.qa}</div></div>
            <div className="border border-[var(--h-line)] px-2.5 py-2"><div className="hud-label">In queue</div><div className="hud-num hud-glow mt-0.5 text-[16px]">{q.age < 1 ? "NEW" : `${q.age}H`}</div></div>
          </div>
          {blocked && <div className="border border-[var(--h-amber)]/50 bg-[rgba(255,179,71,.08)] p-2.5 text-[11.5px] leading-relaxed tracking-[.06em] text-[var(--h-amber)]">APPROVAL LOCKED · {q.blockers.join("; ")}. <Link href="/launch" className="underline">Fix on Launch</Link></div>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || blocked} onClick={() => onDecide(q, "APPROVED")} className="hud-btn !py-4 !text-[14px] !text-[var(--h-green)] !border-[var(--h-green)]/60 hover:!bg-[rgba(93,255,176,.12)] disabled:opacity-30">Approve · A</button>
            <button type="button" disabled={busy} onClick={() => onDecide(q, "REJECTED")} className="hud-btn !py-4 !text-[14px] !text-[var(--h-red)] !border-[var(--h-red)]/60 hover:!bg-[rgba(255,93,108,.12)] disabled:opacity-30">Deny · D</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="hud-btn" onClick={() => setIndex(Math.max(0, index - 1))}>← Previous</button>
            <button type="button" className="hud-btn" onClick={() => setIndex(Math.min(items.length - 1, index + 1))}>Skip →</button>
          </div>
          <Link href={`/approvals?id=${q.id}`} className="hud-btn text-center">Open full details</Link>
          <p className="mt-auto text-[10.5px] leading-relaxed tracking-[.08em] text-[#6fb6c9]">Approving never posts anything. Same checks as the Approvals page. Denied images stay on record.</p>
          <div className="flex gap-1 overflow-x-auto">{items.slice(Math.max(0, index - 3), index + 9).map((x) => { const n = items.indexOf(x); return (
            <button key={x.id} type="button" onClick={() => setIndex(n)} className={`h-14 w-11 flex-none overflow-hidden rounded-sm border ${n === index ? "border-[var(--h-cyan)] shadow-[0_0_10px_var(--h-cyan)]" : "border-[var(--h-line)] opacity-60 hover:opacity-100"}`}>{x.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}</button>
          ); })}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── main ───────────── */
export function Hud({ data: d }: { data: HudData }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [opened] = useState(() => Date.now());
  const [boot, setBoot] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [queue, setQueue] = useState(d.queue);
  const [decided, setDecided] = useState(0);
  const [review, setReview] = useState<{ items: HudQueueItem[]; index: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<null | "APPROVED" | "REJECTED" | "ERROR">(null);
  const [extraLog, setExtraLog] = useState<Line[]>([]);
  const [cmd, setCmd] = useState("");
  const [reply, setReply] = useState<string[]>(["NORTHLINE COMMAND ONLINE. TYPE 'HELP' OR PRESS THE MIC."]);
  const [listening, setListening] = useState(false);
  const [muted, setMutedState] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // fresh server data replaces local state unless a review is in progress
  useEffect(() => { if (!review) { setQueue(d.queue); setDecided(0); setExtraLog([]); } }, [d.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = Math.max(0, d.pending - decided);
  const creatorPending = useCallback((code: string) => queue.filter((q) => q.talent === code).length + (d.creators.find((c) => c.code === code)!.pending - d.queue.filter((q) => q.talent === code).length), [queue, d]);
  const creators = d.creators.map((c) => ({ ...c, pending: Math.max(0, creatorPending(c.code)) }));
  const focused = creators.find((c) => c.code === focus) ?? null;

  const say = useCallback((lines: string | string[]) => setReply((r) => [...r, ...(Array.isArray(lines) ? lines : [lines])].slice(-6)), []);
  const addLog = (kind: string, message: string, level = "info") => setExtraLog((l) => [{ at: new Date().toISOString(), level, kind, message }, ...l].slice(0, 30));

  const briefing = useCallback(() => {
    const t = ny(new Date()); const h = t.getHours();
    const greet = h < 5 ? "Working late, I see." : h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
    const top = [...creators].sort((a, b) => b.pending - a.pending)[0];
    const next = [...creators].sort((a, b) => b.priority - a.priority)[0];
    const s = d.schedule[0];
    return `${greet} ${pending ? `${pending} images are waiting for your review${top?.pending ? `, ${top.pending} of them for ${top.first}` : ""}.` : "Your review queue is clear."} ${d.system.queue.failed ? `${d.system.queue.failed} jobs have failed.` : "No failed jobs."} Instagram is ${d.system.instagram.toLowerCase()}. ${s ? `Next post: ${s.talent} at ${s.time}.` : "Nothing is scheduled to post."} ${next ? `${next.first} is your top priority.` : ""}`;
  }, [creators, d, pending]);

  const openReview = useCallback((code?: string | null) => {
    const items = code ? queue.filter((q) => q.talent === code) : queue;
    if (!items.length) { sfx("error"); say(code ? `NOTHING WAITING FOR ${code}.` : "QUEUE CLEAR."); return; }
    sfx("open"); setReview({ items, index: 0 });
  }, [queue, say]);

  const decideOne = async (q: HudQueueItem, decision: "APPROVED" | "REJECTED") => {
    if (busy) return;
    if (decision === "APPROVED" && q.blockers.length) { sfx("error"); setFlash("ERROR"); setTimeout(() => setFlash(null), 700); return; }
    setBusy(true);
    const r = await hudDecideAction(q.id, decision).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (!r.ok) { sfx("error"); setFlash("ERROR"); addLog("error", `${q.code}: ${r.error ?? "failed"}`, "error"); setTimeout(() => setFlash(null), 900); return; }
    sfx(decision === "APPROVED" ? "approve" : "deny"); setFlash(decision);
    addLog(decision === "APPROVED" ? "approved" : "denied", `${q.code} · ${q.talent}`, decision === "APPROVED" ? "info" : "warn");
    setDecided((n) => n + 1);
    setTimeout(() => {
      setFlash(null);
      setQueue((qs) => qs.filter((x) => x.id !== q.id));
      setReview((rv) => { if (!rv) return rv; const items = rv.items.filter((x) => x.id !== q.id); return { items, index: Math.min(rv.index, Math.max(0, items.length - 1)) }; });
    }, 420);
  };
  const closeReview = () => { sfx("close"); setReview(null); router.refresh(); };

  const pickCreator = (code: string) => { sfx("open"); setFocus(code); };

  // command console
  const run = (raw: string) => {
    const t = raw.trim().toLowerCase(); if (!t) return;
    sfx("click"); say(`> ${raw.toUpperCase()}`);
    const who = creators.find((c) => t.includes(c.first.toLowerCase()) || t.split(/\s+/).includes(c.code.toLowerCase()));
    const go = (href: string, label: string) => { say(`OPENING ${label}…`); router.push(href); };
    if (/^(help|\?|commands)/.test(t)) say(["BRIEF · REVIEW [NAME] · FOCUS [NAME] · APPROVALS · STUDIO · TALENT", "CALENDAR · LIVE · INBOX · COLLABS · MUTE · UNMUTE · FULL SCREEN · CLEAR · EXIT"]);
    else if (/clear/.test(t)) setReply([]);
    else if (/(brief|status|report|sitrep|what.*(up|going on)|update me)/.test(t)) { const b = briefing(); say(b.toUpperCase()); speak(b); }
    else if (/(review|approve|queue|check)/.test(t)) { openReview(who?.code); say(who ? `REVIEW QUEUE · ${who.first.toUpperCase()}` : "REVIEW QUEUE · ALL CREATORS"); }
    else if (/^(unmute|sound on|voice on)/.test(t)) { setMuted(false); setMutedState(false); say("AUDIO ONLINE."); }
    else if (/^(mute|silence|quiet|sound off|voice off)/.test(t)) { setMuted(true); setMutedState(true); say("AUDIO MUTED."); }
    else if (/full ?screen/.test(t)) { toggleFs(); say("FULL SCREEN TOGGLED."); }
    else if (/(approvals)/.test(t)) go("/approvals", "APPROVALS");
    else if (/(studio|import|generate|create)/.test(t)) go(who ? `/create?creator=${who.code}` : "/create", "STUDIO");
    else if (/(calendar|schedule)/.test(t)) go("/calendar", "CALENDAR");
    else if (/(live|ops)/.test(t)) go("/live", "LIVE BOARD");
    else if (/inbox/.test(t)) go("/inbox", "INBOX");
    else if (/collab/.test(t)) go("/collabs", "COLLABS");
    else if (/(analytics|stats|numbers)/.test(t)) go("/analytics", "ANALYTICS");
    else if (/(profile|talent)/.test(t) && who) go(`/talent/${who.code}`, `${who.first.toUpperCase()}'S PROFILE`);
    else if (/talent|roster/.test(t)) go("/talent", "TALENT");
    else if (/(exit|close|back|home|dashboard)/.test(t)) { if (focus) { setFocus(null); say("BACK TO CORE."); } else go("/", "DASHBOARD"); }
    else if (who) { pickCreator(who.code); say(`FOCUS · ${who.name.toUpperCase()} · ${who.pending} IN REVIEW · PRIORITY ${who.priority}`); }
    else { sfx("error"); say("UNRECOGNIZED. TRY 'HELP'."); }
  };
  const runRef = useRef(run); runRef.current = run;

  const listen = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) { sfx("error"); say("VOICE INPUT NOT AVAILABLE IN THIS BROWSER. TYPE INSTEAD."); return; }
    const r = new SR(); r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const text = e.results[0][0].transcript; setCmd(text); runRef.current(text); setCmd(""); };
    r.onend = () => setListening(false); r.onerror = () => { setListening(false); say("DIDN'T CATCH THAT."); };
    setListening(true); sfx("open"); r.start();
  };

  const toggleFs = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); };

  useEffect(() => {
    setNow(Date.now()); setMutedState(isMuted());
    const t = setInterval(() => setNow(Date.now()), 1000);
    let seen = false; try { seen = sessionStorage.getItem("nl-hud-boot") === "1"; sessionStorage.setItem("nl-hud-boot", "1"); } catch { /* storage off */ }
    const b = setTimeout(() => setBoot(false), seen ? 0 : 2100);
    return () => { clearInterval(t); clearTimeout(b); };
  }, []);
  // auto-refresh, paused while reviewing
  useEffect(() => { if (review) return; const r = setInterval(() => router.refresh(), 20_000); return () => clearInterval(r); }, [review, router]);
  // first gesture unlocks audio and plays the power-up
  useEffect(() => {
    const once = () => { sfx("boot"); window.removeEventListener("pointerdown", once); window.removeEventListener("keydown", once); };
    window.addEventListener("pointerdown", once); window.addEventListener("keydown", once);
    return () => { window.removeEventListener("pointerdown", once); window.removeEventListener("keydown", once); };
  }, []);
  // keyboard
  const reviewRef = useRef(review); reviewRef.current = review;
  const decideRef = useRef(decideOne); decideRef.current = decideOne;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea");
      const rv = reviewRef.current;
      if (rv) {
        const q = rv.items[rv.index];
        if (e.key === "Escape") { e.preventDefault(); closeReview(); }
        else if (typing) return;
        else if (e.key.toLowerCase() === "a" && q) decideRef.current(q, "APPROVED");
        else if (e.key.toLowerCase() === "d" && q) decideRef.current(q, "REJECTED");
        else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); sfx("click"); setReview({ ...rv, index: Math.min(rv.items.length - 1, rv.index + 1) }); }
        else if (e.key === "ArrowLeft") { sfx("click"); setReview({ ...rv, index: Math.max(0, rv.index - 1) }); }
        return;
      }
      if (e.key === "Escape") { if (typing) { (e.target as HTMLElement).blur(); return; } if (focus) { sfx("close"); setFocus(null); } else router.push("/"); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "f") toggleFs();
      else if (e.key.toLowerCase() === "r") openReview(focus);
      else if (e.key.toLowerCase() === "b") { const b = briefing(); say(b.toUpperCase()); speak(b); }
      else if (e.key === "/" || e.key === ":") { e.preventDefault(); input.current?.focus(); }
      else if (e.key.toLowerCase() === "m") { const m = !isMuted(); setMuted(m); setMutedState(m); }
      else if (/^[1-6]$/.test(e.key)) { const c = creators[Number(e.key) - 1]; if (c) pickCreator(c.code); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }); // re-bound each render so handlers see current state

  // parallax tilt on the core
  const onMove = (e: React.MouseEvent) => {
    const el = stage.current; if (!el) return;
    const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(x * 10).toFixed(2)}deg`); el.style.setProperty("--ry", `${(-y * 10).toFixed(2)}deg`);
  };
  const onLeave = () => { stage.current?.style.setProperty("--rx", "0deg"); stage.current?.style.setProperty("--ry", "0deg"); };

  const t = now ? ny(new Date(now)) : null;
  const clock = t ? `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` : "--:--:--";
  const date = t ? t.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase() : "";
  const up = now ? Math.floor((now - opened) / 1000) : 0;
  const synced = now ? Math.max(0, Math.round((now - new Date(d.generatedAt).getTime()) / 1000)) : 0;
  const maxAct = Math.max(1, ...d.activity);
  const ticker = d.attention.length ? d.attention.map((a) => a.text).join("   ///   ") : "All systems nominal. Nothing needs you right now.";
  const log = [...extraLog, ...d.log].slice(0, 40);

  return (
    <div className="hud">
      {boot && (
        <div className="hud-boot fixed inset-0 z-[80] grid place-items-center bg-[#020912]" onClick={() => setBoot(false)}>
          <div className="w-[min(520px,90vw)] text-[12px] tracking-[.18em] text-[var(--h-cyan2)]">
            {["NORTHLINE COMMAND // BOOT", `LINKING DATA STORE ........ ${d.system.store.toUpperCase()}`, `ROSTER ..................... ${d.creators.length} CREATORS`, `IMAGES ON FILE ............. ${d.totals.images}`, `REVIEW QUEUE ............... ${d.pending}`, "ALL MONITORS ONLINE"].map((l, i) => (
              <div key={l} className="hud-bootline py-0.5" style={{ animationDelay: `${0.12 + i * 0.22}s` }}>{i === 5 ? <span className="hud-glow">{l}</span> : l}</div>
            ))}
            <div className="mt-3 h-[3px] overflow-hidden bg-[rgba(92,232,255,.15)]"><div className="h-full bg-[var(--h-cyan)] shadow-[0_0_12px_var(--h-cyan)]" style={{ animation: "hud-load 1.5s cubic-bezier(.4,0,.2,1) both", transformOrigin: "left" }} /></div>
          </div>
        </div>
      )}
      {review && <Inspector items={review.items} index={review.index} setIndex={(n) => { sfx("click"); setReview({ ...review, index: n }); }} onClose={closeReview} onDecide={decideOne} busy={busy} flash={flash} />}

      <div className="relative z-10 grid min-h-screen gap-3 p-3 lg:h-screen lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,200px)_auto]">
        {/* top bar */}
        <header className="hud-panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <svg width="30" height="30" viewBox="0 0 24 24" className="hud-glow"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1" opacity=".6" /><path d="M7.5 17V7l9 10V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="leading-tight"><div className="hud-glow text-[17px] font-bold tracking-[.32em]">NORTHLINE</div><div className="hud-label">Command // studio operations</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[.14em]">
            {[["SYS", d.system.mode, d.system.mode === "Online"], ["STORE", d.system.store, true], ["IG", d.system.instagram, false], ["AUTO-GEN", d.system.autonomous === "ENABLED" ? "On" : "Off", d.system.autonomous !== "ENABLED"]].map(([k, v, good]) => (
              <span key={String(k)} className="flex items-center gap-1.5 border border-[var(--h-line)] px-2 py-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: good ? "var(--h-green)" : "var(--h-red)", boxShadow: `0 0 8px ${good ? "var(--h-green)" : "var(--h-red)"}` }} /><span className="text-[#6fb6c9]">{k}</span><b className="text-[#d8f7ff]">{String(v).toUpperCase()}</b></span>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="mr-2 text-right"><div className="hud-glow hud-num text-[26px] leading-none">{clock}</div><div className="hud-label mt-1">{date} · NEW YORK</div></div>
            <button type="button" className="hud-btn" onClick={() => { const b = briefing(); say(b.toUpperCase()); speak(b); }} onMouseEnter={() => sfx("hover")} title="Spoken briefing (B)">Brief me</button>
            <button type="button" className="hud-btn !border-[var(--h-amber)]/60 !text-[var(--h-amber)]" onClick={() => openReview(focus)} onMouseEnter={() => sfx("hover")} title="Review queue (R)">Review {pending}</button>
            <button type="button" className="hud-btn" onClick={() => { const m = !muted; setMuted(m); setMutedState(m); }} title="Sound (M)">{muted ? "Sound off" : "Sound on"}</button>
            <button type="button" className="hud-btn" onClick={toggleFs} title="Full screen (F)">Full screen</button>
            <Link href="/" className="hud-btn" title="Back to the studio (Esc)">Exit</Link>
          </div>
        </header>

        {/* main row */}
        <div className="grid min-h-0 gap-3 lg:grid-cols-[330px_minmax(0,1fr)_350px]">
          <Panel title="Roster monitors" tag={`MON-01 · KEYS 1–6`} className="lg:order-1">
            <ul className="grid gap-px overflow-auto p-2 lg:absolute lg:inset-0">
              {creators.map((c, i) => (
                <li key={c.code}>
                  <button type="button" onClick={() => pickCreator(c.code)} onMouseEnter={() => { setHover(c.code); sfx("hover"); }} onMouseLeave={() => setHover(null)}
                    className={`hud-link flex w-full items-center gap-3 rounded px-2 py-1.5 text-left ${focus === c.code || hover === c.code ? "bg-[rgba(92,232,255,.08)] shadow-[inset_0_0_0_1px_rgba(92,232,255,.35)]" : ""}`}>
                    <span className="relative h-14 w-14 flex-none overflow-hidden rounded-sm border" style={{ borderColor: c.color, boxShadow: `0 0 14px -4px ${c.color}` }}>
                      {c.portrait && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.portrait} alt="" className="h-full w-full object-cover object-top saturate-[.85]" />}
                      <span className="hud-scan" style={{ animationDelay: `${i * 0.5}s` }} />
                      <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[9px] text-[#9fd3e2]">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><b className="truncate text-[14px] tracking-[.12em]">{c.first.toUpperCase()}</b><span className={`h-1.5 w-1.5 rounded-full ${c.active ? "" : "hud-blink"}`} style={{ background: c.active ? "var(--h-green)" : "var(--h-amber)" }} /><span className="hud-label truncate">{c.city}</span></span>
                      <span className="mt-1 grid grid-cols-4 gap-1 text-[10px] tracking-[.1em] text-[#6fb6c9]">
                        <span>PRI <b className="hud-num text-[#d8f7ff]">{c.priority}</b></span><span>REV <b className={`hud-num ${c.pending ? "hud-amber" : "text-[#d8f7ff]"}`}>{c.pending}</b></span><span>RDY <b className="hud-num text-[#d8f7ff]">{c.ready}</b></span><span>IMG <b className="hud-num text-[#d8f7ff]">{c.images}</b></span>
                      </span>
                      <span className="mt-1 block h-[3px] bg-[rgba(92,232,255,.12)]"><span className="block h-full" style={{ width: `${Math.min(100, c.priority)}%`, background: c.color, boxShadow: `0 0 8px ${c.color}` }} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <section className="hud-panel relative order-first flex min-h-[460px] flex-col lg:order-2 lg:min-h-0">
            <div className="hud-title"><span className={DOT} />{focused ? `Focus · ${focused.first}` : "Studio core"}<span className="tag">{focused ? "ESC TO RETURN" : `CLICK A CREATOR · ${d.totals.productions} PRODUCTIONS`}</span></div>
            <div ref={stage} className="relative min-h-0 flex-1 p-2" onMouseMove={onMove} onMouseLeave={onLeave} style={{ perspective: "1200px" }}>
              {focused ? <Focus c={focused} queue={queue} onClose={() => { sfx("close"); setFocus(null); }} onReview={() => openReview(focused.code)} now={now ?? Date.now()} />
                : <div className="absolute inset-2 transition-transform duration-200 ease-out" style={{ transform: "rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg))", transformStyle: "preserve-3d" }}>
                    <Core d={{ ...d, creators }} pending={pending} hover={hover} setHover={setHover} onPick={pickCreator} onCenter={() => openReview(null)} />
                  </div>}
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-[var(--h-line)] px-3 py-2 text-[10.5px] tracking-[.12em] text-[#6fb6c9]">
              {d.pipeline.map((p) => <span key={p.key}>{p.label.toUpperCase()} <b className={`hud-num ${p.count ? "text-[#d8f7ff]" : ""}`}>{p.count}</b></span>)}
            </div>
          </section>

          <div className="grid min-h-0 content-start gap-3 lg:order-3 lg:content-stretch lg:grid-rows-[auto_auto_minmax(0,1fr)]">
            <Panel title="System status" tag="MON-03">
              <div className="grid grid-cols-2 gap-2 p-3">
                {[["Images today", d.system.imagesToday], ["In queue", d.system.queue.queued + d.system.queue.running], ["Failed jobs", d.system.queue.failed], ["Approved", d.totals.approved]].map(([k, v]) => (
                  <div key={String(k)} className="border border-[var(--h-line)] px-2.5 py-1.5"><div className="hud-label">{k}</div><div className={`hud-num text-[22px] leading-tight ${k === "Failed jobs" && Number(v) > 0 ? "text-[var(--h-red)]" : "hud-glow"}`}>{v}</div></div>
                ))}
              </div>
              <ul className="grid gap-1 px-3 pb-3 text-[11px] tracking-[.1em]">
                {d.system.providers.slice(0, 4).map((p) => <li key={p.label} className="flex items-center justify-between gap-2"><span className="truncate text-[#9fd3e2]">{p.label.toUpperCase()}</span><span className="flex items-center gap-1.5" style={{ color: okState(p.state) ? "var(--h-green)" : p.state === "unavailable" ? "#6fb6c9" : "var(--h-amber)" }}><span className="h-1.5 w-1.5 rounded-full bg-current" />{p.state.replace(/_/g, " ").toUpperCase()}</span></li>)}
                <li className="flex items-center justify-between gap-2"><span className="text-[#9fd3e2]">SYNC</span><span className="hud-num text-[#d8f7ff]">{review ? "PAUSED" : `${synced}s AGO`} · UPTIME {pad(Math.floor(up / 60))}:{pad(up % 60)}</span></li>
              </ul>
            </Panel>
            <Panel title="Activity · 24h" tag={`${d.activity.reduce((s, n) => s + n, 0)} EVENTS`}>
              <div className="flex h-[78px] items-end gap-[3px] px-3 pb-2 pt-3">
                {d.activity.map((n, i) => <span key={i} title={`${n} event(s)`} className="hud-bar flex-1 transition-[filter] hover:brightness-150" style={{ height: `${Math.max(4, (n / maxAct) * 100)}%`, background: n ? "linear-gradient(180deg,#a8f4ff,#1f7f9c)" : "rgba(92,232,255,.12)", boxShadow: n ? "0 0 10px rgba(92,232,255,.45)" : "none", animationDelay: `${i * 25}ms` }} />)}
              </div>
              <div className="flex justify-between px-3 pb-2 text-[9.5px] tracking-[.14em] text-[#6fb6c9]"><span>-24H</span><span>-12H</span><span>NOW</span></div>
            </Panel>
            <Panel title="Event log" tag="LIVE" className="min-h-[220px] lg:min-h-0">
              <ul className="h-full max-h-[340px] overflow-auto px-3 py-2 font-mono text-[10.5px] leading-[1.6] lg:absolute lg:inset-0 lg:max-h-none">
                {log.length === 0 && <li className="text-[#6fb6c9]">No events recorded yet.</li>}
                {log.map((l, i) => {
                  const lt = ny(new Date(l.at));
                  return <li key={l.at + i} className={`flex gap-2 whitespace-nowrap ${i < extraLog.length ? "anim-fade" : ""}`}><span className="text-[#3f8aa0]">{pad(lt.getHours())}:{pad(lt.getMinutes())}:{pad(lt.getSeconds())}</span><span style={{ color: l.level === "error" ? "var(--h-red)" : l.kind === "denied" || l.level === "warn" ? "var(--h-amber)" : l.kind === "approved" ? "var(--h-green)" : "var(--h-cyan)" }}>{l.kind.toUpperCase()}</span><span className="truncate text-[#9fd3e2]" title={l.message}>{l.message}</span></li>;
                })}
                <li className="hud-blink text-[var(--h-cyan)]">▌</li>
              </ul>
            </Panel>
          </div>
        </div>

        {/* bottom row */}
        <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_430px]">
          <Panel title="Feed monitors · review queue" tag={`MON-04 · ${pending} WAITING · CLICK TO INSPECT`}>
            {queue.length === 0 ? <div className="grid h-full min-h-[120px] place-items-center text-[12px] tracking-[.16em] text-[#6fb6c9]">QUEUE CLEAR</div> : (
              <div className="flex h-full min-h-[150px] gap-2 overflow-x-auto p-2.5">
                {queue.slice(0, 40).map((q, i) => (
                  <button key={q.id} type="button" onClick={() => { sfx("open"); setReview({ items: queue, index: i }); }} onMouseEnter={() => sfx("hover")} className="hud-link group relative block h-full w-[118px] flex-none overflow-hidden rounded-sm border" style={{ borderColor: `${q.color}99` }}>
                    {q.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.thumb} alt={q.code} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-110" />}
                    <span className="hud-scan" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
                    <span className="absolute left-1 top-1 bg-black/70 px-1 text-[9.5px] tracking-[.12em]" style={{ color: q.qa === "PASS" ? "var(--h-green)" : q.qa === "FAIL" ? "var(--h-red)" : "var(--h-amber)" }}>QA {q.qa}</span>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] tracking-[.1em]"><b style={{ color: q.color }}>{q.talent}</b> <span className="text-[#9fd3e2]">{q.age < 1 ? "NEW" : `${q.age}H`}</span></span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
          {/* command console */}
          <section className="hud-panel flex min-h-[200px] flex-col lg:min-h-0">
            <div className="hud-title"><span className={DOT} />Command console<span className="tag">/ TO TYPE · B BRIEF · R REVIEW</span></div>
            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 font-mono text-[11px] leading-[1.55] text-[#9fd3e2]">
              {reply.slice(-5).map((l, i) => <div key={i + l} className={`truncate ${l.startsWith(">") ? "text-[var(--h-cyan)]" : ""}`} title={l}>{l}</div>)}
            </div>
            <form className="flex items-center gap-2 border-t border-[var(--h-line)] px-3 py-2" onSubmit={(e) => { e.preventDefault(); run(cmd); setCmd(""); }}>
              <span className="hud-glow font-bold">&gt;</span>
              <input ref={input} value={cmd} onChange={(e) => { setCmd(e.target.value); sfx("type"); }} placeholder="review sienna · brief · focus zoe · help"
                className="!border-0 !bg-transparent !p-0 font-mono text-[12.5px] uppercase tracking-[.08em] !text-[#d8f7ff] !shadow-none placeholder:normal-case placeholder:!text-[#3f8aa0]" aria-label="Command" />
              <button type="button" onClick={listen} title="Speak a command (uses Chrome's speech service)" className={`hud-btn !px-2.5 ${listening ? "hud-blink !border-[var(--h-red)] !text-[var(--h-red)]" : ""}`}>{listening ? "Listening" : "Mic"}</button>
            </form>
          </section>
        </div>

        {/* ticker */}
        <div className="hud-panel flex items-center gap-3 overflow-hidden px-3 py-1.5 text-[11.5px] tracking-[.14em]">
          <span className="hud-amber flex-none font-bold">ALERTS</span>
          <div className="min-w-0 flex-1 overflow-hidden"><span className="hud-ticker" style={{ color: d.attention.length ? (d.attention[0].tone === "bad" ? "var(--h-red)" : "var(--h-amber)") : "var(--h-green)" }}>{ticker.toUpperCase()}</span></div>
          <span className="hidden flex-none text-[#3f8aa0] xl:inline">1–6 FOCUS · R REVIEW · B BRIEF · M SOUND · F FULL SCREEN · ESC BACK</span>
        </div>
      </div>
    </div>
  );
}

interface SpeechRec { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend: () => void; onerror: () => void }
