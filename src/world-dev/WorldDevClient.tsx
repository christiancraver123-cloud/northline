"use client";
// Northline World — DEVELOPMENT PROOF OF CONCEPT. Runs on a SIMULATED fixture only; no real Northline state, no network, no model/provider call.
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdaptiveQuality, TIERS, selectInitialTier, type DeviceInfo, type Tier } from "@/lib/world/quality";
import { buildAgentPanel, parseSimulatedSnapshot, type WorldSnapshot } from "@/lib/world/schema";
import { SimulatedScenario } from "./fixtures/scenario";
import { Game, type HudState, type Overlay, type PerfState } from "./Game";
import { LANDMARKS } from "@/lib/world/layout";
import { WORLD_ROSTER, roleStyle as rStyle } from "@/lib/world/roster";
import { FounderCommand } from "./ui/FounderCommand";
import { FlightHud } from "./ui/FlightHud";
import { SuitePanel } from "./ui/SuitePanel";
import { WheelMenu } from "./ui/WheelMenu";
import { travelPoints } from "@/lib/world/travel";
import { Input, isTouch } from "./input";
import { QualityContext } from "./scene/context";
import { AgentPanel } from "./ui/AgentPanel";
import { MobileControls } from "./ui/MobileControls";
import { PerfOverlay } from "./ui/PerfOverlay";

function deviceInfo(): DeviceInfo {
  let gpu = "unknown", maxTexture = 4096;
  try { const c = document.createElement("canvas"), g = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null; if (g) { const e = g.getExtension("WEBGL_debug_renderer_info"); gpu = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : String(g.getParameter(g.RENDERER)); maxTexture = g.getParameter(g.MAX_TEXTURE_SIZE); } } catch { /* no GL */ }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return { isTouch: isTouch(), width: window.innerWidth, cores: navigator.hardwareConcurrency || 4, memoryGB: nav.deviceMemory ?? null, dpr: window.devicePixelRatio || 1, gpu, maxTexture };
}
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

