// HUD sound + voice. Tones are synthesized with Web Audio (no files, nothing leaves the Mac); the spoken briefing uses
// the browser's built-in voices. Both stay silent until the first click or key press, as browsers require.
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("nl-hud-mute") === "1"; } catch { /* storage off */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem("nl-hud-mute", m ? "1" : "0"); } catch { /* storage off */ } if (m) window.speechSynthesis?.cancel(); }

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) { const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!A) return null; ctx = new A(); }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.05, slideTo?: number) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
let lastHover = 0;
export type Sfx = "hover" | "click" | "open" | "close" | "approve" | "deny" | "error" | "boot" | "type";
export function sfx(kind: Sfx) {
  if (muted) return;
  switch (kind) {
    case "hover": { const n = performance.now(); if (n - lastHover < 70) return; lastHover = n; tone(2400, 0, 0.03, "sine", 0.012); break; }
    case "type": tone(1800 + Math.random() * 400, 0, 0.02, "square", 0.008); break;
    case "click": tone(1320, 0, 0.05, "triangle", 0.04); tone(1760, 0.04, 0.05, "triangle", 0.03); break;
    case "open": tone(440, 0, 0.18, "sawtooth", 0.025, 1320); tone(1760, 0.12, 0.08, "sine", 0.03); break;
    case "close": tone(1320, 0, 0.16, "sawtooth", 0.02, 380); break;
    case "approve": tone(880, 0, 0.09, "triangle", 0.05); tone(1320, 0.08, 0.09, "triangle", 0.05); tone(1760, 0.16, 0.14, "sine", 0.045); break;
    case "deny": tone(520, 0, 0.12, "square", 0.025, 260); tone(260, 0.1, 0.12, "square", 0.02); break;
    case "error": tone(200, 0, 0.18, "square", 0.03); tone(180, 0.2, 0.18, "square", 0.03); break;
    case "boot": [220, 330, 440, 660, 880, 1320].forEach((f, i) => tone(f, i * 0.09, 0.14, "sine", 0.03)); tone(55, 0, 0.9, "sine", 0.06, 110); break;
  }
}

export function speak(text: string) {
  if (muted || typeof window === "undefined" || !window.speechSynthesis) return;
  const s = window.speechSynthesis; s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = s.getVoices();
  u.voice = voices.find((v) => /Daniel|Arthur|Google UK English Male|Oliver/i.test(v.name)) ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  u.rate = 1.03; u.pitch = 0.9; u.volume = 0.9;
  s.speak(u);
}
