// Procedural humanoid rig (stylised, smooth capsules) shared by the operator and every agent. Faces +z. Pure three.js.
// Built from MERGED vertex-coloured parts on ONE shared material: ~12 draw calls per rig, and rigs far from the camera are swapped for cheap proxies.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AccessoryKind, HairStyle, HatKind, OutfitKind, PropKind } from "@/lib/world/roster";

export interface HumanoidSpec { skin: string; hair: string; top: string; bottom: string; shoes: string; accent: string; hat: HatKind; prop: PropKind; hairStyle?: HairStyle; outfit?: OutfitKind; acc?: AccessoryKind; build?: { h: number; w: number } }
export interface Rig {
  root: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; foreL: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; shinL: THREE.Group; shinR: THREE.Group; prop: THREE.Group | null; geos: THREE.BufferGeometry[];
}
export interface PoseParams { phase: number; walk: number; run: number; work: number; look: number; fly: number; sit: number; talk: number; bank: number; t: number; jump?: number }

export const RIG_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });
export const RIG_SCREEN_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true });

type Part = { g: THREE.BufferGeometry; c: string };
const col = new THREE.Color();
/** merge coloured geometries into one vertex-coloured, non-indexed geometry */
function merge(parts: Part[]): THREE.BufferGeometry {
  const gs = parts.map(({ g, c }) => { const n = g.index ? g.toNonIndexed() : g.clone(); col.set(c); const arr = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; } n.setAttribute("color", new THREE.BufferAttribute(arr, 3)); n.deleteAttribute("uv"); return n; });
  const m = mergeGeometries(gs)!; gs.forEach((x) => x.dispose()); return m;
}
const at = <G extends THREE.BufferGeometry>(g: G, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };


/** hair silhouettes (head-local coordinates: skull centre ≈ y 0.14) */
function hairParts(style: HairStyle, c: string): Part[] {
  const cap = (r = 0.135, a = 0.62) => ({ g: at(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * a), 0, 0.155, -0.012, 1, 1, 1, -0.25), c });
  const sp = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): Part => ({ g: at(new THREE.SphereGeometry(r, 8, 6), x, y, z, sx, sy, sz), c });
  switch (style) {
    case "buzz": return [cap(0.128, 0.5)];
    case "slick": return [cap(0.137, 0.6), sp(0.09, 0, 0.2, -0.07, 1.1, 0.7, 1.2)];
    case "bob": return [cap(0.137, 0.66), sp(0.085, -0.115, 0.07, -0.02, 0.8, 1.5, 1), sp(0.085, 0.115, 0.07, -0.02, 0.8, 1.5, 1), sp(0.13, 0, 0.08, -0.08, 1, 1.2, 0.9)];
    case "long": return [cap(0.138, 0.66), { g: at(new THREE.CapsuleGeometry(0.1, 0.34, 4, 8), 0, -0.04, -0.1, 1.1, 1, 0.7), c }, sp(0.07, -0.12, 0.05, 0, 0.7, 2, 1), sp(0.07, 0.12, 0.05, 0, 0.7, 2, 1)];
    case "ponytail": return [cap(), { g: at(new THREE.CapsuleGeometry(0.035, 0.22, 3, 6), 0, 0.06, -0.19, 1, 1, 1, 0.5), c }, sp(0.03, 0, 0.19, -0.145)];
    case "bun": return [cap(), sp(0.075, 0, 0.3, -0.03)];
    case "spiky": { const out: Part[] = [cap(0.132, 0.58)]; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; out.push({ g: at(new THREE.ConeGeometry(0.03, 0.11, 5), Math.cos(a) * 0.075, 0.275, Math.sin(a) * 0.075 - 0.02, 1, 1, 1, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4), c }); } out.push({ g: at(new THREE.ConeGeometry(0.035, 0.13, 5), 0, 0.3, -0.02), c }); return out; }
    case "curly": { const out: Part[] = [cap(0.13, 0.55)]; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; out.push(sp(0.052, Math.cos(a) * 0.1, 0.24 + (i % 2) * 0.03, Math.sin(a) * 0.1 - 0.02)); } out.push(sp(0.06, 0, 0.3, -0.02)); return out; }
    default: return [cap()];
  }
}
interface OutfitBits { top: string; sleeve: string; torso: Part[]; hips: Part[]; neck: Part[] }
/** outfit silhouettes: colours + extra geometry on the torso / hips */
function outfitBits(spec: HumanoidSpec): OutfitBits {
  const o = spec.outfit ?? "tee", ac = spec.accent, top = spec.top, out: OutfitBits = { top, sleeve: top, torso: [], hips: [], neck: [] };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, rz = 0): Part => ({ g: at(new THREE.BoxGeometry(w, h, d), x, y, z, 1, 1, 1, 0, 0, rz), c });
  const cyl = (rt: number, rb: number, h: number, y: number, c: string): Part => ({ g: at(new THREE.CylinderGeometry(rt, rb, h, 14), 0, y, 0), c });
  switch (o) {
    case "blazer": out.torso.push(box(0.1, 0.05, 0.2, -0.2, 0.56, 0, top), box(0.1, 0.05, 0.2, 0.2, 0.56, 0, top), box(0.045, 0.28, 0.02, -0.06, 0.4, 0.145, ac, 0.28), box(0.045, 0.28, 0.02, 0.06, 0.4, 0.145, ac, -0.28)); out.hips.push(cyl(0.2, 0.225, 0.22, -0.11, top)); break;
    case "vest": out.sleeve = "#f1efe6"; out.top = "#f1efe6"; out.torso.push({ g: at(new THREE.CapsuleGeometry(0.2, 0.3, 5, 12), 0, 0.3, 0, 1.12, 1, 0.82), c: top }, box(0.02, 0.3, 0.02, 0, 0.33, 0.165, ac)); break;
    case "coat": out.hips.push(cyl(0.21, 0.29, 0.62, -0.3, top)); out.neck.push({ g: at(new THREE.TorusGeometry(0.115, 0.035, 6, 14), 0, 0.64, 0, 1, 1, 1, Math.PI / 2), c: ac }); break;
    case "hoodie": out.torso.push({ g: at(new THREE.SphereGeometry(0.13, 10, 8), 0, 0.63, -0.1, 1.25, 0.85, 0.9), c: top }, box(0.22, 0.09, 0.02, 0, 0.13, 0.145, ac)); break;
    case "labcoat": out.top = "#f2f4f7"; out.sleeve = "#f2f4f7"; out.hips.push(cyl(0.215, 0.275, 0.64, -0.32, "#f2f4f7")); out.torso.push(box(0.045, 0.3, 0.02, -0.06, 0.4, 0.15, top, 0.25), box(0.045, 0.3, 0.02, 0.06, 0.4, 0.15, top, -0.25), box(0.07, 0.06, 0.02, 0.1, 0.18, 0.15, top)); break;
    case "utility": out.torso.push(box(0.09, 0.08, 0.03, -0.085, 0.42, 0.135, ac), box(0.09, 0.08, 0.03, 0.085, 0.42, 0.135, ac), { g: at(new THREE.TorusGeometry(0.19, 0.022, 6, 16), 0, 0.06, 0, 1.1, 1, 0.78, Math.PI / 2), c: "#3a2f26" }); break;
    case "turtleneck": out.neck.push({ g: at(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 12), 0, 0.68, 0), c: top }); break;
    case "windbreaker": out.hips.push(cyl(0.2, 0.22, 0.14, -0.05, top)); out.torso.push(box(0.016, 0.42, 0.012, 0, 0.32, 0.155, ac), box(0.2, 0.04, 0.012, 0, 0.36, 0.152, ac)); break;
    default: break;
  }
  return out;
}
function accessoryBits(spec: HumanoidSpec) {
  const a = spec.acc ?? "none", ac = spec.accent, torso: Part[] = [], hips: Part[] = [], head: Part[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, rz = 0): Part => ({ g: at(new THREE.BoxGeometry(w, h, d), x, y, z, 1, 1, 1, 0, 0, rz), c });
  if (a === "glasses") head.push({ g: at(new THREE.TorusGeometry(0.036, 0.007, 5, 12), -0.05, 0.15, 0.118), c: "#1b1f2a" }, { g: at(new THREE.TorusGeometry(0.036, 0.007, 5, 12), 0.05, 0.15, 0.118), c: "#1b1f2a" }, box(0.03, 0.008, 0.008, 0, 0.155, 0.12, "#1b1f2a"));
  if (a === "headset") head.push({ g: at(new THREE.TorusGeometry(0.15, 0.012, 5, 14, Math.PI), 0, 0.17, 0), c: "#2a313a" }, box(0.03, 0.06, 0.05, -0.15, 0.13, 0.01, "#2a313a"), box(0.03, 0.06, 0.05, 0.15, 0.13, 0.01, "#2a313a"), box(0.012, 0.012, 0.07, 0.13, 0.08, 0.07, "#2a313a"));
  if (a === "lanyard") torso.push(box(0.012, 0.3, 0.01, -0.07, 0.46, 0.15, ac, 0.3), box(0.012, 0.3, 0.01, 0.07, 0.46, 0.15, ac, -0.3), box(0.07, 0.09, 0.012, 0, 0.27, 0.155, "#f8fafc"), box(0.07, 0.025, 0.014, 0, 0.3, 0.157, ac));
  if (a === "scarf") torso.push({ g: at(new THREE.TorusGeometry(0.115, 0.045, 8, 14), 0, 0.64, 0, 1, 1, 1, Math.PI / 2), c: ac }, box(0.07, 0.26, 0.03, 0.08, 0.47, 0.15, ac, 0.08));
  if (a === "satchel") { hips.push(box(0.2, 0.15, 0.08, 0.27, -0.12, 0.02, "#7c5a3a")); torso.push(box(0.02, 0.62, 0.02, 0, 0.32, 0.15, "#5c4129", -0.6)); }
  if (a === "backpack") torso.push(box(0.28, 0.36, 0.13, 0, 0.32, -0.19, ac), box(0.025, 0.3, 0.02, -0.11, 0.38, 0.14, "#1f2937"), box(0.025, 0.3, 0.02, 0.11, 0.38, 0.14, "#1f2937"));
  return { torso, hips, head };
}