const LABEL_CSS = `
.alabel{flex-direction:column;align-items:flex-start;white-space:nowrap;background:rgba(8,12,22,.74);color:#fff;border:2px solid rgba(255,255,255,.3);border-radius:10px;padding:2px 7px;font:600 11.5px ui-sans-serif,system-ui,sans-serif;backdrop-filter:blur(3px);line-height:1.25}
.alabel .al-head{display:flex;gap:5px;align-items:center}
.alabel .al-glyph{display:grid;place-items:center;width:17px;height:17px;border-radius:999px;font-size:10px;font-weight:800}
.alabel .al-code{font:800 10px ui-monospace,Menlo,monospace;opacity:.85}
.alabel .al-mark{font-weight:800;margin-left:2px}
.alabel .al-role,.alabel .al-status{display:none;font-size:10px;opacity:.9}
.alabel .al-status{font:700 10px ui-monospace,Menlo,monospace}
.alabel[data-level=FULL] .al-role,.alabel[data-level=FULL] .al-status{display:block}
.alabel[data-level=FULL] .al-mark{display:none}
.alabel[data-level=NAME] .al-mark{display:none}
.alabel[data-level=MARKER]{padding:2px 5px}
.alabel[data-level=MARKER] .al-name,.alabel[data-level=MARKER] .al-code{display:none}
.alabel[data-pattern=dashed]{border-style:dashed}.alabel[data-pattern=double]{border-style:double;border-width:4px}.alabel[data-pattern=dotted]{border-style:dotted}
.alabel[data-status=BLOCKED] .al-status,.alabel[data-status=FAILED] .al-status{color:#fdba74}
.alabel[data-selected="1"]{border-color:#7dd3fc;box-shadow:0 0 0 3px rgba(125,211,252,.3);background:rgba(12,40,64,.88)}
.alabel[data-sel="1"] .al-head::after{content:"✓";font-weight:800;color:#7dd3fc;margin-left:3px}
`;
export default function WorldDevClient() {
  const [ready, setReady] = useState(false), [supported, setSupported] = useState(true), [touch, setTouch] = useState(false), [reduced, setReduced] = useState(false);
  const [tier, setTier] = useState<Tier>("MEDIUM"), [manual, setManual] = useState<Tier | null>(null), [auto, setAuto] = useState<Tier>("MEDIUM"), [showPerf, setShowPerf] = useState(false), [hints, setHints] = useState(true);
  const [hud, setHud] = useState<HudState | null>(null), [perf, setPerf] = useState<PerfState | null>(null), [snap, setSnap] = useState<WorldSnapshot | null>(null), [started, setStarted] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const [places, setPlaces] = useState(false), [fade, setFade] = useState(false);
  const overlay = useRef<Overlay>({ labels: new Map(), landmarks: new Map() });
  const input = useMemo(() => new Input(), []), host = useRef<HTMLDivElement>(null), adaptive = useRef<AdaptiveQuality>(new AdaptiveQuality("MEDIUM"));
  const scenario = useMemo(() => new SimulatedScenario(Date.now()), []), seq = useRef(0), snapRef = useRef<WorldSnapshot>(parseSimulatedSnapshot(scenario.snapshot(Date.now(), 0)));

  useEffect(() => { // capability detection happens once on the client
    const params = new URLSearchParams(location.search), forceList = params.get("mode") === "list";
    const ok = hasWebGL() && !forceList; setSupported(ok);
    const d = deviceInfo(), t = selectInitialTier(d), forced = params.get("tier")?.toUpperCase() as Tier | undefined, m = forced && forced in TIERS ? forced : null;
    adaptive.current = new AdaptiveQuality(t, d.isTouch && d.width < 900 ? 30 : 60, m); setAuto(t); setManual(m); setTier(m ?? t); setTouch(d.isTouch || params.get("touch") === "1"); setShowPerf(params.get("perf") === "1");
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false); setReady(true);
  }, []);
  useEffect(() => { // the SIMULATED world state, ticking once a second (no network)
    const tick = () => { try { const s = parseSimulatedSnapshot(scenario.snapshot(Date.now(), ++seq.current)); snapRef.current = s; setSnap(s); } catch (e) { setMsg(e instanceof Error ? e.message : "fixture rejected"); } };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [scenario]);
  useEffect(() => { const el = host.current; if (!el || !supported) return; input.attach(el); const k = (e: KeyboardEvent) => { if (e.code === "KeyP") setShowPerf((v) => !v); if (e.code === "KeyH") setHints((v) => !v); }; window.addEventListener("keydown", k); return () => { input.detach(); window.removeEventListener("keydown", k); }; }, [input, supported, ready]);

  const q = TIERS[tier], onTier = useCallback((t: Tier) => setTier(t), []);
  const setManualTier = useCallback((t: Tier | null) => { setManual(t); adaptive.current.setManual(t, auto); setTier(t ?? auto); }, [auto]);
  const selId = hud?.selectedAgent ?? null, model = hud && snap && hud.panelOpen && selId ? buildAgentPanel(snap, selId, hud.ambient) : null;
  const agent = selId ? snap?.agents.find((a) => a.agentId === selId) : undefined, st = rStyle(selId ?? "");
  const inOverview = hud?.view === "OVERVIEW" || hud?.view === "FOCUS";
  const onTravel = useCallback(() => { setFade(true); setTimeout(() => setFade(false), 350); }, []);
  const travel = (id: string) => { input.travelQueue.push(id); setPlaces(false); };
  const blurAfter = (e: React.MouseEvent) => { const t = e.target as HTMLElement; if (t.closest?.("button,a,input")) setTimeout(() => (document.activeElement as HTMLElement | null)?.blur?.(), 0); }; // keep Space/Enter for the game, not for the last-clicked button

  if (!ready) return <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b1020] text-slate-300">Loading Northline World…</div>;
  if (!supported) return <Fallback snap={snap} />;

  const modeCls = hud?.view === "FOLLOW" ? "border-violet-400 text-violet-200" : hud?.view === "OVERVIEW" || hud?.view === "FOCUS" ? "border-sky-400 text-sky-200" : hud?.locomotion === "AIR" ? "border-cyan-300 text-cyan-100" : "border-white/30 text-white";
  return (
    <div ref={host} className="fixed inset-0 z-50 select-none overflow-hidden bg-[#9cc3dd] text-white" style={{ touchAction: "none" }} data-testid="world-root" onClickCapture={blurAfter}>
      <QualityContext.Provider value={q}>
        <Canvas key="world" dpr={[1, q.dprMax]} gl={{ antialias: adaptive.current.manual ? TIERS[adaptive.current.manual].antialias : TIERS[auto].antialias, powerPreference: "high-performance", alpha: false }} camera={{ fov: 60, near: 0.1, far: q.far, position: [-3.5, 3.4, -18] }} shadows frameloop="always">
          <Game input={input} snapshotRef={snapRef} q={q} adaptive={adaptive} onTier={onTier} onHud={setHud} onPerf={setPerf} onTravel={onTravel} overlay={overlay} reducedMotion={reduced} />
        </Canvas>
      </QualityContext.Provider>

      {/* name tags / overview markers + landmark labels: positioned each frame by Game (no React churn) */}
      <style>{LABEL_CSS}</style>
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {WORLD_ROSTER.map((r) => (
          <button key={r.code} data-agent-label={r.code} ref={(el) => { if (el) overlay.current.labels.set(r.code, el); else overlay.current.labels.delete(r.code); }} onClick={() => input.selectQueue.push(r.code)} style={{ display: "none", position: "absolute", left: 0, top: 0 }} className="alabel" data-level="NAME" data-pattern="none">
            <span className="al-head"><span className="al-glyph" style={{ background: r.color }}>{r.glyph}</span><span className="al-code">{r.code3}</span><span className="al-name">{r.persona}</span><span className="al-mark" data-f="mark" /></span>
            <span className="al-role">{r.registryName}</span><span className="al-status" data-f="status" />
          </button>))}
        {LANDMARKS.map((l) => <span key={l.id} ref={(el) => { if (el) overlay.current.landmarks.set(l.id, el); else overlay.current.landmarks.delete(l.id); }} style={{ display: "none", position: "absolute", left: 0, top: 0 }} className="whitespace-nowrap rounded bg-white/85 px-2 py-0.5 text-[11px] font-bold text-slate-800 shadow">{l.name}</span>)}
      </div>
      <div className={`pointer-events-none absolute inset-0 z-[34] bg-white transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`} aria-hidden />

      {/* SIMULATED banner — always visible */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center"><div className="mt-2 rounded-full border border-amber-400/70 bg-amber-950/80 px-4 py-1 text-[11.5px] font-bold tracking-wide text-amber-300 backdrop-blur" role="status">SIMULATED WORLD — NOT REAL NORTHLINE STATE</div></div>
      <div className="pointer-events-auto absolute left-3 top-2.5 z-30 flex items-center gap-3 rounded-full bg-black/45 px-3 py-1.5 text-[12px] backdrop-blur"><Link href="/" className="font-semibold text-slate-200 hover:text-white">← Command Center</Link><span className="text-slate-400">Northline World · simulated</span></div>
      {hud && <div className="pointer-events-none absolute left-3 top-12 z-20 rounded-full bg-black/45 px-3 py-1 text-[12px] backdrop-blur" data-testid="location">📍 {hud.location}{hud.indoor ? " · indoors" : ""}</div>}
      <div className="absolute right-3 top-2.5 z-30 flex items-center gap-2">
        <button onClick={() => input.push("command")} className="pointer-events-auto rounded-full border border-sky-300/60 bg-sky-500/30 px-3 py-1 text-[12px] font-bold backdrop-blur hover:bg-sky-500/50" aria-pressed={!!hud?.commandOpen} data-testid="command-btn">COMMAND [C]</button>
        <button onClick={() => setPlaces((v) => !v)} className="pointer-events-auto rounded-full border border-white/25 bg-black/50 px-3 py-1 text-[12px] font-semibold backdrop-blur hover:bg-white/10" aria-expanded={places} data-testid="places-btn">Places</button>
        <span className={`rounded-full border bg-black/50 px-3 py-1 font-mono text-[12px] font-bold backdrop-blur ${modeCls}`} data-testid="mode">{hud?.modeLabel ?? "WALK"}</span>
        <button onClick={() => setShowPerf((v) => !v)} className="pointer-events-auto rounded-full border border-white/25 bg-black/50 px-3 py-1 font-mono text-[11px] backdrop-blur hover:bg-white/10" aria-pressed={showPerf}>{perf ? `${perf.fps.toFixed(0)} fps · ${tier}` : tier}</button>
      </div>

      {places && <div className="pointer-events-auto absolute right-3 top-12 z-[33] max-h-[70vh] w-[260px] overflow-y-auto rounded-xl border border-white/15 bg-[#0b1020]/95 p-2 text-[12.5px] backdrop-blur" data-testid="places">
        <button onClick={() => travel("hq")} className="mb-1 w-full rounded-lg bg-sky-500 px-3 py-2 font-bold hover:bg-sky-400">Go to Northline HQ</button>
        {(["Northline", "Districts", "Creator residences"] as const).map((sec) => <div key={sec}><div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{sec}</div>{travelPoints().filter((t) => t.section === sec && t.id !== "hq").map((t) => <button key={t.id} onClick={() => travel(t.id)} className="block w-full rounded px-2 py-1 text-left hover:bg-white/10">{t.label}</button>)}</div>)}
        <div className="px-2 pt-1 text-[10.5px] text-slate-500">Optional fast travel. Walk or fly as the main way to move.</div></div>}
      {/* follow chip */}
      {hud?.following && agent && <div className="pointer-events-auto absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-violet-400/60 bg-[#140f2a]/85 px-4 py-2 text-[13px] backdrop-blur" data-testid="follow-chip">
        <span style={{ color: st.color }} className="font-bold">{st.glyph}</span><span><b>Following {agent.name}</b> · {hud.location} · {agent.opState === "IDLE" ? "idle (ambient)" : agent.opState.toLowerCase()}{hud.ambient ? ` — ${hud.ambient}` : ""}</span>
        <button onClick={() => input.push("interact")} className="rounded-lg border border-white/20 px-2 py-0.5 text-[12px] hover:bg-white/10">Status</button><button onClick={() => input.push("follow")} className="rounded-lg bg-violet-500 px-2.5 py-0.5 text-[12px] font-bold hover:bg-violet-400">Exit [T]</button></div>}
      {hud && (hud.commandOpen || inOverview) && <FounderCommand hud={hud} input={input} mobile={touch} inOverview={!!inOverview} />}
      {hud?.suiteOpen && <SuitePanel hud={hud} input={input} mobile={touch} />}
      {hud?.wheelOpen && <WheelMenu input={input} mobile={touch} onClose={() => input.push("wheel")} />}
      {hud && <FlightHud hud={hud} reduced={reduced} />}

      {/* interaction prompt */}
      {hud?.prompt && !hud.panelOpen && !hud.suiteOpen && !hud.commandOpen && !hud.wheelOpen && !touch && <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/25 bg-black/60 px-5 py-2.5 text-[14px] font-semibold backdrop-blur" data-testid="prompt">{hud.canInteract ? <><kbd className="mr-2 rounded bg-white px-1.5 py-0.5 font-mono text-[12px] text-black">E</kbd>{hud.prompt}</> : hud.prompt}</div>}
      {hud?.prompt && !hud.panelOpen && touch && !hud.canInteract && <div className="pointer-events-none absolute bottom-40 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-[13px] backdrop-blur">{hud.prompt}</div>}

      {model && selId && <AgentPanel m={model} agentId={selId} following={!!hud?.following} canFocus mobile={touch} onFollow={() => input.push("follow")} onFocus={() => input.push("focus")} onClose={() => input.push("interact")} />}

      {/* desktop controls hint + buttons */}
      {!touch && <div className="pointer-events-auto absolute bottom-3 left-3 z-20">
        {hints ? <div className="w-[300px] rounded-xl border border-white/10 bg-black/55 p-3 text-[12px] leading-5 text-slate-100 backdrop-blur" data-testid="hints">
          <div className="mb-1 flex justify-between font-bold"><span>Controls</span><button onClick={() => setHints(false)} className="text-slate-400 hover:text-white">hide [H]</button></div>
          <div><b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>mouse</b> look</div><div><b>F</b> fly ⇄ walk · <b>Space</b>/<b>Ctrl</b> up/down · <b>Shift</b> fast · <b>⇧⇧</b> turbo · <b>[ ]</b> speed · <b>B</b> brake</div><div><b>C</b> Founder Command · <b>G</b> summon all · <b>Q</b> wheel · <b>Tab</b> overview</div><div><b>E</b> interact · <b>T</b> follow · <b>V</b> focus · <b>R</b> return · <b>Esc</b> back · <b>P</b> perf</div></div>
          : <button onClick={() => setHints(true)} className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[12px] backdrop-blur">Controls [H]</button>}
      </div>}
      {!touch && <div className="pointer-events-auto absolute bottom-3 right-3 z-20 flex gap-2">
        {[["Fly / Walk [F]", "toggleFly"], ["Summon all [G]", "summonAll"], ["Overview [Tab]", "overview"]].map(([l, a]) => <button key={a} onClick={() => input.push(a as never)} className="rounded-xl border border-white/20 bg-black/55 px-3.5 py-2 text-[12.5px] font-semibold backdrop-blur hover:bg-white/15">{l}</button>)}</div>}
      {touch && hud && <MobileControls input={input} flying={hud.locomotion === "AIR"} canInteract={hud.canInteract} view={hud.view} tier={hud.flight.tier} onFlyToggle={() => input.push("toggleFly")} onCommand={() => input.push("command")} />}

      {showPerf && <PerfOverlay shift={!!(inOverview || hud?.commandOpen) && !touch} p={perf} manual={manual} onManual={setManualTier} onSimulate={() => scenario.forceTask(hud?.selectedAgent ?? hud?.targetAgent ?? WORLD_ROSTER[2].code, Date.now())} auto={auto} />}
      {!started && !touch && <button className="absolute inset-0 z-[35] grid place-items-center bg-black/35 backdrop-blur-[2px]" onClick={() => setStarted(true)} aria-label="Start"><div className="rounded-2xl border border-white/20 bg-[#0b1020]/90 px-8 py-6 text-center"><div className="text-xl font-bold">Northline World <span className="text-amber-300">· simulated</span></div><div className="mt-2 text-[13.5px] text-slate-300">Press <b>C</b> for Founder Command (summon every agent with <b>G</b>), <b>Tab</b> for the map, <b>Space</b> to jump, <b>F</b> to fly.<br />Click to start — then click the world to capture the mouse.</div></div></button>}
      {!started && touch && <button className="absolute inset-0 z-[35] grid place-items-center bg-black/35" onClick={() => setStarted(true)}><div className="mx-6 rounded-2xl border border-white/20 bg-[#0b1020]/90 px-6 py-5 text-center"><div className="text-lg font-bold">Northline World <span className="text-amber-300">· simulated</span></div><div className="mt-2 text-[13px] text-slate-300">Left stick moves · drag right side to look · tap FLY to take off · walk into HQ and tap TALK beside an agent</div><div className="mt-3 text-[13px] font-bold text-sky-300">Tap to start</div></div></button>}
      {msg && <div className="absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg bg-rose-900/90 px-3 py-2 text-[12px]">{msg}</div>}
    </div>
  );
}

/** Accessibility / no-WebGL fallback: the same simulated state as plain text. */
function Fallback({ snap }: { snap: WorldSnapshot | null }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#0b1020] p-6 text-slate-100">
      <div className="mx-auto max-w-xl"><div className="mb-3 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-300">SIMULATED WORLD — NOT REAL NORTHLINE STATE</div>
        <h1 className="text-xl font-bold">Northline World (text view)</h1><p className="mt-1 text-sm text-slate-400">3D is unavailable on this device or was switched off, so this is the same simulated state as text. <Link className="text-sky-300 underline" href="/">Back to the Command Center</Link></p>
        <ul className="mt-4 grid gap-3 text-sm" aria-live="polite">{snap?.agents.map((a) => <li key={a.agentId} className="rounded border border-white/10 p-2"><b>{a.name}</b> — {a.role}<br />Status: {a.opState}{a.opState === "IDLE" ? " (no task)" : ""} · Task: {a.taskTitle ?? "—"} · Workspace: {a.workspace} · Next: {a.nextAction ?? "—"}</li>)}</ul></div>
    </div>
  );
}
