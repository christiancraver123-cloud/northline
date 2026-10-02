// The whole town as DATA (pure). One Kit records every building/prop; `buildTown()` returns the plan the renderer, collision, navigation and tests all share.
import { Kit, type Landmark } from "./kit";
import { buildHQ, HQ } from "./hq";
import { bench, chair, desk, lounger, plant, table, umbrella } from "./furniture";
import { BOARDWALK, GROUND, ROAD, shoreZ } from "./terrain";

export interface TownPlan { kit: Kit; paved: { minX: number; maxX: number; minZ: number; maxZ: number }[]; boatSlots: { x: number; z: number; yaw: number; len: number; color: string }[]; districts: { id: string; name: string; x: number; z: number }[]; creatorHouses: { creator: string; name: string; style: string; x: number; z: number }[] }

interface StudioOpts { id: string; name: string; district: string; x0: number; x1: number; z0: number; z1: number; floors?: 1 | 2; wall: string; trim: string; roof: string; accent: string; style?: "flat" | "gable"; sign: string; sub?: string; deskDx?: number; deskId?: string; terraceId?: string; pad?: number; deck?: string; glow?: string }

/** A small modern building with a glazed front, entrance, sign and an OPEN-AIR workspace (pergola + desk) on its terrace where its agent works in plain view. */
function studio(k: Kit, o: StudioOpts) {
  const { x0, x1, z0, z1 } = o, cx = (x0 + x1) / 2, G = o.pad ?? GROUND, H = (o.floors ?? 1) * 3.6 + 0.3, top = G + H;
  k.pad(x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 7, G, 2.5);
  k.box(x0, x1, G, top, z0, z1, o.wall, { tag: o.id });
  if ((o.floors ?? 1) === 2) k.box(x0 - 0.35, x1 + 0.35, G + 3.6, top, z0 - 0.35, z1 + 0.9, o.trim, { solid: false });
  if (o.style === "gable") k.gable(x0 - 0.7, x1 + 0.7, z0 - 0.7, z1 + 1.0, top, 2.6, o.roof, "x"); else { k.box(x0 - 0.5, x1 + 0.5, top, top + 0.35, z0 - 0.5, z1 + 1.0, o.roof, { solid: false }); k.box(x0 - 0.5, x1 + 0.5, top + 0.35, top + 0.75, z0 - 0.5, z0 - 0.3, o.roof, { solid: false }); }
  for (let f = 0; f < (o.floors ?? 1); f++) {
    const y0 = G + f * 3.6 + 0.7;
    k.box(x0 + 1.2, x1 - 1.2, y0, y0 + 2.2, z1, z1 + 0.05, o.glow ?? "#ffd9a8", { mat: "glow", solid: false });
    k.box(x0 + 1.2, x1 - 1.2, y0, y0 + 2.2, z1 + 0.05, z1 + 0.11, "#9fd0e0", { mat: "glass", solid: false });
    for (let x = x0 + 1.2; x <= x1 - 1.1; x += (x1 - x0 - 2.4) / 4) k.box(x - 0.04, x + 0.04, y0, y0 + 2.25, z1 + 0.05, z1 + 0.14, o.trim, { solid: false });
    for (const sx of [x0, x1]) k.box(sx - 0.02, sx + 0.02, y0 + 0.1, y0 + 1.9, z0 + 2, z1 - 2, "#9fd0e0", { mat: "glass", solid: false });
  }
  k.box(cx - 1.3, cx + 1.3, G, G + 2.7, z1, z1 + 0.14, "#232a31", { solid: false }); k.box(cx - 1.45, cx + 1.45, G + 2.7, G + 2.85, z1, z1 + 0.2, o.accent, { solid: false });
  k.sign({ text: o.sign, sub: o.sub, x: cx, y: G + 3.4, z: z1 + 0.15, w: Math.min(4.6, x1 - x0 - 2), h: 0.85, rotY: 0, style: "dark" });
  // terrace + pergola workspace
  const dx = cx + (o.deskDx ?? 0), tz = z1 + 2.5;
  k.box(x0 + 1, x1 - 1, G, G + 0.03, z1, z1 + 5.2, o.deck ?? "#cdb48d", { solid: false });
  for (const [px, pz] of [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.6], [2.2, 1.6]]) k.cyl(dx + px, tz + pz, G, G + 3.0, 0.1, "#2a313a", { solid: true });
  for (let i = 0; i < 9; i++) k.box(dx - 2.4 + i * 0.6, dx - 2.4 + i * 0.6 + 0.14, G + 3.0, G + 3.12, tz - 1.5, tz + 2.0, "#a9763f", { solid: false });
  desk(k, dx, tz, G + 0.03, 0, { w: 1.8, d: 0.9, wood: "#b9895a", screens: 2 }); chair(k, dx, tz + 1.0, G + 0.03, Math.PI, "#3f4a58");
  plant(k, x0 + 0.8, z1 + 1.4, G + 0.03, 1.2); plant(k, x1 - 0.8, z1 + 1.4, G + 0.03, 1.2);
  k.spot(o.deskId ?? `${o.id}-desk`, dx, tz + 1.0, Math.PI, "work-sit", `at the ${o.name} workspace`, { y: G + 0.03 });
  k.spot(o.terraceId ?? `${o.id}-terrace`, dx + 3.4, tz + 1.6, 0.5, "stand", `on the ${o.name} terrace`, { y: G + 0.03, weight: 1.2 });
  k.zone({ id: `${o.id}-terrace`, name: `${o.name} terrace`, building: o.id, district: o.district, minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 6, y0: -1, y1: 6, indoor: false });
  k.landmark({ id: o.id, name: o.name, district: o.district, x: cx, z: z1 + 3, y: G, radius: 8 });
}