export function buildHumanoid(spec: HumanoidSpec): Rig {
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (parts: Part[], mat: THREE.Material = RIG_MATERIAL) => { const g = merge(parts); geos.push(g); const m = new THREE.Mesh(g, mat); m.castShadow = mat === RIG_MATERIAL; m.userData.shadowCaster = mat === RIG_MATERIAL; return m; };
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips); const bits = outfitBits(spec), accs = accessoryBits(spec); if (spec.build) root.scale.set(spec.build.w, spec.build.h, spec.build.w);
  hips.add(mesh([{ g: at(new THREE.CapsuleGeometry(0.17, 0.08, 4, 10), 0, 0.02, 0, 1.1, 1, 0.8), c: spec.bottom }, ...bits.hips, ...accs.hips]));
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(mesh([{ g: at(new THREE.CapsuleGeometry(0.19, 0.34, 5, 12), 0, 0.3, 0, 1.12, 1, 0.74), c: bits.top }, { g: at(new THREE.TorusGeometry(0.15, 0.04, 6, 14), 0, 0.58, 0, 1.15, 1, 0.9, Math.PI / 2), c: spec.accent }, ...bits.torso, ...bits.neck, ...accs.torso]));
  const head = new THREE.Group(); head.position.y = 0.7; torso.add(head);
  const hp: Part[] = [{ g: at(new THREE.SphereGeometry(0.125, 16, 12), 0, 0.14, 0), c: spec.skin }, { g: at(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.155, -0.012, 1, 1, 1, -0.25), c: spec.hair }, { g: at(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 8), 0, 0.02, 0), c: spec.skin }, { g: at(new THREE.SphereGeometry(0.014, 6, 6), -0.045, 0.15, 0.115), c: "#1b1f2a" }, { g: at(new THREE.SphereGeometry(0.014, 6, 6), 0.045, 0.15, 0.115), c: "#1b1f2a" }];
  hp.splice(1, 1, ...hairParts(spec.hairStyle ?? "short", spec.hair)); hp.push(...accs.head);
  if (spec.hat === "beret") hp.push({ g: at(new THREE.CylinderGeometry(0.16, 0.14, 0.05, 16), 0.03, 0.27, 0, 1, 1, 1, 0, 0, -0.22), c: spec.accent }, { g: at(new THREE.SphereGeometry(0.018, 6, 6), 0.03, 0.31, 0), c: spec.accent });
  if (spec.hat === "cap") hp.push({ g: at(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.19, 0), c: spec.accent }, { g: at(new THREE.BoxGeometry(0.15, 0.015, 0.1), 0, 0.2, 0.15), c: spec.accent });
  if (spec.hat === "visor") hp.push({ g: at(new THREE.BoxGeometry(0.26, 0.012, 0.12), 0, 0.235, 0.09), c: spec.accent }, { g: at(new THREE.TorusGeometry(0.13, 0.012, 5, 14), 0, 0.235, 0, 1, 1, 1, Math.PI / 2), c: spec.accent });
  if (spec.hat === "beanie") hp.push({ g: at(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.2, 0), c: spec.accent }, { g: at(new THREE.SphereGeometry(0.03, 6, 6), 0, 0.335, 0), c: spec.accent });
  if (spec.hat === "bucket") hp.push({ g: at(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 14), 0, 0.27, 0), c: spec.accent }, { g: at(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), 0, 0.215, 0), c: spec.accent });
  if (false as boolean) hp.push({ g: at(new THREE.TorusGeometry(0.15, 0.012, 5, 14, Math.PI), 0, 0.17, 0), c: "#2a313a" }, { g: at(new THREE.BoxGeometry(0.03, 0.06, 0.05), -0.15, 0.13, 0.01), c: "#2a313a" }, { g: at(new THREE.BoxGeometry(0.03, 0.06, 0.05), 0.15, 0.13, 0.01), c: "#2a313a" });
  head.add(mesh(hp));
  const limb = (x: number, y: number, len: number, r: number, c: string, hand: string) => {
    const g = new THREE.Group(); g.position.set(x, y, 0); g.add(mesh([{ g: at(new THREE.CapsuleGeometry(r, len, 3, 8), 0, -len / 2 - r * 0.4, 0), c }]));
    const fore = new THREE.Group(); fore.position.y = -len - r * 0.6; g.add(fore); fore.add(mesh([{ g: at(new THREE.CapsuleGeometry(r * 0.88, len, 3, 8), 0, -len / 2 - r * 0.3, 0), c: hand }])); return { g, fore };
  };
  const aL = limb(-0.255, 0.56, 0.24, 0.05, bits.sleeve, spec.skin), aR = limb(0.255, 0.56, 0.24, 0.05, bits.sleeve, spec.skin); torso.add(aL.g, aR.g);
  const leg = (x: number) => { const g = new THREE.Group(); g.position.set(x, 0, 0); g.add(mesh([{ g: at(new THREE.CapsuleGeometry(0.075, 0.4, 3, 8), 0, -0.23, 0), c: spec.bottom }])); const shin = new THREE.Group(); shin.position.y = -0.48; g.add(shin); shin.add(mesh([{ g: at(new THREE.CapsuleGeometry(0.066, 0.4, 3, 8), 0, -0.22, 0), c: spec.bottom }, { g: at(new THREE.BoxGeometry(0.11, 0.07, 0.25), 0, -0.44, 0.05), c: spec.shoes }])); return { g, shin }; };
  const lL = leg(-0.1), lR = leg(0.1); hips.add(lL.g, lR.g);
  // carried prop (left hand)
  let prop: THREE.Group | null = null; const P = spec.prop;
  if (P !== "none" && P !== "headset") {
    prop = new THREE.Group(); prop.position.set(0, -0.3, 0.02); aL.fore.add(prop);
    const body: Part[] = [], screen: Part[] = [];
    if (P === "tablet" || P === "tablet-grid") { body.push({ g: new THREE.BoxGeometry(0.3, 0.22, 0.018), c: "#1f2937" }); if (P === "tablet") ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#fb7185"].forEach((k, i) => screen.push({ g: at(new THREE.PlaneGeometry(0.075, 0.075), -0.085 + (i % 3) * 0.085, 0.045 - Math.floor(i / 3) * 0.085, 0.0105), c: k })); else for (let i = 0; i < 9; i++) screen.push({ g: at(new THREE.PlaneGeometry(0.06, 0.05), -0.085 + (i % 3) * 0.085, 0.06 - Math.floor(i / 3) * 0.07, 0.0105), c: i % 2 ? "#67e8f9" : "#164e63" }); }
    else if (P === "clipboard" || P === "checklist") { body.push({ g: new THREE.BoxGeometry(0.22, 0.3, 0.015), c: "#7c5a3a" }, { g: at(new THREE.PlaneGeometry(0.19, 0.26), 0, 0, 0.009), c: "#f8fafc" }); if (P === "checklist") for (let i = 0; i < 3; i++) screen.push({ g: at(new THREE.PlaneGeometry(0.04, 0.04), -0.06, 0.07 - i * 0.07, 0.011), c: "#84cc16" }); }
    else if (P === "loupe") { body.push({ g: at(new THREE.TorusGeometry(0.07, 0.012, 6, 14), 0, 0.08, 0), c: "#d4a017" }, { g: at(new THREE.CylinderGeometry(0.01, 0.012, 0.14, 6), 0, -0.04, 0), c: "#8b5a2b" }); }
    else if (P === "notebook") { body.push({ g: new THREE.BoxGeometry(0.2, 0.28, 0.03), c: spec.accent }, { g: at(new THREE.BoxGeometry(0.02, 0.28, 0.034), -0.09, 0, 0), c: "#1f2937" }); }
    else if (P === "chart") { body.push({ g: new THREE.BoxGeometry(0.3, 0.22, 0.015), c: "#fff7ed" }); [0.05, 0.1, 0.075, 0.13].forEach((h, i) => screen.push({ g: at(new THREE.BoxGeometry(0.04, h, 0.006), -0.09 + i * 0.06, -0.09 + h / 2, 0.011), c: "#f97316" })); }
    else if (P === "board") { body.push({ g: new THREE.BoxGeometry(0.38, 0.27, 0.014), c: "#e8e1d0" }); ["#fde047", "#fb7185", "#7dd3fc", "#86efac", "#fdba74", "#c4b5fd"].forEach((k, i) => screen.push({ g: at(new THREE.PlaneGeometry(0.09, 0.075), -0.11 + (i % 3) * 0.11, 0.05 - Math.floor(i / 3) * 0.095, 0.009), c: k })); }
    else if (P === "camera") { body.push({ g: new THREE.BoxGeometry(0.17, 0.1, 0.09), c: "#1f2937" }, { g: at(new THREE.CylinderGeometry(0.04, 0.045, 0.07, 10), 0, 0, 0.075, 1, 1, 1, Math.PI / 2), c: "#0f172a" }, { g: at(new THREE.BoxGeometry(0.06, 0.02, 0.05), -0.04, 0.06, 0), c: spec.accent }); screen.push({ g: at(new THREE.CircleGeometry(0.028, 10), 0, 0, 0.112), c: "#7dd3fc" }); }
    else if (P === "laptop") { body.push({ g: new THREE.BoxGeometry(0.32, 0.014, 0.22), c: "#9ca3af" }, { g: at(new THREE.BoxGeometry(0.32, 0.21, 0.012), 0, 0.105, -0.11, 1, 1, 1, -0.25), c: "#4b5563" }); screen.push({ g: at(new THREE.PlaneGeometry(0.29, 0.18), 0, 0.105, -0.103, 1, 1, 1, -0.25), c: "#38bdf8" }, { g: at(new THREE.PlaneGeometry(0.2, 0.012), -0.03, 0.14, -0.1, 1, 1, 1, -0.25), c: "#e0f2fe" }); }
    else if (P === "scanner") { body.push({ g: new THREE.BoxGeometry(0.11, 0.3, 0.035), c: "#111827" }, { g: at(new THREE.BoxGeometry(0.09, 0.02, 0.04), 0, 0.15, 0), c: spec.accent }); screen.push({ g: at(new THREE.PlaneGeometry(0.08, 0.1), 0, 0.03, 0.019), c: "#fcd34d" }, { g: at(new THREE.PlaneGeometry(0.08, 0.012), 0, -0.07, 0.019), c: "#f87171" }); }
    else if (P === "report") { body.push({ g: new THREE.BoxGeometry(0.25, 0.32, 0.02), c: "#d1d5db" }, { g: at(new THREE.BoxGeometry(0.02, 0.32, 0.024), -0.115, 0, 0), c: spec.accent }); [0.05, 0.1, 0.07, 0.15, 0.12].forEach((h, i) => screen.push({ g: at(new THREE.BoxGeometry(0.03, h, 0.006), -0.075 + i * 0.045, -0.02 + h / 2 - 0.05, 0.013), c: "#16a34a" })); }
    else if (P === "sprout") { body.push({ g: at(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 8), 0, 0, 0), c: "#b45309" }); screen.push({ g: at(new THREE.SphereGeometry(0.05, 6, 6), 0, 0.09, 0), c: "#4ade80" }, { g: at(new THREE.SphereGeometry(0.035, 6, 6), 0.05, 0.12, 0), c: "#22c55e" }); }
    prop.add(mesh(body)); if (screen.length) prop.add(mesh(screen, RIG_SCREEN_MATERIAL));
  }
  return { root, hips, torso, head, armL: aL.g, armR: aR.g, foreL: aL.fore, foreR: aR.fore, legL: lL.g, legR: lR.g, shinL: lL.shin, shinR: lR.shin, prop, geos };
}

