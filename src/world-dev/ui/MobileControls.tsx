"use client";
import { useRef, useState } from "react";
import type { Input } from "../input";
import { stepTier, type FlightTier } from "@/lib/world/player";

/** Left virtual joystick, right-side camera drag, and action buttons. Pointer events with per-control pointer ids (multi-touch safe). */
export function MobileControls({ input, flying, canInteract, view, tier, onFlyToggle, onCommand }: { input: Input; flying: boolean; canInteract: boolean; view: string; tier: FlightTier; onFlyToggle: () => void; onCommand: () => void }) {
  const base = useRef<HTMLDivElement>(null), [knob, setKnob] = useState({ x: 0, y: 0 }), stickId = useRef<number | null>(null), lookId = useRef<number | null>(null), last = useRef({ x: 0, y: 0 });
  const R = 56, cap = (e: React.PointerEvent) => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer (tests) */ } };
  const stickMove = (e: React.PointerEvent) => { const r = base.current!.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R); const nx = (dx / l) * k, ny = (dy / l) * k; setKnob({ x: nx * R, y: ny * R }); input.stick = { x: nx, y: -ny, active: true }; };
  const btn = "pointer-events-auto grid h-14 min-w-14 select-none place-items-center rounded-full border border-white/20 bg-black/55 px-1 text-[10.5px] font-bold text-white backdrop-blur active:scale-95 active:bg-white/20";
  return (
    <>
      {/* camera drag surface (right 55%) */}
      <div className="pointer-events-auto absolute inset-y-0 right-0 z-10 w-[58%]" style={{ touchAction: "none" }} aria-hidden
        onPointerDown={(e) => { if (lookId.current === null) { lookId.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY }; cap(e); } }}
        onPointerMove={(e) => { if (e.pointerId === lookId.current) { input.addLook((e.clientX - last.current.x) * 0.0065, (e.clientY - last.current.y) * 0.0065); last.current = { x: e.clientX, y: e.clientY }; } }}
        onPointerUp={(e) => { if (e.pointerId === lookId.current) lookId.current = null; }} onPointerCancel={(e) => { if (e.pointerId === lookId.current) lookId.current = null; }} />
      {/* movement joystick */}
      <div ref={base} className="pointer-events-auto absolute bottom-6 left-5 z-20 h-32 w-32 rounded-full border border-white/20 bg-black/35 backdrop-blur" style={{ touchAction: "none" }} role="application" aria-label="Movement joystick"
        onPointerDown={(e) => { if (stickId.current === null) { stickId.current = e.pointerId; cap(e); stickMove(e); } }}
        onPointerMove={(e) => { if (e.pointerId === stickId.current) stickMove(e); }}
        onPointerUp={(e) => { if (e.pointerId === stickId.current) { stickId.current = null; setKnob({ x: 0, y: 0 }); input.stick = { x: 0, y: 0, active: false }; } }} onPointerCancel={() => { stickId.current = null; setKnob({ x: 0, y: 0 }); input.stick = { x: 0, y: 0, active: false }; }}>
        <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35 shadow-lg" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
      {/* action buttons — context sensitive: jump on foot, up/down/boost/brake in flight */}
      <div className="absolute bottom-6 right-4 z-20 flex flex-col items-end gap-2.5">
        {flying && view === "PLAYER" && <>
          <div className="flex gap-2.5"><button className={btn} aria-label="Descend" onPointerDown={() => (input.touchDown = 1)} onPointerUp={() => (input.touchDown = 0)} onPointerCancel={() => (input.touchDown = 0)}>▼</button><button className={btn} aria-label="Ascend" onPointerDown={() => (input.touchUp = 1)} onPointerUp={() => (input.touchUp = 0)} onPointerCancel={() => (input.touchUp = 0)}>▲</button></div>
          <div className="flex gap-2.5"><button className={btn} aria-label="Brake (hold)" onPointerDown={() => (input.touchBrake = true)} onPointerUp={() => (input.touchBrake = false)} onPointerCancel={() => (input.touchBrake = false)}>BRAKE</button>
            <button className={`${btn} ${tier !== "NORMAL" ? "border-amber-300 text-amber-200" : ""}`} aria-label="Boost: cycle flight speed" onClick={() => input.setCruise(input.cruise === "TURBO" ? "NORMAL" : stepTier(input.cruise, 1))}>{tier === "NORMAL" ? "BOOST" : tier}</button></div>
        </>}
        <div className="flex gap-2.5">
          <button className={btn} onClick={() => input.push("overview")}>{view === "OVERVIEW" || view === "FOCUS" ? "BACK" : "MAP"}</button>
          <button className={btn} onClick={onCommand} aria-label="Founder Command">COMMAND</button>
          <button className={btn} onClick={onFlyToggle}>{flying ? "WALK" : "FLY"}</button>
        </div>
        <div className="flex items-end gap-2.5">
          {!flying && view === "PLAYER" && <button className={`${btn} h-16 w-16 text-[12px]`} aria-label="Jump" onPointerDown={() => input.queueJump()}>JUMP</button>}
          <button className={`${btn} h-16 w-16 text-[12px] ${canInteract ? "border-emerald-300 bg-emerald-500/70" : "opacity-60"}`} onClick={() => input.push("interact")} aria-label="Interact">TALK</button>
        </div>
      </div>
    </>
  );
}
