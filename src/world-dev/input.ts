// Keyboard / mouse / touch input collected into one mutable object the game loop reads each frame. No React, no three.js.
import { effectiveTier, stepTier, type FlightTier } from "@/lib/world/player";
import type { CommandAction } from "@/lib/world/command";
export type Action = "interact" | "toggleFly" | "overview" | "follow" | "escape" | "focus" | "return" | "perf" | "hints" | "land" | "details" | "command" | "summonAll" | "wheel" | "tierUp" | "tierDown";
/** Messages from the Founder Command UI to the game loop (UI → world command controller). Simulation-only. */
export type UiCommand =
  | { type: "COMMAND"; action: CommandAction } | { type: "FOCUS"; id: string } | { type: "FOLLOW"; id: string } | { type: "DETAILS"; id: string } | { type: "GO_TO_AGENT"; id: string }
  | { type: "TRAVEL"; id: string } | { type: "OPEN_PAGE"; id: string } | { type: "OVERVIEW" } | { type: "CLOSE_COMMAND" } | { type: "OPEN_COMMAND" } | { type: "CLOSE_SUITE" } | { type: "FLY" } | { type: "TURBO" } | { type: "RETURN" } | { type: "FOCUS_GROUP"; ids: string[] };

export class Input {
  keys = new Set<string>(); lookDX = 0; lookDY = 0; wheel = 0; locked = false;
  stick = { x: 0, y: 0, active: false }; touchUp = 0; touchDown = 0; touchRun = false;
  /** payload actions from the UI (overview markers, landmark list) */
  selectQueue: string[] = []; travelQueue: string[] = []; cmdQueue: UiCommand[] = []; digitQueue: number[] = [];
  /** cruise flight tier ([ ] keys / BOOST button); Shift raises it while held, a double-tap-and-hold Shift latches TURBO */
  cruise: FlightTier = "NORMAL"; private jumpAt = -1; private jumpFrames = 0; private lastShift = 0; private turboLatch = false; touchJumpHeld = false; touchBrake = false;
  private actions: Action[] = []; private dragging = false; private el: HTMLElement | null = null; private cleanup: (() => void)[] = [];
  push(a: Action) { this.actions.push(a); }
  drain(): Action[] { const a = this.actions; this.actions = []; return a; }
  addLook(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }
  consumeLook() { const r = { dx: this.lookDX, dy: this.lookDY, wheel: this.wheel }; this.lookDX = this.lookDY = this.wheel = 0; return r; }
  private down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  get moveX() { return clampN((this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0) + this.stick.x); }
  get moveZ() { return clampN((this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0) + this.stick.y); }
  get run() { return this.down("ShiftLeft", "ShiftRight") || this.touchRun || Math.hypot(this.stick.x, this.stick.y) > 0.82; }
  get up() { return this.down("Space") ? 1 : this.touchUp; }
  get downAxis() { return this.down("ControlLeft", "ControlRight", "KeyZ") ? 1 : this.touchDown; }
  get shiftHeld() { return this.down("ShiftLeft", "ShiftRight") || this.touchRun; }
  get brake() { return this.down("KeyB", "AltLeft", "AltRight") || this.touchBrake; }
  /** the flight tier requested right now */
  flightTier(): FlightTier { return effectiveTier(this.cruise, this.shiftHeld, this.turboLatch); }
  /** Space (or the JUMP button) pressed: buffered for 120 ms so a press just before landing still jumps. Consumed by the game loop. */
  queueJump() { this.jumpAt = performance.now(); this.jumpFrames = 3; }
  /** called once per game frame: true for 120 ms OR 3 frames after the press (so a slow frame rate never swallows a jump) */
  jumpPending(): boolean { if (this.jumpFrames > 0) { this.jumpFrames--; return true; } return this.jumpAt >= 0 && performance.now() - this.jumpAt < 120; }
  clearJump() { this.jumpAt = -1; this.jumpFrames = 0; }
  setCruise(t: FlightTier) { this.cruise = t; }
  get anyMove() { return this.moveX !== 0 || this.moveZ !== 0; }

  attach(el: HTMLElement) {
    this.el = el; const add = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: Window | Document | HTMLElement = window) => { (target as Window).addEventListener(t, f as EventListener); this.cleanup.push(() => (target as Window).removeEventListener(t, f as EventListener)); };
    add("keydown", (e) => {
      if ((e.target as HTMLElement)?.closest?.("input,select,textarea")) return;
      if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "AltLeft", "AltRight", "BracketLeft", "BracketRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return; this.keys.add(e.code);
      const m: Record<string, Action> = { KeyE: "interact", KeyF: "toggleFly", Tab: "overview", KeyO: "overview", KeyT: "follow", Escape: "escape", KeyV: "focus", KeyR: "return", KeyP: "perf", KeyH: "hints", KeyC: "command", KeyG: "summonAll", KeyQ: "wheel", BracketRight: "tierUp", BracketLeft: "tierDown" };
      if (m[e.code]) this.push(m[e.code]);
      if (e.code === "Space") this.queueJump();
      if (/^Digit[1-8]$/.test(e.code)) this.digitQueue.push(+e.code.slice(5));
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") { const t = performance.now(); this.turboLatch = t - this.lastShift < 350; this.lastShift = t; } // double-tap Shift and hold = TURBO
    });
    add("keyup", (e) => { this.keys.delete(e.code); if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.turboLatch = false; });
    add("blur", () => { this.keys.clear(); this.stick = { x: 0, y: 0, active: false }; this.dragging = false; });
    add("mousemove", (e) => { if (this.locked) this.addLook(e.movementX * 0.0023, e.movementY * 0.0023); else if (this.dragging && e.buttons & 1) this.addLook(e.movementX * 0.004, e.movementY * 0.004); });
    add("mousedown", (e) => { if ((e.target as HTMLElement) === el || el.contains(e.target as Node)) { this.dragging = true; } });
    add("mouseup", () => { this.dragging = false; });
    add("wheel", (e) => { if ((e.target as HTMLElement) === el || el.contains(e.target as Node)) this.wheel += e.deltaY; }, window);
    const onLock = () => { this.locked = document.pointerLockElement === el; }; document.addEventListener("pointerlockchange", onLock); this.cleanup.push(() => document.removeEventListener("pointerlockchange", onLock));
    add("click", (e) => { if (!this.locked && e.target === el.querySelector("canvas") && !isTouch()) el.requestPointerLock?.(); }, el);
  }
  detach() { this.cleanup.forEach((f) => f()); this.cleanup = []; if (document.pointerLockElement) document.exitPointerLock(); }
  releasePointer() { if (document.pointerLockElement) document.exitPointerLock(); }
}
const clampN = (v: number) => Math.max(-1, Math.min(1, v));
export const isTouch = () => typeof window !== "undefined" && (("ontouchstart" in window) || navigator.maxTouchPoints > 0) && window.matchMedia?.("(pointer: coarse)").matches;
