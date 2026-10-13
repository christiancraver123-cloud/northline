"use client";
// Command HUD — full-screen mission control. Real data only (passed in from /hud); animation is decoration.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export interface HudCreator { code: string; name: string; first: string; color: string; portrait: string | null; active: boolean; priority: number; ready: number; pending: number; images: number; refs: number; lastPost: string | null; city: string }
export interface HudData {
  generatedAt: string;
  creators: HudCreator[];
  queue: { id: string; code: string; talent: string; color: string; thumb: string | null; qa: string; age: number }[];
  pending: number;
  pipeline: { key: string; label: string; count: number }[];
  system: { mode: string; store: string; instagram: string; governor: string; autonomous: string; imagesToday: number; queue: { queued: number; running: number; failed: number; blocked: number }; providers: { label: string; state: string }[] };
  totals: { images: number; refs: number; productions: number; approved: number };
  activity: number[];
  log: { at: string; level: string; kind: string; message: string }[];
  schedule: { date: string; time: string; talent: string; color: string; code: string; productionId: string }[];
  attention: { text: string; tone: string; href: string }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ny = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
const ago = (iso: string | null, now: number) => { if (!iso) return "never"; const s = Math.max(0, (now - new Date(iso).getTime()) / 1000); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const okState = (s: string) => s === "configured" || s === "ok";

function Panel({ title, tag, children, className = "", href }: { title: string; tag?: string; children: React.ReactNode; className?: string; href?: string }) {
  const head = <div className="hud-title"><span className="h-1.5 w-1.5 rounded-full bg-[var(--h-cyan)] shadow-[0_0_8px_var(--h-cyan)]" />{title}{tag && <span className="tag">{tag}</span>}</div>;
  return (
    <section className={`hud-panel flex min-h-0 flex-col ${className}`}>
      {href ? <Link href={href} className="hud-link block">{head}</Link> : head}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Core({ d }: { d: HudData }) {
  const C = 300;
  const ticks = useMemo(() => Array.from({ length: 120 }, (_, i) => i), []);
  const totalStages = Math.max(1, d.pipeline.reduce((s, p) => s + p.count, 0));
  let acc = 0;
  const arcs = d.pipeline.filter((p) => p.count > 0).map((p) => { const a0 = (acc / totalStages) * 360; acc += p.count; const a1 = (acc / totalStages) * 360; return { ...p, a0, a1 }; });
  const polar = (r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [Math.round((C + r * Math.cos(a)) * 100) / 100, Math.round((C + r * Math.sin(a)) * 100) / 100] as const; }; // rounded: server and browser trig can differ in the last digits
  const arcPath = (r: number, a0: number, a1: number) => { const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const shade = ["#5ce8ff", "#3fb8d8", "#a8f4ff", "#ffb347", "#5dffb0", "#2b8fb0", "#ff5d6c", "#7fd9ff"];
  const orbitR = 205;
  return (
    <svg viewBox="0 0 600 600" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${d.pending} images awaiting review`}>
      <defs>
        <radialGradient id="hcore" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#5ce8ff" stopOpacity=".35" /><stop offset=".55" stopColor="#0b4c66" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id="hsweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5ce8ff" stopOpacity="0" /><stop offset="1" stopColor="#5ce8ff" stopOpacity=".35" /></linearGradient>
        <filter id="hglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        {d.creators.map((c) => <clipPath key={c.code} id={`hc-${c.code}`}><circle r="30" /></clipPath>)}
      </defs>
      <circle cx={C} cy={C} r="290" fill="url(#hcore)" />
      {/* outer tick ring */}
      <g className="hud-spin" style={{ ["--d" as string]: "160s" }}>
        <circle cx={C} cy={C} r="288" fill="none" stroke="rgba(92,232,255,.18)" />
        {ticks.map((i) => { const long = i % 10 === 0; const [x0, y0] = polar(288, i * 3), [x1, y1] = polar(long ? 272 : 281, i * 3); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={long ? "#5ce8ff" : "rgba(92,232,255,.4)"} strokeWidth={long ? 2 : 1} />; })}
      </g>
      {/* dashed segment ring */}
      <g className="hud-spin-r" style={{ ["--d" as string]: "70s" }}>
        <circle cx={C} cy={C} r="262" fill="none" stroke="#5ce8ff" strokeOpacity=".55" strokeWidth="3" strokeDasharray="60 22 8 22" />
      </g>
      {/* pipeline arcs (real stage proportions) */}
      <g filter="url(#hglow)">
        <circle cx={C} cy={C} r="244" fill="none" stroke="rgba(92,232,255,.12)" strokeWidth="10" />
        {arcs.map((a, i) => <path key={a.key} d={arcPath(244, a.a0 + 0.8, Math.max(a.a0 + 1.6, a.a1 - 0.8))} fill="none" stroke={shade[i % shade.length]} strokeWidth="10" strokeLinecap="butt"><title>{`${a.label}: ${a.count}`}</title></path>)}
      </g>
      {/* radar sweep */}
      <g className="hud-spin" style={{ ["--d" as string]: "7s" }}>
        <path d={`M${C} ${C} L${C} ${C - 230} A230 230 0 0 1 ${polar(230, 50)[0]} ${polar(230, 50)[1]} Z`} fill="url(#hsweep)" opacity=".5" />
      </g>
      {/* orbit with creator portraits */}
      <circle cx={C} cy={C} r={orbitR} fill="none" stroke="rgba(92,232,255,.25)" strokeDasharray="2 6" />
      <g className="hud-orbit" style={{ ["--d" as string]: "140s", transformOrigin: "300px 300px", transformBox: "view-box" } as React.CSSProperties}>
        {d.creators.map((c, i) => {
          const [x, y] = polar(orbitR, (i / d.creators.length) * 360);
          return (
            <g key={c.code} transform={`translate(${x} ${y})`}>
              <g className="hud-counter" style={{ ["--d" as string]: "140s", transformBox: "fill-box", transformOrigin: "center" } as React.CSSProperties}>
                <a href={`/talent/${c.code}`}>
                  <circle r="38" fill="rgba(2,12,20,.85)" stroke={c.color} strokeOpacity=".9" strokeWidth="2" />
                  <circle r="44" fill="none" stroke={c.color} strokeOpacity=".35" strokeDasharray="4 5" />
                  {c.portrait ? <image href={c.portrait} x="-30" y="-30" width="60" height="60" preserveAspectRatio="xMidYMin slice" clipPath={`url(#hc-${c.code})`} /> : <text textAnchor="middle" dy="6" fill={c.color} fontSize="20">{c.first[0]}</text>}
                  <text y="60" textAnchor="middle" fill="#d8f7ff" fontSize="12" fontWeight="700" letterSpacing="2">{c.first.toUpperCase()}</text>
                  {c.pending > 0 && <g transform="translate(28 -28)"><circle r="11" fill="#ffb347" /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#1a0f00">{c.pending}</text></g>}
                  <title>{`${c.name}: priority ${c.priority}, ${c.pending} in review, ${c.ready} ready`}</title>
                </a>
              </g>
            </g>
          );
        })}
      </g>
      {/* inner reactor */}
      <g className="hud-spin" style={{ ["--d" as string]: "22s" }}><circle cx={C} cy={C} r="134" fill="none" stroke="#5ce8ff" strokeWidth="6" strokeDasharray="140 70" opacity=".8" filter="url(#hglow)" /></g>
      <g className="hud-spin-r" style={{ ["--d" as string]: "36s" }}><circle cx={C} cy={C} r="118" fill="none" stroke="#a8f4ff" strokeWidth="1.5" strokeDasharray="3 7" /></g>
      <circle cx={C} cy={C} r="104" fill="rgba(2,14,24,.85)" stroke="rgba(92,232,255,.35)" />
      <a href="/approvals">
        <text x={C} y={C - 30} textAnchor="middle" fill="#6fb6c9" fontSize="12" letterSpacing="4">AWAITING REVIEW</text>
        <text x={C} y={C + 30} textAnchor="middle" fill={d.pending ? "#ffb347" : "#5ce8ff"} fontSize="72" fontWeight="700" filter="url(#hglow)">{d.pending}</text>
        <text x={C} y={C + 58} textAnchor="middle" fill="#6fb6c9" fontSize="11" letterSpacing="3">{`${d.totals.images} IMAGES ON FILE`}</text>
      </a>
    </svg>
  );
}

export function Hud({ data: d }: { data: HudData }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [opened] = useState(() => Date.now());
  const [boot, setBoot] = useState(true);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => router.refresh(), 20_000);
    let seen = false; try { seen = sessionStorage.getItem("nl-hud-boot") === "1"; sessionStorage.setItem("nl-hud-boot", "1"); } catch { /* storage off: just play it */ }
    const b = setTimeout(() => setBoot(false), seen ? 0 : 2100);
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "Escape") router.push("/");
      if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    };
    window.addEventListener("keydown", key);
    return () => { clearInterval(t); clearInterval(r); clearTimeout(b); window.removeEventListener("keydown", key); };
  }, [router]);

  const t = now ? ny(new Date(now)) : null;
  const clock = t ? `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` : "--:--:--";
  const date = t ? t.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase() : "";
  const up = now ? Math.floor((now - opened) / 1000) : 0;
  const synced = now ? Math.max(0, Math.round((now - new Date(d.generatedAt).getTime()) / 1000)) : 0;
  const maxAct = Math.max(1, ...d.activity);
  const ticker = d.attention.length ? d.attention.map((a) => a.text).join("   ///   ") : "All systems nominal. Nothing needs you right now.";
  const toneC = (tone: string) => tone === "bad" ? "var(--h-red)" : tone === "warn" ? "var(--h-amber)" : tone === "ok" ? "var(--h-green)" : "var(--h-cyan)";

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

      <div className="relative z-10 grid min-h-screen gap-3 p-3 lg:h-screen lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,210px)_auto]">
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
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right"><div className="hud-glow hud-num text-[26px] leading-none">{clock}</div><div className="hud-label mt-1">{date} · NEW YORK</div></div>
            <button type="button" className="hud-btn" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {})} title="Full screen (F)">Full screen</button>
            <Link href="/" className="hud-btn" title="Back to the studio (Esc)">Exit</Link>
          </div>
        </header>

        {/* main row */}
        <div className="grid min-h-0 gap-3 lg:grid-cols-[330px_minmax(0,1fr)_350px]">
          <Panel title="Roster monitors" tag={`MON-01 · ${d.creators.length} UNITS`} className="lg:order-1" href="/talent">
            <ul className="grid gap-px overflow-auto p-2 lg:h-full">
              {d.creators.map((c) => (
                <li key={c.code}>
                  <Link href={`/talent/${c.code}`} className="hud-link flex items-center gap-3 rounded px-2 py-1.5">
                    <span className="relative h-14 w-14 flex-none overflow-hidden rounded-sm border" style={{ borderColor: c.color, boxShadow: `0 0 14px -4px ${c.color}` }}>
                      {c.portrait && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.portrait} alt="" className="h-full w-full object-cover object-top saturate-[.85]" />}
                      <span className="hud-scan" style={{ animationDelay: `${c.priority % 7 * 0.4}s` }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><b className="truncate text-[14px] tracking-[.12em]">{c.first.toUpperCase()}</b><span className={`h-1.5 w-1.5 rounded-full ${c.active ? "" : "hud-blink"}`} style={{ background: c.active ? "var(--h-green)" : "var(--h-amber)" }} /><span className="hud-label truncate">{c.city}</span></span>
                      <span className="mt-1 grid grid-cols-4 gap-1 text-[10px] tracking-[.1em] text-[#6fb6c9]">
                        <span>PRI <b className="hud-num text-[#d8f7ff]">{c.priority}</b></span><span>REV <b className={`hud-num ${c.pending ? "hud-amber" : "text-[#d8f7ff]"}`}>{c.pending}</b></span><span>RDY <b className="hud-num text-[#d8f7ff]">{c.ready}</b></span><span>IMG <b className="hud-num text-[#d8f7ff]">{c.images}</b></span>
                      </span>
                      <span className="mt-1 block h-[3px] bg-[rgba(92,232,255,.12)]"><span className="block h-full" style={{ width: `${Math.min(100, c.priority)}%`, background: c.color, boxShadow: `0 0 8px ${c.color}` }} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <section className="hud-panel relative order-first flex min-h-[460px] flex-col lg:order-2 lg:min-h-0">
            <div className="hud-title"><span className="h-1.5 w-1.5 rounded-full bg-[var(--h-cyan)] shadow-[0_0_8px_var(--h-cyan)]" />Studio core<span className="tag">PIPELINE · {d.totals.productions} PRODUCTIONS</span></div>
            <div className="relative min-h-0 flex-1 p-2"><div className="absolute inset-2"><Core d={d} /></div></div>
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
                <li className="flex items-center justify-between gap-2"><span className="text-[#9fd3e2]">SYNC</span><span className="hud-num text-[#d8f7ff]">{synced}s AGO · UPTIME {pad(Math.floor(up / 60))}:{pad(up % 60)}</span></li>
              </ul>
            </Panel>
            <Panel title="Activity · 24h" tag={`${d.activity.reduce((s, n) => s + n, 0)} EVENTS`}>
              <div className="flex h-[86px] items-end gap-[3px] px-3 pb-2 pt-3">
                {d.activity.map((n, i) => <span key={i} title={`${n} event(s)`} className="hud-bar flex-1" style={{ height: `${Math.max(4, (n / maxAct) * 100)}%`, background: n ? "linear-gradient(180deg,#a8f4ff,#1f7f9c)" : "rgba(92,232,255,.12)", boxShadow: n ? "0 0 10px rgba(92,232,255,.45)" : "none", animationDelay: `${i * 25}ms` }} />)}
              </div>
              <div className="flex justify-between px-3 pb-2 text-[9.5px] tracking-[.14em] text-[#6fb6c9]"><span>-24H</span><span>-12H</span><span>NOW</span></div>
            </Panel>
            <Panel title="Event log" tag="LIVE" className="min-h-[220px] lg:min-h-0">
              <ul className="h-full max-h-[340px] overflow-auto px-3 py-2 font-mono lg:absolute lg:inset-0 lg:top-[33px] text-[10.5px] leading-[1.6] lg:max-h-none">
                {d.log.length === 0 && <li className="text-[#6fb6c9]">No events recorded yet.</li>}
                {d.log.map((l, i) => {
                  const lt = ny(new Date(l.at));
                  return <li key={i} className="flex gap-2 whitespace-nowrap"><span className="text-[#3f8aa0]">{pad(lt.getHours())}:{pad(lt.getMinutes())}:{pad(lt.getSeconds())}</span><span style={{ color: l.level === "error" ? "var(--h-red)" : l.level === "warn" ? "var(--h-amber)" : l.kind === "approved" ? "var(--h-green)" : "var(--h-cyan)" }}>{l.kind.toUpperCase()}</span><span className="truncate text-[#9fd3e2]" title={l.message}>{l.message}</span></li>;
                })}
                <li className="hud-blink text-[var(--h-cyan)]">▌</li>
              </ul>
            </Panel>
          </div>
        </div>

        {/* bottom row */}
        <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_350px]">
          <Panel title="Feed monitors · review queue" tag={`MON-04 · ${d.pending} WAITING`} href="/approvals?view=grid">
            {d.queue.length === 0 ? <div className="grid h-full min-h-[120px] place-items-center text-[12px] tracking-[.16em] text-[#6fb6c9]">QUEUE CLEAR</div> : (
              <div className="flex h-full gap-2 overflow-x-auto p-2.5">
                {d.queue.map((q) => (
                  <Link key={q.id} href={`/approvals?id=${q.id}`} className="hud-link relative block h-full min-h-[150px] w-[118px] flex-none overflow-hidden rounded-sm border" style={{ borderColor: `${q.color}99` }}>
                    {q.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.thumb} alt={q.code} className="h-full w-full object-cover" />}
                    <span className="hud-scan" style={{ animationDelay: `${(q.age % 5) * 0.6}s` }} />
                    <span className="absolute left-1 top-1 bg-black/70 px-1 text-[9.5px] tracking-[.12em]" style={{ color: q.qa === "PASS" ? "var(--h-green)" : q.qa === "FAIL" ? "var(--h-red)" : "var(--h-amber)" }}>QA {q.qa}</span>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4 text-[10px] tracking-[.1em]"><b style={{ color: q.color }}>{q.talent}</b> <span className="text-[#9fd3e2]">{q.age < 1 ? "NEW" : `${q.age}H`}</span></span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Schedule" tag="MON-05" href="/calendar">
            {d.schedule.length === 0 ? <div className="grid h-full min-h-[120px] place-items-center px-4 text-center text-[11.5px] tracking-[.14em] text-[#6fb6c9]">NO SLOTS PLANNED · APPROVE AN IMAGE TO SCHEDULE IT</div> : (
              <ul className="grid gap-1 p-2.5 text-[11.5px] tracking-[.1em]">{d.schedule.map((s) => (
                <li key={s.productionId + s.date + s.time}><Link href={`/post/${s.productionId}`} className="hud-link flex items-center gap-2 px-1.5 py-1"><span className="hud-num text-[#d8f7ff]">{s.date.slice(5)} {s.time}</span><span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} /><b>{s.talent}</b><span className="ml-auto truncate text-[#6fb6c9]">{s.code}</span></Link></li>
              ))}</ul>
            )}
          </Panel>
        </div>

        {/* ticker */}
        <div className="hud-panel flex items-center gap-3 overflow-hidden px-3 py-1.5 text-[11.5px] tracking-[.14em]">
          <span className="hud-amber flex-none font-bold">ALERTS</span>
          <div className="min-w-0 flex-1 overflow-hidden"><span className="hud-ticker" style={{ color: d.attention.length ? toneC(d.attention[0].tone) : "var(--h-green)" }}>{ticker.toUpperCase()}</span></div>
          <span className="hidden flex-none text-[#3f8aa0] sm:inline">ESC EXIT · F FULL SCREEN</span>
        </div>
      </div>
    </div>
  );
}
