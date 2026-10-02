// Canvas painters for the live HQ displays. Premium-studio look (calm slate + warm oak accents), SIMULATED label always present. DOM-only (canvas 2D).
import { BOUNDS, ROAD, BOARDWALK, shoreZ } from "@/lib/world/terrain";
import { LANDMARKS } from "@/lib/world/layout";
import { sortedByAttention, type BoardData } from "@/lib/world/board";

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const ink = "#e8eef5", dim = "#8fa1b3", panel = "#141c26", line = "#2a3646";
function dash(ctx: CanvasRenderingContext2D, pattern: string) { ctx.setLineDash(pattern === "dashed" ? [5, 4] : pattern === "dotted" ? [1.5, 3.5] : []); ctx.lineWidth = pattern === "double" ? 3 : 2; }

let baseMap: HTMLCanvasElement | null = null;
const MX = 56, MY = 58;
function mapXf(w: number, h: number) { const iw = w - MX * 2, ih = h - MY - 40, sx = iw / (BOUNDS.maxX - BOUNDS.minX), sz = ih / (BOUNDS.maxZ - BOUNDS.minZ), s = Math.min(sx, sz); const ox = MX + (iw - (BOUNDS.maxX - BOUNDS.minX) * s) / 2, oy = MY + (ih - (BOUNDS.maxZ - BOUNDS.minZ) * s) / 2; return { X: (x: number) => ox + (x - BOUNDS.minX) * s, Z: (z: number) => oy + (z - BOUNDS.minZ) * s, s }; }
function paintBase(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d")!, { X, Z, s } = mapXf(w, h);
  ctx.fillStyle = "#0e151d"; ctx.fillRect(0, 0, w, h);
  // land + sea
  ctx.fillStyle = "#1b2a24"; ctx.fillRect(X(BOUNDS.minX), Z(BOUNDS.minZ), (BOUNDS.maxX - BOUNDS.minX) * s, (BOUNDS.maxZ - BOUNDS.minZ) * s);
  ctx.fillStyle = "#12344a"; ctx.beginPath(); ctx.moveTo(X(BOUNDS.minX), Z(BOUNDS.maxZ)); for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 4) ctx.lineTo(X(x), Z(shoreZ(x))); ctx.lineTo(X(BOUNDS.maxX), Z(BOUNDS.maxZ)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a3f46"; ctx.fillRect(X(BOUNDS.minX), Z(ROAD.z0), (BOUNDS.maxX - BOUNDS.minX) * s, (ROAD.z1 - ROAD.z0) * s);
  ctx.fillStyle = "#6b5a43"; ctx.fillRect(X(BOUNDS.minX), Z(BOARDWALK.z0), (BOUNDS.maxX - BOUNDS.minX) * s, (BOARDWALK.z1 - BOARDWALK.z0) * s);
  // buildings / landmarks
  ctx.font = `600 ${Math.round(11)}px ${FONT}`; ctx.textAlign = "center";
  for (const l of LANDMARKS) { const hq = l.id === "hq", bw = (hq ? 36 : 16) * s * 1.0, bh = (hq ? 20 : 11) * s; ctx.fillStyle = hq ? "#d9c9a5" : "#5b6b78"; ctx.fillRect(X(l.x) - bw / 2, Z(l.z - 4) - bh / 2, bw, bh); if (hq || ["pier", "marina", "observatory"].includes(l.id)) { ctx.fillStyle = dim; ctx.fillText(l.name.replace("Northline ", "").toUpperCase().slice(0, 14), X(l.x), Z(l.z - 4) + bh / 2 + 12); } }
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(X(BOUNDS.minX) + 0.5, Z(BOUNDS.minZ) + 0.5, (BOUNDS.maxX - BOUNDS.minX) * s, (BOUNDS.maxZ - BOUNDS.minZ) * s);
  return c;
}
/** The command table: live map of the town with every agent (3-letter code ring; ring pattern = status), the founder, and a legend. */
export function paintTable(ctx: CanvasRenderingContext2D, w: number, h: number, b: BoardData) {
  if (!baseMap || baseMap.width !== w) baseMap = paintBase(w, h);
  ctx.setLineDash([]); ctx.drawImage(baseMap, 0, 0);
  const { X, Z } = mapXf(w, h);
  ctx.fillStyle = ink; ctx.font = `700 22px ${FONT}`; ctx.textAlign = "left"; ctx.fillText("NORTHLINE  ·  COMMAND TABLE", 24, 34);
  ctx.font = `600 13px ${MONO}`; ctx.fillStyle = "#f5c04a"; ctx.fillText("SIMULATED DATA — NOT REAL NORTHLINE STATE", 24, 52);
  // agents
  ctx.textAlign = "center";
  for (const a of b.agents) {
    const x = X(a.x), y = Z(a.z); ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = a.color; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#f8fafc"; dash(ctx, a.pattern); ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#0b1118"; ctx.font = `800 11px ${MONO}`; ctx.fillText(a.code3, x, y + 4); ctx.fillStyle = ink; ctx.font = `600 12px ${FONT}`; ctx.fillText(a.symbol, x, y - 20);
  }
  // founder
  { const x = X(b.player.x), y = Z(b.player.z); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - b.player.yaw); ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#0b1118"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.fillStyle = "#fff"; ctx.font = `700 11px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("YOU", x, y + 24); }
  // legend
  ctx.textAlign = "left"; ctx.font = `600 12px ${MONO}`; ctx.fillStyle = dim; ctx.fillText("▶ working   ◔ waiting   ⊘ blocked   ○ idle   ➜ summoned   ▣ meeting", 24, h - 14);
  ctx.textAlign = "right"; ctx.fillStyle = ink; ctx.fillText(`${b.counts.working} working · ${b.counts.waiting} waiting · ${b.counts.blocked} blocked`, w - 24, h - 14);
}
/** The Command Center wall: status tiles + the agent roster, blocked/waiting first. */
export function paintWall(ctx: CanvasRenderingContext2D, w: number, h: number, b: BoardData) {
  ctx.setLineDash([]); ctx.fillStyle = "#0d141c"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = panel; ctx.fillRect(10, 10, w - 20, h - 20);
  ctx.textAlign = "left"; ctx.fillStyle = ink; ctx.font = `800 26px ${FONT}`; ctx.fillText("NORTHLINE OPERATIONS", 28, 46); ctx.font = `700 13px ${MONO}`; ctx.fillStyle = "#f5c04a"; ctx.fillText("SIMULATED DATA — NOT REAL NORTHLINE STATE", 28, 68);
  const tiles: [string, string][] = [["WORKING", String(b.counts.working)], ["WAITING", String(b.counts.waiting)], ["BLOCKED", String(b.counts.blocked)], ["IDLE", String(b.counts.idle)], ["APPROVALS", String(b.approvals)], ["IMAGES TODAY", String(b.budget.imagesToday)], ["BUDGET LEFT", String(b.budget.limitsRemaining)], ["SYSTEM", b.system]];
  tiles.forEach(([k, v], i) => { const x = 28 + (i % 4) * 150, y = 90 + Math.floor(i / 4) * 138; ctx.fillStyle = "#1b2634"; ctx.fillRect(x, y, 140, 126); ctx.fillStyle = dim; ctx.font = `700 12px ${MONO}`; ctx.fillText(k, x + 10, y + 24); ctx.fillStyle = ink; ctx.font = `800 ${v.length > 6 ? 22 : 44}px ${FONT}`; ctx.fillText(v, x + 10, y + 82); });
  const rows = sortedByAttention(b.agents), colW = 440, x0 = 660;
  ctx.fillStyle = dim; ctx.font = `700 12px ${MONO}`; ctx.fillText("AGENTS — attention first", x0, 40);
  rows.forEach((a, i) => { const col = i < 5 ? 0 : 1, r = i % 5, x = x0 + col * (colW + 14), y = 56 + r * 66; ctx.fillStyle = "#1b2634"; ctx.fillRect(x, y, colW, 58);
    ctx.fillStyle = a.color; ctx.fillRect(x, y, 6, 58); ctx.fillStyle = ink; ctx.font = `800 18px ${MONO}`; ctx.fillText(`${a.glyph} ${a.code3}`, x + 16, y + 24); ctx.font = `600 16px ${FONT}`; ctx.fillText(a.name, x + 98, y + 24);
    ctx.fillStyle = a.statusCode === "BLOCKED" || a.statusCode === "FAILED" ? "#fdba74" : ink; ctx.font = `700 14px ${MONO}`; ctx.fillText(`${a.symbol} ${a.word}`.slice(0, 34), x + 16, y + 46); ctx.fillStyle = dim; ctx.font = `500 13px ${FONT}`; ctx.textAlign = "right"; ctx.fillText(a.where.slice(0, 26), x + colW - 10, y + 24); ctx.textAlign = "left"; });
  ctx.fillStyle = dim; ctx.font = `600 13px ${MONO}`; ctx.fillText(b.meeting ? "MEETING CALLED — agents are heading to the HQ meeting room" : b.summoned ? `${b.summoned} agents are following a founder command` : "No active founder command", 28, h - 26);
}
export function paintSuite(ctx: CanvasRenderingContext2D, w: number, h: number, b: BoardData) {
  ctx.setLineDash([]); ctx.fillStyle = "#0d141c"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = ink; ctx.textAlign = "left"; ctx.font = `800 20px ${FONT}`; ctx.fillText("FOUNDER", 14, 30); ctx.fillStyle = "#f5c04a"; ctx.font = `700 11px ${MONO}`; ctx.fillText("SIMULATED", 14, 48);
  ctx.fillStyle = ink; ctx.font = `700 16px ${MONO}`; ctx.fillText(`▶ ${b.counts.working} working`, 14, 84); ctx.fillText(`⊘ ${b.counts.blocked} blocked   ◔ ${b.counts.waiting} waiting`, 14, 108); ctx.fillText(`approvals ${b.approvals}`, 14, 132); ctx.fillStyle = "#7fe0d0"; ctx.font = `800 15px ${FONT}`; ctx.fillText("PRESS  E", 14, h - 18);
}