export function buildTown(): TownPlan {
  const k = new Kit(), paved: TownPlan["paved"] = [], boatSlots: TownPlan["boatSlots"] = [];
  buildHQ(k);
  paved.push({ minX: -44, maxX: 8, minZ: -20, maxZ: ROAD.z0 }, { minX: -62, maxX: -42, minZ: -17, maxZ: ROAD.z0 });
  k.pad(-44, 8, -20, ROAD.z0, GROUND, 1.5);
  k.landmark({ id: "hq", name: "Northline HQ", district: "Northline HQ District", x: -18, z: -14, y: GROUND, radius: 14 });

  // ===== CREATIVE ROW (west) =====
  studio(k, { id: "prompt-studio", name: "Prompt Studio", district: "Creative Row", x0: -96, x1: -82, z0: -30, z1: -17, wall: "#e4ebee", trim: "#2f6f86", roof: "#cfd8dc", accent: "#06b6d4", sign: "PROMPT STUDIO", sub: "Creative Row", deskDx: -1, glow: "#bfeaff" });
  studio(k, { id: "creative-studio", name: "Creative Studio", district: "Creative Row", x0: -78, x1: -62, z0: -32, z1: -17, floors: 2, wall: "#f0e4d6", trim: "#7a4f9a", roof: "#d8cdbf", accent: "#8b5cf6", sign: "CREATIVE STUDIO", sub: "Creative Row", deskDx: 1, glow: "#ffd1f2" });
  studio(k, { id: "copy-cafe", name: "Copy Café", district: "Creative Row", x0: -58, x1: -46, z0: -27, z1: -17, wall: "#f3dcc6", trim: "#a8502e", roof: "#8f4a2c", accent: "#ec4899", style: "gable", sign: "COPY CAFÉ", sub: "coffee · captions", deskDx: 0, deskId: "cafe-table-a", terraceId: "cafe-terrace" });
  // café outdoor seating (cafe-table-a replaces the studio desk; b is a second table with umbrellas)
  table(k, -54.6, -13.2, GROUND + 0.03, 1.0, 1.0, 0, { top: "#e8d7c0" }); chair(k, -54.6, -12.2, GROUND + 0.03, Math.PI, "#a8502e"); chair(k, -55.6, -13.2, GROUND + 0.03, Math.PI / 2, "#a8502e"); umbrella(k, -54.6, -13.2, GROUND + 0.03, "#fbbf24");
  k.spot("cafe-table-b", -54.6, -12.2, Math.PI, "sit", "at a café table", { y: GROUND + 0.03 });

  // ===== STRATEGY HOUSE, PRODUCTION DISTRICT (east of HQ) =====
  studio(k, { id: "strategy-house", name: "Strategy House", district: "HQ District", x0: 14, x1: 28, z0: -30, z1: -17, floors: 2, wall: "#e9efe9", trim: "#14756b", roof: "#d4ddd6", accent: "#14b8a6", sign: "STRATEGY HOUSE", sub: "concepts & content mix", deskDx: 0, glow: "#d6fff0" });
  studio(k, { id: "production-office", name: "Production Office", district: "Production District", x0: 36, x1: 52, z0: -31, z1: -17, floors: 2, wall: "#e8e6df", trim: "#1f7a5a", roof: "#cfcfc8", accent: "#10b981", sign: "PRODUCTION OFFICE", sub: "assets · approvals", deskDx: 1, glow: "#ffe9c4" });
  studio(k, { id: "identity-lab", name: "Identity Lab", district: "Production District", x0: 56, x1: 68, z0: -29, z1: -17, wall: "#f1efe4", trim: "#a86b00", roof: "#d9d3c0", accent: "#f59e0b", sign: "IDENTITY LAB", sub: "identity-critical checks", deskDx: 0, glow: "#fff0c2" });
  studio(k, { id: "qa-studio", name: "QA Studio", district: "Production District", x0: 72, x1: 84, z0: -29, z1: -17, wall: "#eaf0e2", trim: "#4d7c0f", roof: "#d3dcc4", accent: "#84cc16", sign: "QA STUDIO", sub: "quality & duplication", deskDx: 0, glow: "#e8ffd0" });
  studio(k, { id: "growth-lab", name: "Growth Lab", district: "Wellness & Growth", x0: 14, x1: 26, z0: 0, z1: 9, wall: "#fbe7e2", trim: "#b4352e", roof: "#e8cfc9", accent: "#ef4444", sign: "GROWTH LAB", sub: "recommendations", deskDx: 0, glow: "#ffdcd4" });

  // ===== CREATOR RESIDENCES (fictional world representations; no creator avatars, nothing derived from canonical references) =====
  const houses: TownPlan["creatorHouses"] = [];
  // Sienna — Miami-style social beach house: pastel stepped volumes, striped awning, pool, roof deck, on the sand
  { const x0 = -58, x1 = -42, z0 = 24, z1 = 36, G = 0.45; k.pad(x0 - 3, x1 + 3, z0 - 3, z1 + 12, G, 3);
    k.box(x0, x1, G, G + 3.5, z0, z1, "#f7c9d0", { tag: "sienna" }); k.box(x0 + 2, x1 - 3, G + 3.5, G + 6.7, z0 + 1, z1 - 1, "#bfe9e4", { tag: "sienna-up" }); k.box(x0 - 0.5, x1 + 0.5, G + 3.5, G + 3.8, z0 - 0.5, z1 + 1.4, "#ffffff", { solid: false }); k.box(x0 + 1.5, x1 - 2.5, G + 6.7, G + 7.0, z0 + 0.5, z1 - 0.5, "#ffffff", { solid: false });
    for (let i = 0; i < 12; i++) k.box(x0 + i * ((x1 - x0) / 12), x0 + (i + 1) * ((x1 - x0) / 12), G + 3.0, G + 3.5, z1, z1 + 2.4, i % 2 ? "#ffffff" : "#ff7aa8", { solid: false });
    k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.8, z1, z1 + 0.05, "#ffd9a8", { mat: "glow", solid: false }); k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.8, z1 + 0.05, z1 + 0.11, "#9fd0e0", { mat: "glass", solid: false });
    k.box(-51, -49, G, G + 2.6, z1, z1 + 0.14, "#2a8f94", { solid: false }); k.sign({ text: "SIENNA'S", sub: "beach house", x: -50, y: G + 3.1, z: z1 + 0.16, w: 3.4, h: 0.8, rotY: 0, style: "light" });
    k.box(x0 + 3, x0 + 10, G, G + 0.1, z1 + 3, z1 + 8.4, "#e9dfc8", { solid: false }); k.box(x0 + 3.4, x0 + 9.6, G + 0.05, G + 0.12, z1 + 3.4, z1 + 8.0, "#4fd1d9", { mat: "water", solid: false }); k.box(x0 + 3, x0 + 10, G, G + 0.9, z1 + 3, z1 + 8.4, "#4fd1d9", { solid: true, mat: "glass", tag: "pool-barrier" });
    for (let i = 0; i < 3; i++) lounger(k, x0 + 11.5, z1 + 3.8 + i * 1.5, G, Math.PI / 2, "#ffffff"); umbrella(k, x0 + 13.5, z1 + 5, G, "#ff7aa8"); plant(k, x0 + 0.8, z1 + 1, G, 1.3); plant(k, x1 - 0.8, z1 + 1, G, 1.3);
    k.zone({ id: "sienna-terrace", name: "Sienna's beach house — pool deck", building: "sienna", district: "Creator Beach", minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 9, y0: -1, y1: 6, indoor: false }); houses.push({ creator: "SIE", name: "Sienna's social beach house", style: "Miami pastel, pool deck", x: -50, z: z1 + 3 });
    k.spot("sienna-deck", x0 + 11, z1 + 7.2, 0.4, "stand", "on Sienna's pool deck", { y: G, weight: 0.4 }); k.landmark({ id: "sienna", name: "Sienna's beach house", district: "Creator Beach", x: -50, z: z1 + 4, y: G, radius: 9 }); }
  // Skye — surf bungalow, closest to the water: weathered timber, tin gable roof, board rack, outdoor shower
  { const x0 = 24, x1 = 34, z0 = 33, z1 = 40, G = 0.2; k.pad(x0 - 3, x1 + 3, z0 - 3, z1 + 5, G, 3);
    k.box(x0, x1, G, G + 3.0, z0, z1, "#8fa59a", { tag: "skye" }); k.gable(x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 0.9, G + 3.0, 1.9, "#9aa5ac", "x");
    k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.3, z1, z1 + 0.05, "#ffd9a8", { mat: "glow", solid: false }); k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.3, z1 + 0.05, z1 + 0.11, "#9fd0e0", { mat: "glass", solid: false }); k.box(28, 30, G, G + 2.4, z1, z1 + 0.14, "#d9a441", { solid: false });
    k.box(x0 - 0.5, x1 + 0.5, G, G + 0.25, z1, z1 + 3.2, "#b69b7a", { solid: false }); k.sign({ text: "SKYE", sub: "surf shack", x: 29, y: G + 2.9, z: z1 + 0.16, w: 2.6, h: 0.7, rotY: 0, style: "wood" });
    for (let i = 0; i < 4; i++) { k.box(x1 + 1.4 + i * 0.55, x1 + 1.4 + i * 0.55 + 0.1, G, G + 2.0, z1 - 1.5, z1 - 1.4, ["#f2c14e", "#4fb3bf", "#e8533f", "#ffffff"][i], { solid: false }); }
    k.box(x1 + 1.2, x1 + 3.8, G, G + 0.1, z1 - 1.7, z1 - 1.2, "#7d5f43", { solid: true }); k.zone({ id: "skye-terrace", name: "Skye's surf bungalow", building: "skye", district: "Creator Beach", minX: x0, maxX: x1 + 4, minZ: z1, maxZ: z1 + 5, y0: -1, y1: 6, indoor: false }); houses.push({ creator: "SKY", name: "Skye's surf bungalow", style: "weathered timber, board rack", x: 29, z: z1 + 2 });
    k.landmark({ id: "skye", name: "Skye's surf bungalow", district: "Creator Beach", x: 29, z: z1 + 3, y: G, radius: 8 }); }
  // Zoe — bright wellness bungalow beside the wellness area
  { const x0 = -48, x1 = -37, z0 = 2, z1 = 11;
    studio(k, { id: "zoe", name: "Zoe's bungalow", district: "Wellness & Growth", x0, x1, z0, z1, wall: "#fff6d8", trim: "#e9b949", roof: "#f4e2a8", accent: "#34d399", style: "gable", sign: "ZOE", sub: "wellness bungalow", deskId: "zoe-deck-unused", terraceId: "zoe-terrace", glow: "#fffbe0" });
    houses.push({ creator: "ZOE", name: "Zoe's wellness bungalow", style: "bright bungalow, yoga deck", x: -42.5, z: z1 + 2 }); }
  // Mila — relaxed social house near the centre: warm cladding, big porch, bright door
  { const x0 = 12, x1 = 27, z0 = -48, z1 = -36, G = GROUND; k.pad(x0 - 3, x1 + 3, z0 - 3, z1 + 6, G, 3);
    k.box(x0, x1, G, G + 3.4, z0, z1, "#d7b48a", { tag: "mila" }); k.box(x0 + 1, x1 - 4, G + 3.4, G + 6.4, z0 + 1, z1 - 1, "#e9d6bd", { tag: "mila-up" }); k.gable(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 2.2, G + 3.4, 1.4, "#8a5a3a", "x"); k.gable(x0 + 0.5, x1 - 3.5, z0 + 0.5, z1 - 0.5, G + 6.4, 1.8, "#8a5a3a", "x");
    k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.8, z1, z1 + 0.05, "#ffd9a8", { mat: "glow", solid: false }); k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.8, z1 + 0.05, z1 + 0.11, "#9fd0e0", { mat: "glass", solid: false }); k.box(x0 + 5, x0 + 7, G, G + 2.5, z1, z1 + 0.14, "#ff6b5a", { solid: false });
    k.box(x0 - 0.5, x1 + 0.5, G, G + 0.25, z1, z1 + 3.4, "#c9a77c", { solid: false }); for (const px of [x0 + 0.4, x1 - 0.4]) k.cyl(px, z1 + 3.0, G, G + 3.0, 0.14, "#f4efe6", { solid: true }); bench(k, x0 + 3, z1 + 2.6, G + 0.25, 0); bench(k, x1 - 3, z1 + 2.6, G + 0.25, 0);
    k.sign({ text: "MILA", sub: "", x: x0 + 6, y: G + 3.2, z: z1 + 0.16, w: 2.2, h: 0.7, rotY: 0, style: "wood" }); k.zone({ id: "mila-terrace", name: "Mila's house — porch", building: "mila", district: "Residential Hills", minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 4, y0: -1, y1: 6, indoor: false }); houses.push({ creator: "MIL", name: "Mila's relaxed house", style: "warm cladding, big porch", x: 20, z: z1 + 2 }); k.landmark({ id: "mila", name: "Mila's house", district: "Residential Hills", x: 20, z: z1 + 3, y: G, radius: 9 }); }
  // Alessia — minimal architectural villa on the hillside (boutique-hotel feeling)
  { const x0 = 44, x1 = 62, z0 = -62, z1 = -50, G = 7.0; k.pad(x0 - 5, x1 + 5, z0 - 5, z1 + 9, G, 7);
    k.box(x0, x1, G, G + 3.2, z0, z1, "#f2f0ea", { tag: "alessia" }); k.box(x0 + 3, x1 + 2, G + 3.2, G + 3.6, z0 + 1, z1 + 2.5, "#e5e2da", { solid: false }); k.box(x0 + 3, x1 - 3, G + 3.6, G + 6.4, z0 + 2, z1 - 1, "#f8f6f0", { tag: "alessia-up" }); k.box(x0 + 2, x1 - 2, G + 6.4, G + 6.7, z0 + 1, z1, "#d8d4ca", { solid: false });
    k.box(x0 + 1, x1 - 1, G + 0.5, G + 2.9, z1, z1 + 0.05, "#ffe6c0", { mat: "glow", solid: false }); k.box(x0 + 1, x1 - 1, G + 0.5, G + 2.9, z1 + 0.05, z1 + 0.11, "#a9d6e6", { mat: "glass", solid: false });
    k.box(x0 - 1, x1 + 1, G, G + 0.05, z1, z1 + 6, "#e9e5db", { solid: false }); k.box(x0 + 2, x1 - 2, G + 0.02, G + 0.1, z1 + 1.6, z1 + 4.6, "#6cc9d4", { mat: "water", solid: false }); k.box(x0 + 2, x1 - 2, G, G + 0.9, z1 + 1.6, z1 + 4.6, "#6cc9d4", { solid: true, mat: "glass", tag: "pool-barrier" });
    k.sign({ text: "VILLA ALESSIA", sub: "", x: 53, y: G + 3.0, z: z1 + 0.16, w: 4.4, h: 0.7, rotY: 0, style: "light" }); houses.push({ creator: "ALE", name: "Alessia's villa", style: "minimal architectural villa", x: 53, z: z1 + 4 });
    k.zone({ id: "alessia-terrace", name: "Alessia's villa terrace", building: "alessia", district: "Residential Hills", minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 7, y0: G - 1, y1: G + 6, indoor: false }); k.landmark({ id: "alessia", name: "Alessia's villa", district: "Residential Hills", x: 53, z: z1 + 5, y: G, radius: 9 }); }
  // Vesper — darker modern coastal house in the quiet east
  { const x0 = 78, x1 = 94, z0 = -60, z1 = -48, G = 5.5; k.pad(x0 - 5, x1 + 5, z0 - 5, z1 + 8, G, 7);
    k.box(x0, x1, G, G + 3.4, z0, z1, "#2c3138", { tag: "vesper" }); k.box(x0 + 2, x1 - 5, G + 3.4, G + 6.2, z0 + 1, z1 - 1, "#23272d", { tag: "vesper-up" }); k.gable(x0 - 0.4, x1 + 0.4, z0 - 0.4, z1 + 1.2, G + 3.4, 1.4, "#15181c", "x");
    k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.9, z1, z1 + 0.05, "#ffb45a", { mat: "glow", solid: false }); k.box(x0 + 1, x1 - 1, G + 0.6, G + 2.9, z1 + 0.05, z1 + 0.11, "#6f93a3", { mat: "glass", solid: false }); k.box(x0 + 6, x0 + 8, G, G + 2.6, z1, z1 + 0.14, "#7a5230", { solid: false });
    for (let x = x0 + 1; x < x1 - 1; x += 1.2) k.box(x, x + 0.14, G + 0.3, G + 3.2, z1 + 0.15, z1 + 0.35, "#4a3524", { solid: false });
    k.box(x0 - 1, x1 + 1, G, G + 0.05, z1, z1 + 5, "#454a52", { solid: false }); k.sign({ text: "VESPER", sub: "", x: x0 + 7, y: G + 3.0, z: z1 + 0.16, w: 2.2, h: 0.6, rotY: 0, style: "dark" }); houses.push({ creator: "VES", name: "Vesper's coastal house", style: "dark modern, quiet hillside", x: 86, z: z1 + 3 });
    k.zone({ id: "vesper-terrace", name: "Vesper's house — terrace", building: "vesper", district: "Residential Hills", minX: x0, maxX: x1, minZ: z1, maxZ: z1 + 6, y0: G - 1, y1: G + 6, indoor: false }); k.landmark({ id: "vesper", name: "Vesper's house", district: "Residential Hills", x: 86, z: z1 + 4, y: G, radius: 9 }); }

  // ===== WELLNESS AREA (pool + Pilates pavilion) =====
  { const G = 0.6, px0 = -30, px1 = -14, pz0 = 3, pz1 = 11; k.pad(px0 - 3, px1 + 3, pz0 - 2, pz1 + 3, G, 2);
    k.box(px0 - 0.5, px1 + 0.5, G, G + 0.12, pz0 - 0.5, pz1 + 0.5, "#efe9db", { solid: false }); k.box(px0, px1, G + 0.08, G + 0.14, pz0, pz1, "#47c6d4", { mat: "water", solid: false }); k.box(px0 - 0.2, px1 + 0.2, G, G + 0.9, pz0 - 0.2, pz1 + 0.2, "#47c6d4", { solid: true, mat: "glass", tag: "pool-barrier" });
    for (let i = 0; i < 4; i++) lounger(k, px0 + 2 + i * 3.4, pz1 + 1.8, G, 0, i % 2 ? "#ffffff" : "#e9f5f3"); umbrella(k, px0 + 3.7, pz1 + 2.5, G, "#34d399"); umbrella(k, px0 + 10.5, pz1 + 2.5, G, "#fbbf24");
    k.spot("pool-lounger-a", px0 + 2, pz1 + 1.8, 0, "sit", "lounging by the pool", { y: G + 0.2, weight: 1.2 });
    k.landmark({ id: "pool", name: "Wellness pool", district: "Wellness & Growth", x: -22, z: 7, y: G, radius: 9 });
    const wx0 = -8, wx1 = 6, wz0 = 2, wz1 = 11; k.pad(wx0 - 2, wx1 + 2, wz0 - 2, wz1 + 2, G, 2);
    k.box(wx0, wx1, G, G + 0.25, wz0, wz1, "#c9a77c", { solid: false }); for (const [x, z] of [[wx0, wz0], [wx1, wz0], [wx0, wz1], [wx1, wz1]]) k.cyl(x, z, G, G + 3.6, 0.1, "#f2efe8", { solid: true });
    k.box(wx0 - 0.4, wx1 + 0.4, G + 3.6, G + 3.9, wz0 - 0.4, wz1 + 0.4, "#f2efe8", { solid: false }); for (const wz of [wz0, wz1]) k.box(wx0, wx1, G + 0.3, G + 3.6, wz - 0.02, wz + 0.02, "#bfe6f2", { mat: "glass", solid: wz === wz0 });
    for (let i = 0; i < 4; i++) k.box(wx0 + 2 + i * 3, wx0 + 3.2 + i * 3, G + 0.25, G + 0.3, wz0 + 3, wz0 + 6, ["#c8b6ff", "#a8e6cf", "#ffd3b6", "#ffaaa5"][i], { solid: false });
    k.sign({ text: "PILATES PAVILION", sub: "wellness", x: -1, y: G + 3.2, z: wz1 + 0.05, w: 4.4, h: 0.7, rotY: 0, style: "teal" }); k.landmark({ id: "pilates", name: "Pilates pavilion", district: "Wellness & Growth", x: -1, z: 7, y: G, radius: 9 }); }
  // fountain plaza + benches
  k.cyl(-6, -12.8, GROUND, GROUND + 0.55, 1.6, "#d9d2c3", { solid: true }); k.cyl(-6, -12.8, GROUND + 0.5, GROUND + 0.58, 1.35, "#6cc9d4", { mat: "water" }); k.cyl(-6, -12.8, GROUND + 0.55, GROUND + 1.5, 0.18, "#d9d2c3"); k.cyl(-6, -12.8, GROUND + 1.5, GROUND + 1.56, 0.6, "#6cc9d4", { mat: "water" });
  k.spot("plaza-fountain", -6, -10.6, Math.PI, "stand", "by the fountain", { y: GROUND, weight: 1.3 });
  for (const [x, z, id] of [[-2, 14, "promenade-bench-a"], [8, 14, "promenade-bench-b"]] as const) { bench(k, x, z, GROUND, Math.PI); k.spot(id, x, z + 0.1, Math.PI, "sit", "on a promenade bench", { y: GROUND + 0.05, weight: 1.2 }); }
  for (const [x, id, w] of [[-70, "boardwalk-rail-west", 1.4], [-12, "boardwalk-rail-mid", 1.6], [34, "boardwalk-rail-east", 1.2]] as const) k.spot(id, x, BOARDWALK.z1 - 0.9, 0, "stand", "looking out at the ocean", { y: BOARDWALK.h, weight: w });
  k.spot("beach-edge", 4, shoreZ(4) - 4, 0, "stand", "standing by the water", { y: 0.05, weight: 1.2 });

  // ===== BOARDWALK rail (gaps at beach access points) =====
  { const gaps = [-90, -78, -66, -54, -42, -30, -18, -6, 6, 18, 30, 42, 54, 66, 78, 90]; let a = -100; const rz = BOARDWALK.z1 - 0.12;
    for (const g of [...gaps, 102]) { const b = g === 102 ? 100 : g - 1.7; if (b - a > 1.5) { k.box(a, b, BOARDWALK.h + 0.95, BOARDWALK.h + 1.03, rz - 0.05, rz + 0.05, "#a9763f", { solid: false }); for (let x = a; x <= b + 0.01; x += 3) k.box(x - 0.045, x + 0.045, BOARDWALK.h, BOARDWALK.h + 1.0, rz - 0.045, rz + 0.045, "#8a6a47", { solid: false }); } a = g + 1.7; } }

  // ===== ANALYTICS PIER =====
  { const px = -66, D = 0.95; const deckColor = "#b9895a";
    k.floor(px - 2, px + 2, BOARDWALK.z1, 64, D, 0.3, deckColor, { id: "pier", kind: "deck", group: "pier" }); k.floor(px - 8, px + 8, 62, 72, D, 0.3, deckColor, { id: "pier-end", kind: "deck", group: "pier" });
    k.ramp("pier-ramp", px - 2, px + 2, BOARDWALK.z1 - 1.2, BOARDWALK.z1, "z", BOARDWALK.h, D, "deck");
    const rail = (axis: "x" | "z", c: number, a0: number, a1: number) => { if (axis === "z") { k.box(c - 0.05, c + 0.05, D + 0.95, D + 1.05, a0, a1, "#2a313a", { solid: true, tag: "pier-rail" }); } else { k.box(a0, a1, D + 0.95, D + 1.05, c - 0.05, c + 0.05, "#2a313a", { solid: true, tag: "pier-rail" }); } k.box(axis === "z" ? c - 0.07 : a0, axis === "z" ? c + 0.07 : a1, D, D + 1.0, axis === "z" ? a0 : c - 0.02, axis === "z" ? a1 : c + 0.02, "#bfe6f2", { mat: "glass", solid: true, tag: "pier-rail" }); };
    rail("z", px - 2, BOARDWALK.z1 + 1, 62); rail("z", px + 2, BOARDWALK.z1 + 1, 62); rail("z", px - 8, 62, 72); rail("z", px + 8, 62, 72); rail("x", 72, px - 8, px + 8); rail("x", 62, px - 8, px - 2); rail("x", 62, px + 2, px + 8);
    for (let z = 24; z <= 60; z += 12) k.cyl(px - 1.7, z, D, D + 3.4, 0.05, "#2a313a"), k.sphere(px - 1.7, D + 3.5, z, 0.16, "#fff0cc", { mat: "glow" });
    for (let z = 22; z < 70; z += 5) for (const sx of [-1.8, 1.8]) k.cyl(px + sx, z, -4, D - 0.3, 0.14, "#6a4b30");
    desk(k, px, 68, D, 0, { w: 2.0, d: 0.9, screens: 3, wood: "#b9895a" }); chair(k, px, 69.1, D, Math.PI, "#3f4a58"); k.spot("pier-desk", px, 69.1, Math.PI, "work-sit", "at the Analytics Pier desk", { y: D });
    k.spot("pier-rail", px + 5, 70.4, 0, "stand", "looking out from the pier", { y: D, weight: 1.2 });
    for (const dx of [-6.5, 6.5]) { bench(k, px + dx, 64.2, D, Math.PI); } k.box(px - 6, px + 6, D, D + 0.01, 62.3, 71.7, "#c9a77c", { solid: false });
    k.sign({ text: "ANALYTICS PIER", sub: "performance", x: px, y: D + 2.7, z: 62.4, w: 5, h: 0.8, rotY: Math.PI, style: "teal" });
    for (const z of [21, 26, 31, 36, 41, 46, 51, 56, 60]) k.node(`pier-n${z}`, px, z); for (const [i, x, z] of [[0, px - 4, 66], [1, px + 4, 66], [2, px, 66], [3, px + 4, 70.6], [4, px - 4, 70.6]] as const) k.node(`pier-e${i}`, x, z);
    k.zone({ id: "pier", name: "Analytics Pier", building: "pier", district: "Analytics Pier", minX: px - 8, maxX: px + 8, minZ: BOARDWALK.z1, maxZ: 72, y0: -2, y1: 8, indoor: false }); k.landmark({ id: "pier", name: "Analytics Pier", district: "Analytics Pier", x: px, z: 66, y: D, radius: 12 }); }

  // ===== MARINA =====
  { const D = 0.9; k.floor(50, 56, 40, 52, D, 0.3, "#b9895a", { id: "marina-access", kind: "deck", group: "marina" }); k.ramp("marina-ramp", 50, 56, 36, 40, "z", 0.05, D, "deck"); k.floor(50, 100, 52, 55, D, 0.3, "#b9895a", { id: "marina-spine", kind: "deck", group: "marina" });
    for (const fx of [60, 70, 80, 90]) { k.floor(fx - 1, fx + 1, 55, 66, D, 0.3, "#b9895a", { id: `marina-finger-${fx}`, kind: "deck", group: "marina" }); boatSlots.push({ x: fx - 3.2, z: 60.5, yaw: 0, len: 7.5, color: "#f3efe6" }, { x: fx + 3.2, z: 60.5, yaw: 0, len: 6.5, color: fx % 20 ? "#2a6f97" : "#f2c14e" }); }
    for (const [axis, c, a0, a1] of [["x", 52, 56, 100], ["x", 55, 50, 100], ["z", 50, 40, 55], ["z", 56, 40, 52]] as const) { if (axis === "x") k.box(a0, a1, D + 0.95, D + 1.03, c - 0.05, c + 0.05, "#2a313a", { solid: c === 52, tag: "marina-rail" }); else k.box(c - 0.05, c + 0.05, D + 0.95, D + 1.03, a0, a1, "#2a313a", { solid: true, tag: "marina-rail" }); }
    for (let x = 52; x <= 100; x += 6) { k.cyl(x, 52.2, -3, D + 0.6, 0.14, "#6a4b30"); k.cyl(x, 54.8, -3, D + 0.6, 0.14, "#6a4b30"); k.sphere(x, D + 0.7, 52.2, 0.17, "#fff0cc", { mat: "glow" }); }
    k.box(56, 66, D, D + 3.0, 43, 49, "#f3efe6", { tag: "harbor-hut" }); k.box(55.5, 66.5, D + 3.0, D + 3.3, 42.5, 49.5, "#2a6f97", { solid: false }); k.sign({ text: "MARINA", sub: "harbor master", x: 61, y: D + 2.3, z: 49.05, w: 3.4, h: 0.7, rotY: 0, style: "teal" });
    for (const [id, x, z] of [["m-a0", 53, 38], ["m-a1", 53, 44], ["m-a2", 53, 50], ["m-s0", 53, 53.5], ["m-s1", 59, 53.5], ["m-s2", 65, 53.5], ["m-s3", 71, 53.5], ["m-s4", 77, 53.5], ["m-s5", 83, 53.5], ["m-s6", 89, 53.5], ["m-s7", 95, 53.5], ["m-f60", 60, 59], ["m-f70", 70, 59], ["m-f80", 80, 59], ["m-f90", 90, 59], ["m-f60b", 60, 64], ["m-f70b", 70, 64], ["m-f80b", 80, 64], ["m-f90b", 90, 64]] as const) k.node(id, x, z);
    k.landmark({ id: "marina", name: "Marina", district: "Marina", x: 76, z: 53, y: D, radius: 16 }); }

  // ===== RESEARCH OBSERVATORY (exterior only; reserved for a future Research Agent — none is registered) =====
  { const ox = -94, oz = 6, G = 5.0; k.pad(ox - 9, ox + 9, oz - 9, oz + 11, G, 7);
    k.cyl(ox, oz, G, G + 8.0, 3.6, "#f1f3f4", { solid: true, tag: "observatory" }); k.cyl(ox, oz, G + 4.0, G + 5.6, 3.7, "#8fc7dc", { mat: "glass", solid: false }); k.sphere(ox, G + 8.0, oz, 3.7, "#e6eaec", {}); k.box(ox - 0.5, ox + 0.5, G + 8.0, G + 11.6, oz + 0.2, oz + 3.8, "#10151a", { solid: false });
    k.cyl(ox, oz, G, G + 0.3, 7.0, "#d9d6cc", { solid: false }); k.box(ox - 1.2, ox + 1.2, G, G + 2.6, oz + 3.55, oz + 3.8, "#232a31", { solid: false });
    for (const a of [0, 1.05, 2.1, 3.15, 4.2, 5.25]) { k.cyl(ox + Math.sin(a) * 6.6, oz + Math.cos(a) * 6.6, G, G + 1.0, 0.07, "#9aa5ac"); }
    k.cyl(ox + 7.5, oz + 5, G, G + 6, 0.08, "#9aa5ac"); k.sphere(ox + 7.5, G + 6.2, oz + 5, 0.5, "#e6eaec", {}); k.sign({ text: "RESEARCH OBSERVATORY", sub: "NOT CONFIGURED — no Research Agent registered", x: ox, y: G + 3.2, z: oz + 3.85, w: 5.6, h: 0.9, rotY: 0, style: "teal" });
    k.zone({ id: "observatory", name: "Research Observatory (reserved)", building: "observatory", district: "Observatory Point", minX: ox - 9, maxX: ox + 9, minZ: oz - 9, maxZ: oz + 9, y0: G - 2, y1: G + 14, indoor: false }); k.landmark({ id: "observatory", name: "Research Observatory", district: "Observatory Point", x: ox, z: oz + 8, y: G, radius: 12 }); }

  const districts = [{ id: "hq", name: "Northline HQ District", x: -18, z: -14 }, { id: "creative-row", name: "Creative Row", x: -72, z: -12 }, { id: "production", name: "Production District", x: 60, z: -14 }, { id: "boardwalk", name: "Boardwalk", x: 0, z: 17.5 }, { id: "creator-beach", name: "Creator Beach", x: -20, z: 30 }, { id: "wellness", name: "Wellness & Growth", x: -22, z: 7 }, { id: "marina", name: "Marina", x: 76, z: 50 }, { id: "residential", name: "Residential Hills", x: 50, z: -44 }, { id: "pier", name: "Analytics Pier", x: -66, z: 66 }, { id: "observatory", name: "Observatory Point", x: -94, z: 6 }];
  return { kit: k, paved, boatSlots, districts, creatorHouses: houses };
}
export type { Landmark };
export { HQ };