/** Procedural animation. Inputs are smoothed weights (see Avatars), so state changes blend instead of popping. */
export function poseHumanoid(r: Rig, p: PoseParams) {
  const { phase: ph, walk, run, work, look, fly, sit, talk, bank, t } = p, sw = Math.sin(ph), amp = walk * (0.62 + run * 0.35) * (1 - sit), idle = Math.max(0, 1 - Math.max(walk, work, fly, sit));
  r.hips.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.035 * walk * (1 + run) + Math.sin(t * 1.6) * 0.004 * idle - 0.04 * work * (1 - sit) - sit * 0.47;
  r.hips.rotation.y = sw * 0.12 * walk;
  const legSwing = sw * amp * 0.85, back = Math.max(0, Math.sin(ph + 0.9)), back2 = Math.max(0, Math.sin(ph + Math.PI + 0.9));
  r.legL.rotation.x = (-legSwing * (1 - fly) + fly * 0.45) * (1 - sit) - sit * 1.5; r.legR.rotation.x = (legSwing * (1 - fly) + fly * 0.65) * (1 - sit) - sit * 1.5;
  r.shinL.rotation.x = (back * 0.95 * walk * (1 - fly) + fly * 0.3) * (1 - sit) + sit * 1.45; r.shinR.rotation.x = (back2 * 0.95 * walk * (1 - fly) + fly * 0.4) * (1 - sit) + sit * 1.45;
  r.legL.rotation.z = -sit * 0.05; r.legR.rotation.z = sit * 0.05;
  r.torso.rotation.x = 0.04 + run * 0.14 + fly * 0.75 + work * 0.12 + sit * 0.05 + Math.sin(t * 1.6) * 0.012 * idle; r.torso.rotation.z = bank * 0.6; r.torso.rotation.y = -sw * 0.1 * walk + Math.sin(t * 1.9) * 0.18 * talk;
  r.root.rotation.x = fly * 0.62; r.root.position.y = fly * 0.45; r.root.position.z = fly * 0.12;
  const armSwing = -sw * amp * 0.75, gest = Math.sin(t * 3.1) * 0.35 * talk, wk = work;
  r.armL.rotation.x = armSwing * (1 - wk) * (1 - fly) + wk * -0.95 + fly * 0.9 + Math.sin(t * 1.1) * 0.03 * idle - talk * 0.7 + gest * 0.3; r.armR.rotation.x = -armSwing * (1 - wk) * (1 - fly) + wk * (-1.15 + Math.sin(t * 7.0) * 0.06) + fly * 0.9 + Math.sin(t * 1.1 + 1.2) * 0.03 * idle - talk * 0.9 + gest;
  r.armL.rotation.z = -0.07 - fly * 0.35; r.armR.rotation.z = 0.07 + fly * 0.35 + talk * 0.1;
  r.foreL.rotation.x = -0.25 - amp * 0.4 * Math.max(0, -armSwing) - wk * 0.85 - fly * 0.25 - talk * 0.5; r.foreR.rotation.x = -0.25 - amp * 0.4 * Math.max(0, armSwing) - wk * (0.85 + Math.sin(t * 9) * 0.1) - fly * 0.25 - talk * 0.6 - gest * 0.4;
  if (r.prop) { r.prop.rotation.x = -0.2 - wk * 0.9; r.prop.rotation.z = 0.15; r.prop.position.set(0.02, -0.3 + wk * 0.12, 0.05 + wk * 0.06); }
  r.head.rotation.y = Math.sin(t * 0.55) * 0.12 * idle + Math.sin(t * 2.3) * look * 0.7 - sw * 0.04 * walk + Math.sin(t * 1.4) * 0.15 * talk;
  r.head.rotation.x = wk * 0.4 - fly * 0.5 + Math.sin(t * 0.8) * 0.03 * idle + Math.sin(t * 2.2) * 0.06 * talk;
  r.head.rotation.z = bank * -0.2;
  const jp = p.jump ?? 0; if (jp > 0.01) { r.armL.rotation.x -= jp * 1.5; r.armR.rotation.x -= jp * 1.5; r.legL.rotation.x -= jp * 0.7; r.legR.rotation.x += jp * 0.25; r.shinL.rotation.x += jp * 1.0; r.shinR.rotation.x += jp * 0.6; r.torso.rotation.x -= jp * 0.12; }
}
export function disposeRig(r: Rig) { r.geos.forEach((g) => g.dispose()); }
