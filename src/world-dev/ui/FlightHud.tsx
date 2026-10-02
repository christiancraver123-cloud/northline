"use client";
import type { HudState } from "../Game";
import { TUNING, FLIGHT_TIERS } from "@/lib/world/player";

/** Contextual flight readout (only while flying): mode, speed, altitude, brake — plus restrained speed streaks at FAST/TURBO. Nothing is shown while walking. */
export function FlightHud({ hud, reduced }: { hud: HudState; reduced: boolean }) {
  const f = hud.flight; if (!f.active || hud.view !== "PLAYER") return null;
  const k = Math.min(1, f.speed / TUNING.flyTiers.TURBO.top), streak = reduced ? 0 : Math.max(0, (f.speed - 30) / 68);
  return (<>
    {streak > 0.03 && <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]" data-testid="speed-lines" style={{ opacity: Math.min(0.9, streak), background: "radial-gradient(ellipse at center, rgba(255,255,255,0) 52%, rgba(255,255,255,0.18) 78%, rgba(255,255,255,0.42) 100%)", maskImage: "repeating-conic-gradient(from 0deg, #000 0 1.2deg, transparent 1.2deg 6deg)", WebkitMaskImage: "repeating-conic-gradient(from 0deg, #000 0 1.2deg, transparent 1.2deg 6deg)" }} />}
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-white/15 bg-black/50 px-4 py-2 font-mono text-white backdrop-blur" data-testid="flight-hud">
      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400">MODE</span><span className="text-[15px] font-bold" style={{ color: f.tier === "TURBO" ? "#fbbf24" : f.tier === "FAST" ? "#7dd3fc" : "#fff" }} data-testid="flight-tier">{f.tier === "NORMAL" ? "FLIGHT" : f.tier}</span><span className="mt-0.5 flex gap-0.5">{FLIGHT_TIERS.map((t, i) => <i key={t} className="h-1.5 w-4 rounded-sm" style={{ background: i <= FLIGHT_TIERS.indexOf(f.tier) ? "#fff" : "rgba(255,255,255,0.25)" }} />)}</span></div>
      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400">SPEED</span><span className="text-[15px] font-bold tabular-nums" data-testid="flight-speed">{Math.round(f.speed)} m/s</span><span className="mt-0.5 h-1.5 w-16 overflow-hidden rounded-sm bg-white/20"><i className="block h-full bg-sky-300" style={{ width: `${k * 100}%` }} /></span></div>
      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400">ALT</span><span className="text-[15px] font-bold tabular-nums" data-testid="flight-alt">{Math.round(f.altitude)} m</span></div>
      {f.braking && <span className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">BRAKE</span>}
    </div>
  </>);
}
