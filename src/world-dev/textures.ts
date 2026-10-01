// Small procedural canvas textures (generated at runtime — no image files, so there is no third-party asset or licence question).
import * as THREE from "three";

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true, repeat?: [number, number]) {
  const el = document.createElement("canvas"); el.width = w; el.height = h;
  draw(el.getContext("2d")!);
  const t = new THREE.CanvasTexture(el);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
const rnd = (s: number) => { let a = s; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); };

export const woodTexture = () => canvas(256, 256, (c) => {
  const r = rnd(11); c.fillStyle = "#b98a5b"; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { const y = i * 32; const k = 0.82 + r() * 0.3; c.fillStyle = `rgb(${Math.round(190 * k)},${Math.round(142 * k)},${Math.round(97 * k)})`; c.fillRect(0, y + 1, 256, 30);
    c.strokeStyle = "rgba(70,45,25,.22)"; for (let j = 0; j < 6; j++) { c.beginPath(); const yy = y + 4 + r() * 24; c.moveTo(0, yy); c.bezierCurveTo(80, yy + (r() - 0.5) * 3, 170, yy + (r() - 0.5) * 3, 256, yy); c.stroke(); }
    c.fillStyle = "rgba(40,25,12,.55)"; c.fillRect(0, y, 256, 1.5); c.fillRect(Math.floor(r() * 256), y, 1.5, 32); }
}, true, [10, 1]);

export const asphaltTexture = () => canvas(256, 256, (c) => {
  const r = rnd(5); c.fillStyle = "#62666c"; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 82 + Math.floor(r() * 40); c.fillStyle = `rgb(${v},${v + 2},${v + 6})`; c.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
  c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(0, 126, 256, 4); // centre line (stretched along the road)
}, true, [24, 1]);

export const stuccoTexture = () => canvas(256, 256, (c) => {
  const r = rnd(3); c.fillStyle = "#f2ede4"; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) { const v = 222 + Math.floor(r() * 26); c.fillStyle = `rgba(${v},${v - 4},${v - 12},.5)`; c.fillRect(r() * 256, r() * 256, 2, 2); }
}, true, [6, 3]);

export const paversTexture = () => canvas(256, 256, (c) => {
  c.fillStyle = "#d9cfc0"; c.fillRect(0, 0, 256, 256); const r = rnd(8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = 0.93 + r() * 0.1; c.fillStyle = `rgb(${Math.round(222 * k)},${Math.round(212 * k)},${Math.round(196 * k)})`; c.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29); }
}, true, [10, 5]);

export function signTexture(text: string) {
  return canvas(512, 128, (c) => {
    c.fillStyle = "#0f172a"; c.fillRect(0, 0, 512, 128);
    const g = c.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, "#60a5fa"); g.addColorStop(1, "#a78bfa"); c.fillStyle = g; c.fillRect(0, 118, 512, 10);
    c.fillStyle = "#f8fafc"; c.font = "700 54px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("✦", 28, 58); c.fillText(text, 96, 60);
  });
}

/** Name/role badge floating above an agent: glyph disc (role colour) + name + role. */
export function badgeTexture(glyph: string, color: string, name: string, role: string, simulated: boolean) {
  return canvas(512, 160, (c) => {
    c.clearRect(0, 0, 512, 160);
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    c.fillStyle = "rgba(10,14,28,.78)"; rr(6, 10, 500, 120, 30); c.fill(); c.strokeStyle = color; c.lineWidth = 4; rr(6, 10, 500, 120, 30); c.stroke();
    c.fillStyle = color; c.beginPath(); c.arc(70, 70, 44, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.font = "700 50px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(glyph, 70, 74);
    c.textAlign = "left"; c.fillStyle = "#f8fafc"; c.font = "700 38px 'Helvetica Neue', Arial, sans-serif"; c.fillText(name, 132, 52);
    c.fillStyle = "#cbd5e1"; c.font = "500 28px 'Helvetica Neue', Arial, sans-serif"; c.fillText(role, 132, 94);
    if (simulated) { c.fillStyle = "#fbbf24"; c.font = "700 22px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = "center"; c.fillText("SIMULATED", 256, 148); }
  });
}

export const markerTexture = (color: string, glyph: string) => canvas(128, 128, (c) => {
  c.clearRect(0, 0, 128, 128); c.fillStyle = "rgba(10,14,28,.85)"; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill(); c.strokeStyle = color; c.lineWidth = 8; c.stroke();
  c.fillStyle = color; c.font = "700 64px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(glyph, 64, 68);
});

export const cloudTexture = () => canvas(256, 128, (c) => {
  c.clearRect(0, 0, 256, 128); const r = rnd(21);
  for (let i = 0; i < 22; i++) { const x = 40 + r() * 176, y = 50 + r() * 34, rad = 22 + r() * 26, g = c.createRadialGradient(x, y, 2, x, y, rad); g.addColorStop(0, "rgba(255,255,255,.62)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); }
});

export const moodBoardTexture = () => canvas(128, 96, (c) => {
  c.fillStyle = "#0b1220"; c.fillRect(0, 0, 128, 96); const cols = ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#fb7185"]; cols.forEach((k, i) => { c.fillStyle = k; c.fillRect(8 + (i % 3) * 38, 8 + Math.floor(i / 3) * 40, 34, 34); });
});
