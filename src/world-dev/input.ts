// Keyboard / mouse / touch input collected into one mutable object the game loop reads each frame. No React, no three.js.
export type Action = "interact" | "toggleFly" | "overview" | "follow" | "escape" | "focus" | "return" | "perf" | "hints" | "land";

export class Input {
  keys = new Set<string>(); lookDX = 0; lookDY = 0; wheel = 0; locked = false;
  stick = { x: 0, y: 0, active: false }; touchUp = 0; touchDown = 0; touchRun = false;
  private actions: Action[] = []; private lastSpace = 0; private dragging = false; private el: HTMLElement | null = null; private cleanup: (() => void)[] = [];
  push(a: Action) { this.actions.push(a); }
  drain(): Action[] { const a = this.actions; this.actions = []; return a; }
  addLook(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }
  consumeLook() { const r = { dx: this.lookDX, dy: this.lookDY, wheel: this.wheel }; this.lookDX = this.lookDY = this.wheel = 0; return r; }
  private down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  get moveX() { return clampN((this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0) + this.stick.x); }
  get moveZ() { return clampN((this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0) + this.stick.y); }
  get run() { return this.down("ShiftLeft", "ShiftRight") || this.touchRun || Math.hypot(this.stick.x, this.stick.y) > 0.88; }
  get up() { return this.down("Space") ? 1 : this.touchUp; }
  get downAxis() { return this.down("ControlLeft", "KeyC", "KeyZ") ? 1 : this.touchDown; }
  get anyMove() { return this.moveX !== 0 || this.moveZ !== 0; }

  attach(el: HTMLElement) {
    this.el = el; const add = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: Window | Document | HTMLElement = window) => { (target as Window).addEventListener(t, f as EventListener); this.cleanup.push(() => (target as Window).removeEventListener(t, f as EventListener)); };
    add("keydown", (e) => {
      if ((e.target as HTMLElement)?.closest?.("input,select,textarea")) return;
      if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return; this.keys.add(e.code);
      const m: Record<string, Action> = { KeyE: "interact", KeyF: "toggleFly", Tab: "overview", KeyO: "overview", KeyT: "follow", Escape: "escape", KeyQ: "focus", KeyR: "return", KeyP: "perf", KeyH: "hints" };
      if (m[e.code]) this.push(m[e.code]);
      if (e.code === "Space") { const t = performance.now(); if (t - this.lastSpace < 320) this.push("toggleFly"); this.lastSpace = t; } // double-tap Space = take off / land
    });
    add("keyup", (e) => { this.keys.delete(e.code); });
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
