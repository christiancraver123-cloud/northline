// Northline HQ — fully enterable two-storey headquarters (plus a walkable roof deck reachable by flight). Ocean-facing (+z).
import { Kit } from "./kit";
import { GROUND } from "./terrain";
import { artPanel, bed, bathtub, chair, desk, floorLamp, glassRail, lightStrip, plant, rug, screenWall, shelf, sideTable, sofa, table, toilet, vanity, wardrobe } from "./furniture";

export const HQ = { x0: -36, x1: 0, z0: -40, z1: -20, GF: 0.62, F1: 5.0, RF: 9.0, T: 0.4, entrance: { x: -18, z: -20 } } as const;
const C = { stone: "#d8d0c0", stoneDk: "#b9b2a4", white: "#f3efe6", teak: "#a9763f", dark: "#2b3138", oak: "#c9a77c", oakUp: "#b99a6f", carpet: "#8c8f98", glass: "#8fc7dc" };

export function buildHQ(k: Kit) {
  const { x0, x1, z0, z1, GF, F1, RF, T } = HQ, h1 = F1 - T, h2 = RF - T, W = 0.4;
  k.pad(x0 - 2, x1 + 2, z0 - 2, z1 + 14, GROUND, 2.5);
  k.group("hq-ext", () => {
    // ---- exterior walls ----
    k.wall("x", z1, x0, x1, GF, h1, W, C.stone, [{ a0: -35, a1: -27, kind: "window", sill: 0.7, top: 3.4 }, { a0: -25, a1: -21.5, kind: "window", sill: 0.7, top: 3.4 }, { a0: -20, a1: -16, kind: "door", top: 3.1 }, { a0: -14.5, a1: -12.4, kind: "window", sill: 0.7, top: 3.4 }, { a0: -10.5, a1: -1.5, kind: "window", sill: 0.3, top: 3.5 }], { tag: "hq-wall" });
    k.wall("x", z0, x0, x1, GF, h1, W, C.stone, [{ a0: -34, a1: -28, kind: "window", sill: 1.0, top: 3.2 }, { a0: -23.5, a1: -20.5, kind: "window", sill: 1.0, top: 3.2 }, { a0: -17.5, a1: -13.5, kind: "window", sill: 1.0, top: 3.2 }, { a0: -9, a1: -3, kind: "window", sill: 1.0, top: 3.2 }], { tag: "hq-wall" });
    k.wall("z", x0, z0, z1, GF, h1, W, C.stone, [{ a0: -38, a1: -34, kind: "window", sill: 1.0, top: 3.2 }, { a0: -29, a1: -23, kind: "window", sill: 0.7, top: 3.4 }], { tag: "hq-wall" });
    k.wall("z", x1, z0, z1, GF, h1, W, C.stone, [{ a0: -38, a1: -34, kind: "window", sill: 1.0, top: 3.2 }, { a0: -30, a1: -22, kind: "window", sill: 0.7, top: 3.4 }], { tag: "hq-wall" });
    // upper storey
    k.wall("x", z1, x0, x1, F1, h2, W, C.white, [{ a0: -35.6, a1: -33.6, kind: "window", sill: 0.7, top: 2.8 }, { a0: -33, a1: -29, kind: "door", top: 2.6 }, { a0: -28.6, a1: -26.4, kind: "window", sill: 0.7, top: 2.8 }, { a0: -24.5, a1: -13.5, kind: "window", sill: 0.4, top: 3.0 }, { a0: -11.6, a1: -9.4, kind: "window", sill: 0.7, top: 2.8 }, { a0: -9, a1: -3, kind: "door", top: 2.7 }, { a0: -2.6, a1: -0.4, kind: "window", sill: 0.7, top: 2.8 }], { tag: "hq-wall" });
    k.wall("x", z0, x0, x1, F1, h2, W, C.white, [{ a0: -34, a1: -28, kind: "window", sill: 1.0, top: 2.8 }, { a0: -24, a1: -14, kind: "window", sill: 1.0, top: 2.8 }, { a0: -9.5, a1: -6.5, kind: "window", sill: 1.2, top: 2.6 }, { a0: -4, a1: -1.5, kind: "window", sill: 1.0, top: 2.6 }], { tag: "hq-wall" });
    k.wall("z", x0, z0, z1, F1, h2, W, C.white, [{ a0: -39, a1: -34, kind: "window", sill: 1.0, top: 2.8 }, { a0: -30, a1: -22, kind: "window", sill: 0.7, top: 2.8 }], { tag: "hq-wall" });
    k.wall("z", x1, z0, z1, F1, h2, W, C.white, [{ a0: -39, a1: -34, kind: "window", sill: 1.0, top: 2.8 }, { a0: -30, a1: -22, kind: "window", sill: 0.7, top: 2.8 }], { tag: "hq-wall" });
    // facade character: teak fins, band, entrance canopy, signage, column rhythm
    for (let x = -24.4; x <= -13.6; x += 0.9) k.box(x - 0.05, x + 0.05, F1 + 0.2, F1 + 3.6, z1 + 0.05, z1 + 0.45, C.teak, { solid: false });
    for (let x = -35; x <= -27; x += 0.5) k.box(x - 0.03, x + 0.03, GF + 0.2, h1 - 0.3, z1 + 0.05, z1 + 0.18, C.teak, { solid: false });
    k.box(x0 - 0.2, x1 + 0.2, h1 - 0.05, F1 + 0.05, z1 - 0.15, z1 + 0.25, C.stoneDk, { solid: false });
    k.box(-23, -13, 3.5, 3.9, z1 - 3.8, z1 + 0.2, C.white, { solid: false }); k.box(-23, -13, 3.9, 4.0, z1 - 3.8, z1 - 3.7, C.teak, { solid: false });
    k.cyl(-22.7, z1 - 3.6, GF, 3.5, 0.17, C.dark, { solid: true }); k.cyl(-13.3, z1 - 3.6, GF, 3.5, 0.17, C.dark, { solid: true });
    k.sign({ text: "NORTHLINE", sub: "MEDIA", x: -18, y: 4.55, z: z1 + 0.28, w: 8.5, h: 1.6, rotY: 0, style: "dark" });
    for (const x of [-30, -6]) k.box(x - 1.6, x + 1.6, F1 + 0.1, F1 + 3.3, z1 + 0.02, z1 + 0.1, C.teak, { solid: false });
    // balconies (upper level) with glass rails
    k.floor(-12, 0, z1, z1 + 2.9, F1, T, C.stoneDk, { id: "hq-balcony-e", group: "hq-ext" }); k.floor(-36, -26, z1, z1 + 2.9, F1, T, C.stoneDk, { id: "hq-terrace-w", group: "hq-ext" });
    glassRail(k, "x", z1 + 2.9, -12, 0, F1); glassRail(k, "z", -12, z1, z1 + 2.9, F1); glassRail(k, "z", 0, z1, z1 + 2.9, F1); glassRail(k, "x", z1 + 2.9, -36, -26, F1); glassRail(k, "z", -36, z1, z1 + 2.9, F1); glassRail(k, "z", -26, z1, z1 + 2.9, F1);
    k.cyl(-35.8, z1 + 2.7, GF, F1 - T, 0.14, C.dark, { solid: true }); k.cyl(-26.2, z1 + 2.7, GF, F1 - T, 0.14, C.dark, { solid: true }); k.cyl(-0.3, z1 + 2.7, GF, F1 - T, 0.14, C.dark, { solid: true });
    // roof slab + parapet (hidden in overview so the interior is visible from above)
    k.floor(x0 - 1, x1 + 1, z0 - 1, z1 + 3.4, RF, T, "#e9e5db", { id: "hq-roof", kind: "roof", roof: true, group: "hq-roof" });
    k.box(x0 - 1, x1 + 1, RF, RF + 0.7, z0 - 1, z0 - 0.8, "#e9e5db", { solid: true, roof: true, group: "hq-roof" }); k.box(x0 - 1, x1 + 1, RF, RF + 0.7, z1 + 3.2, z1 + 3.4, "#e9e5db", { solid: true, roof: true, group: "hq-roof" });
    k.box(x0 - 1, x0 - 0.8, RF, RF + 0.7, z0 - 1, z1 + 3.4, "#e9e5db", { solid: true, roof: true, group: "hq-roof" }); k.box(x1 + 0.8, x1 + 1, RF, RF + 0.7, z0 - 1, z1 + 3.4, "#e9e5db", { solid: true, roof: true, group: "hq-roof" });
    // roof terrace furnishings (reachable by flight)
    for (const x of [-30, -18, -6]) k.box(x - 1.2, x + 1.2, RF, RF + 0.5, z1 + 1, z1 + 1.8, "#4f8f4a", { solid: false, group: "hq-roof", roof: true });
    // landscaping + approach
    for (const [x, z] of [[-30.5, z1 + 2.2], [-6, z1 + 2.2], [-34.5, z1 + 3.4], [-1.5, z1 + 3.4]]) { k.cyl(x, z, GROUND, GROUND + 0.5, 0.45, "#d7cfc2", { solid: true }); k.sphere(x, GROUND + 0.95, z, 0.6, "#4f8f4a"); }
  });

  // ---- floors ----
  const hole = { minX: -26, maxX: -18, minZ: -32, maxZ: -29 };
  k.group("hq-int", () => {
    k.floor(x0, x1, z0, z1, GF, 0.12, C.oak, { id: "hq-gf" });
    k.floor(x0, x1, z0, z1, F1, T, C.oakUp, { id: "hq-f1", holes: [hole] });
    // ---- ground-floor partitions ----
    const I = (a: number, b: number): { a0: number; a1: number; kind: "door" } => ({ a0: a, a1: b, kind: "door" });
    k.wall("z", -26, z0, z1, GF, h1, 0.25, C.white, [I(-29, -25), I(-37, -34)]);
    k.wall("z", -12, z0, z1, GF, h1, 0.25, C.white, [I(-29, -23), I(-37, -34)]);
    k.wall("z", -19, z0, -32, GF, h1, 0.25, C.white, [I(-37, -34)]);
    k.wall("x", -32, x0, x1, GF, h1, 0.25, C.white, [I(-33, -29), I(-17, -14), I(-8, -4)]);
    // upper partitions
    k.wall("z", -26, z0, z1, F1, h2, 0.25, C.white, [I(-31.6, -23), I(-37, -34)]);
    k.wall("z", -12, z0, z1, F1, h2, 0.25, C.white, [I(-27, -24)]);
    k.wall("x", -32, x0, x1, F1, h2, 0.25, C.white, [I(-33, -29), I(-16.5, -13.5), I(-9, -7), I(-3.5, -1.5)]);
    k.wall("z", -5, z0, -32, F1, h2, 0.25, C.white);
    // ceilings are the slabs above; interior light strips
    for (const [a, b, c, d] of [[-24, -14, -27, -26.6], [-10, -2, -28, -27.6], [-10, -2, -23.6, -23.2], [-9, -3, -36.5, -36.1], [-18, -13, -36.5, -36.1], [-24.5, -20.5, -36.5, -36.1], [-34, -28, -26.2, -25.8], [-34, -28, -36.5, -36.1]]) lightStrip(k, a, b, F1 - T - 0.02, c, d);
    for (const [a, b, c, d] of [[-24, -14, -26.6, -26.2], [-10, -2, -30, -29.6], [-9, -3, -26.5, -26.1], [-34, -28, -26.5, -26.1], [-22, -16, -36.6, -36.2], [-10, -2, -26.5, -26.1], [-4, -2, -37, -36.6]]) lightStrip(k, a, b, RF - T - 0.02, c, d);

    // ---- stairs (lobby, back-left) ----
    k.stairs("hq-stairs", -25.6, -18.0, -31.4, -29.4, "x", F1, GF, "#cdbf9f", "#c7bfaf");
    k.floor(-26.2, -25.6, -31.4, -29.4, F1, 0.1, C.oakUp, { id: "hq-landing" });
    glassRail(k, "x", -29, -25.9, -18.05, F1);

    // ---- LOBBY ----
    rug(k, -19, -25.5, GF + 0.12, 7, 4.4, "#8a9aa8");
    desk(k, -17.5, -27.2, GF + 0.12, 0, { w: 3.4, d: 0.9, wood: "#cdbf9f", screens: 2 }); chair(k, -17.5, -28.4, GF + 0.12, Math.PI, "#3f4a58");
    sofa(k, -24.4, -23.6, GF + 0.12, Math.PI / 2, { w: 2.4, color: "#c9d1d6" }); table(k, -22.4, -23.6, GF + 0.12, 1.0, 1.0, 0, { h: 0.42, top: "#e6dfd1" });
    sofa(k, -13.2, -22.4, GF + 0.12, -Math.PI / 2, { w: 2.0, color: "#c9d1d6" });
    plant(k, -24.7, -20.9, GF + 0.12, 1.2); plant(k, -13.2, -20.9, GF + 0.12, 1.2); plant(k, -12.9, -31.3, GF + 0.12, 1.1);
    k.sign({ text: "NORTHLINE", sub: "HQ", x: -21.8, y: 3.15, z: -31.78, w: 4.6, h: 1.1, rotY: 0, style: "dark" });
    k.sign({ text: "OPERATIONS →", sub: "Command Center", x: -12.14, y: 2.9, z: -26, w: 3.0, h: 0.7, rotY: -Math.PI / 2, style: "teal" });

    // ---- COMMAND CENTER (+ analytics area) ----
    rug(k, -6, -26, GF + 0.12, 10.4, 10, "#59616e");
    for (const z of [-28.5, -25.5, -22.5]) { desk(k, -8.2, z, GF + 0.12, Math.PI / 2, { w: 1.6, d: 0.8, screens: 2, wood: "#d9d2c4" }); chair(k, -9.4, z, GF + 0.12, Math.PI / 2, "#31577a"); desk(k, -4.6, z, GF + 0.12, Math.PI / 2, { w: 1.6, d: 0.8, screens: 2, wood: "#d9d2c4" }); chair(k, -5.8, z, GF + 0.12, Math.PI / 2, "#31577a"); }
    screenWall(k, -0.5, -0.38, 1.3, 3.9, -30.5, -21.5, "#4aa3ff");
    k.sign({ text: "OPERATIONS", sub: "SIMULATED DISPLAYS", x: -0.62, y: 4.15, z: -26, w: 4.6, h: 0.5, rotY: -Math.PI / 2, style: "teal" });
    plant(k, -11.2, -31.2, GF + 0.12, 1.1); plant(k, -0.9, -20.8, GF + 0.12, 1.1);
    screenWall(k, -10.5, -1.5, 1.4, 3.9, -39.78, -39.7, "#60e0a8");
    artPanel(k, -10.2, -1.8, 1.55, 3.7, -39.7, -39.64, ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#f59e0b"]);
    k.sign({ text: "ANALYTICS", sub: "SIMULATED — NO REAL DATA", x: -6, y: 4.2, z: -39.7, w: 5, h: 0.55, rotY: Math.PI, style: "teal" });
    desk(k, -6, -37.2, GF + 0.12, Math.PI, { w: 2.4, d: 0.9, screens: 3, wood: "#d9d2c4" }); chair(k, -6, -35.9, GF + 0.12, Math.PI, "#31577a"); table(k, -2.4, -36.4, GF + 0.12, 1.2, 1.2, 0, { h: 1.05, top: "#e6dfd1" });
    // ---- STRATEGY ----
    rug(k, -31, -25.5, GF + 0.12, 7.5, 6.5, "#9fb3a7"); table(k, -31, -25.8, GF + 0.12, 4.0, 1.5, 0, { top: "#d9c8a5" });
    for (const x of [-32.4, -31, -29.6]) { chair(k, x, -24.4, GF + 0.12, Math.PI); chair(k, x, -27.2, GF + 0.12, 0); }
    artPanel(k, -35.75, -35.6, 1.0, 3.2, -30.5, -23, ["#f4d35e", "#ee964b", "#f95738", "#0d3b66", "#faf0ca", "#7bdff2"]); plant(k, -34.8, -21.2, GF + 0.12, 1.1); sofa(k, -29.3, -21.4, GF + 0.12, 0, { w: 2.0, color: "#d8cfbd" });
    // ---- CREATIVE STUDIO (HQ) ----
    rug(k, -31, -36.5, GF + 0.12, 7, 5, "#c7a7c9"); table(k, -31, -37.5, GF + 0.12, 3.2, 1.1, 0, { top: "#efe7d6" }); chair(k, -32, -36.4, GF + 0.12, Math.PI, "#7a4f9a"); chair(k, -30, -36.4, GF + 0.12, Math.PI, "#7a4f9a");
    artPanel(k, -35.75, -35.6, 1.1, 3.4, -39.2, -33, ["#ec4899", "#8b5cf6", "#06b6d4", "#fbbf24", "#34d399"]); sofa(k, -27.6, -37.2, GF + 0.12, Math.PI / 2, { w: 2.0, color: "#cfc4df" }); plant(k, -34.9, -32.8, GF + 0.12, 1.1);
    // ---- MEETING ----
    table(k, -22.5, -36, GF + 0.12, 3.4, 1.4, 0, { top: "#d9c8a5" }); for (const x of [-23.6, -22.5, -21.4]) { chair(k, x, -34.6, GF + 0.12, Math.PI); chair(k, x, -37.4, GF + 0.12, 0); }
    screenWall(k, -25, -20.4, 1.3, 3.6, -39.78, -39.7, "#7aa7ff"); plant(k, -25.2, -32.9, GF + 0.12, 1.0);
    // ---- PRODUCTION ----
    table(k, -15.5, -37.2, GF + 0.12, 3.2, 1.1, 0, { top: "#cfd6dc" }); chair(k, -16.2, -35.9, GF + 0.12, Math.PI, "#2f7a5f"); chair(k, -14.8, -35.9, GF + 0.12, Math.PI, "#2f7a5f");
    shelf(k, -17.7, -39.55, GF + 0.12, 0, 1.8, 2.0); screenWall(k, -16, -13, 1.3, 3.2, -39.78, -39.7, "#ffb35a");

    // ---- UPPER: hall ----
    rug(k, -19, -24.5, F1 + 0.01, 6, 3.4, "#a9b6c2"); sofa(k, -19, -23.2, F1, 0, { w: 2.8, color: "#d3ccbd" }); plant(k, -24.6, -21, F1, 1.2); plant(k, -12.8, -21, F1, 1.2); plant(k, -12.8, -31.3, F1, 1.1);
    artPanel(k, -25.85, -25.7, 1.2 + F1, 3.4 + F1, -28.5, -22.5, ["#fb7185", "#f59e0b", "#14b8a6", "#6366f1"]);
    // ---- UPPER: lounge ----
    rug(k, -31, -26, F1 + 0.01, 6.5, 5.5, "#d9c6a8"); sofa(k, -31, -29.4, F1, 0, { w: 3.0, color: "#c2c9cf" }); sofa(k, -34.6, -25, F1, Math.PI / 2, { w: 2.2, color: "#c2c9cf" }); table(k, -32, -25.6, F1, 1.4, 1.0, 0, { h: 0.42, top: "#e6dfd1" });
    k.box(-35.7, -34.9, F1, F1 + 1.05, -31.5, -29.5, "#6a4b30", { solid: true }); plant(k, -35, -21.2, F1, 1.2); floorLamp(k, -27.2, -30.8, F1);
    // ---- UPPER: founder office ----
    rug(k, -19.5, -36, F1 + 0.01, 7, 5, "#7d8a96"); desk(k, -19.5, -38.1, F1, Math.PI, { w: 2.6, d: 1.1, wood: "#6b4b32", screens: 2 }); chair(k, -19.5, -36.7, F1, Math.PI, "#2a313a");
    shelf(k, -25.55, -36.5, F1, Math.PI / 2, 3.2, 2.3); sofa(k, -15, -36.8, F1, -Math.PI / 2, { w: 2.2, color: "#cdbfa7" }); table(k, -17, -34.3, F1, 1.0, 0.8, 0, { h: 0.45, top: "#2a313a" }); plant(k, -12.9, -39.2, F1, 1.1); floorLamp(k, -24.5, -33.0, F1);
    artPanel(k, -22.5, -16.5, F1 + 1.6, F1 + 3.2, -39.78, -39.7, ["#1f2937", "#374151", "#fbbf24", "#1f2937"]);
    // ---- UPPER: founder bedroom ----
    rug(k, -5, -27, F1 + 0.01, 5.2, 4.4, "#cfd6dc"); bed(k, -4.8, -30.5, F1, 0); sideTable(k, -7.0, -31.4, F1); sideTable(k, -2.6, -31.4, F1);
    wardrobe(k, -11.62, -30.2, F1, Math.PI / 2, 2.6); desk(k, -10.6, -21.9, F1, Math.PI, { w: 1.5, d: 0.7, wood: "#8a6a4a", screens: 1 }); chair(k, -10.6, -22.9, F1, 0, "#6b7b8c");
    sofa(k, -1.3, -24.0, F1, -Math.PI / 2, { w: 1.8, color: "#bfc9d1" }); floorLamp(k, -1.2, -21.2, F1); floorLamp(k, -11.2, -26.5, F1);
    artPanel(k, -7.5, -2.1, F1 + 1.5, F1 + 3.0, -31.78, -31.7, ["#e0c3a8", "#c9a27d", "#a9c4d2", "#e0c3a8"]);
    k.box(-11.8, -11.0, F1, F1 + 2.6, -22.4, -21.6, "#e9e1d3", { solid: false }); k.box(-0.9, -0.2, F1, F1 + 2.6, -22.4, -21.6, "#e9e1d3", { solid: false }); // curtains
    // ---- UPPER: bathroom + closet ----
    bathtub(k, -11.4, -37.5, F1, Math.PI / 2); vanity(k, -8, -39.55, F1, Math.PI, 1.6); toilet(k, -5.7, -36.8, F1, -Math.PI / 2);
    k.box(-6.9, -5.2, F1, F1 + 2.2, -35.6, -35.5, "#bfe6f2", { mat: "glass", solid: true }); k.box(-5.3, -5.2, F1, F1 + 2.2, -35.6, -32.6, "#bfe6f2", { mat: "glass", solid: true });
    wardrobe(k, -2.5, -39.6, F1, Math.PI, 4.4); k.box(-4.6, -0.3, F1, F1 + 0.06, -39.8, -32.2, "#c9bfae", { solid: false });
    // ---- UPPER: reading nook ----
    rug(k, -31, -36, F1 + 0.01, 5, 4, "#b8c6a8"); shelf(k, -35.55, -36, F1, Math.PI / 2, 3.4, 2.3); sofa(k, -29.5, -37.4, F1, Math.PI / 2, { w: 1.4, color: "#d8cfbd" }); plant(k, -34.9, -32.9, F1, 1.1);
    // ---- balcony / terrace furniture ----
    sofa(k, -1.9, -18.5, F1, Math.PI, { w: 2.0, color: "#d9d2c4" }); table(k, -10.2, -18.6, F1, 0.8, 0.8, 0, { h: 0.42, top: "#e6dfd1" }); plant(k, -11.4, -17.5, F1, 0.9); plant(k, -0.7, -17.5, F1, 0.9);
    table(k, -27.8, -18.5, F1, 1.1, 1.1, 0, { h: 0.72 }); chair(k, -28.8, -18.5, F1, Math.PI / 2); chair(k, -26.8, -18.5, F1, -Math.PI / 2); plant(k, -35.3, -17.5, F1, 0.9);
  });

  // ---- zones (interior vs balcony/terrace), used for location label, interior camera and lighting ----
  const Z = (id: string, name: string, minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number, indoor = true) => k.zone({ id, name, building: "hq", district: "Northline HQ", minX, maxX, minZ, maxZ, y0, y1, indoor });
  Z("hq-lobby", "Lobby", -26, -12, -32, -20, GF - 0.3, F1 - 0.2); Z("hq-command", "Command Center", -12, 0, -32, -20, GF - 0.3, F1 - 0.2); Z("hq-analytics", "Analytics area", -12, 0, -40, -32, GF - 0.3, F1 - 0.2);
  Z("hq-strategy", "Strategy workspace", -36, -26, -32, -20, GF - 0.3, F1 - 0.2); Z("hq-creative", "Creative studio", -36, -26, -40, -32, GF - 0.3, F1 - 0.2); Z("hq-meeting", "Meeting room", -26, -19, -40, -32, GF - 0.3, F1 - 0.2); Z("hq-production", "Production room", -19, -12, -40, -32, GF - 0.3, F1 - 0.2);
  Z("hq-hall", "Upstairs hall", -26, -12, -32, -20, F1 - 0.3, RF - 0.2); Z("hq-lounge", "Lounge", -36, -26, -32, -20, F1 - 0.3, RF - 0.2); Z("hq-office", "Founder office", -26, -12, -40, -32, F1 - 0.3, RF - 0.2);
  Z("hq-bedroom", "Founder suite — bedroom", -12, 0, -32, -20, F1 - 0.3, RF - 0.2); Z("hq-bath", "Founder suite — bathroom", -12, -5, -40, -32, F1 - 0.3, RF - 0.2); Z("hq-closet", "Founder suite — dressing room", -5, 0, -40, -32, F1 - 0.3, RF - 0.2); Z("hq-nook", "Reading nook", -36, -26, -40, -32, F1 - 0.3, RF - 0.2);
  Z("hq-balcony", "Founder suite — balcony", -12, 0, -20, -17.1, F1 - 0.3, RF - 0.2, false); Z("hq-terrace", "Lounge terrace", -36, -26, -20, -17.1, F1 - 0.3, RF - 0.2, false); Z("hq-roof", "Roof deck", -37, 1, -41, -16.6, RF - 0.3, RF + 6, false);

  // ---- agent spots inside HQ ----
  k.spot("hq-command-a", -9.4, -28.5, Math.PI / 2, "work-sit", "at the Command Center", { y: GF + 0.12 }); k.spot("hq-command-b", -9.4, -25.5, Math.PI / 2, "work-sit", "at the Command Center", { y: GF + 0.12 }); k.spot("hq-command-c", -9.4, -22.5, Math.PI / 2, "work-sit", "at the Command Center", { y: GF + 0.12 });
  k.spot("hq-command-d", -5.8, -28.5, Math.PI / 2, "sit", "at the Command Center", { y: GF + 0.12 }); k.spot("hq-command-e", -5.8, -25.5, Math.PI / 2, "sit", "at the Command Center", { y: GF + 0.12 });
  k.spot("hq-production-desk", -15.5, -35.9, Math.PI, "work-sit", "in the production room", { y: GF + 0.12 }); k.spot("hq-analytics-desk", -6, -35.9, Math.PI, "work-sit", "at the analytics wall", { y: GF + 0.12 });
  k.spot("hq-meeting-table", -22.5, -34.6, Math.PI, "sit", "in the meeting room", { y: GF + 0.12, weight: 1.5 }); k.spot("hq-lobby-reception", -17.5, -28.5, 0, "stand", "chatting at reception", { y: GF + 0.12, weight: 1.5 });
  k.spot("hq-lobby-sofa", -24.4, -23.6, Math.PI / 2, "sit", "relaxing in the lobby", { y: GF + 0.12 }); k.spot("hq-lounge-sofa", -31, -28.4, 0, "sit", "relaxing in the upstairs lounge", { y: F1 });
  k.spot("hq-strategy-table", -31, -24.4, Math.PI, "sit", "at the strategy table", { y: GF + 0.12 });
  // extra nav nodes: doorways + stair + hall waypoints (the auto-linker connects what it can see)
  const sy = (x: number) => F1 - ((x + 25.6) / 7.6) * (F1 - GF); // walkable height on the stair ramp (west = top)
  const N = (id: string, x: number, z: number, y?: number) => k.node(id, x, z, y);
  N("hq-door-out", -18, -17.2); N("hq-door-in", -18, -22.2, GF + 0.12); N("hq-lobby-c", -19, -25.5, GF + 0.12); N("hq-lobby-w", -23.6, -26.6, GF + 0.12);
  N("hq-arch-cc", -12, -26, GF + 0.12); N("hq-cc-aisle", -11, -26, GF + 0.12); N("hq-cc-mid", -7, -26.2, GF + 0.12); N("hq-cc-aisle-b", -7.0, -30.2, GF + 0.12);
  N("hq-door-strat", -26, -27, GF + 0.12); N("hq-strat-c", -31, -22.4, GF + 0.12); N("hq-strat-n", -31, -30.4, GF + 0.12); N("hq-door-creative", -31, -32, GF + 0.12); N("hq-creative-c", -31, -34.4, GF + 0.12);
  N("hq-door-meet-prod", -19, -35.5, GF + 0.12); N("hq-meet-c", -22.5, -33.2, GF + 0.12); N("hq-prod-c", -15.5, -33.4, GF + 0.12); N("hq-door-prod", -15.5, -32, GF + 0.12); N("hq-door-ana", -6, -32, GF + 0.12); N("hq-ana-c", -6, -34.2, GF + 0.12);
  N("hq-door-cc-ana-b", -12, -35.5, GF + 0.12);
  N("hq-stairs-0", -18.5, -30.4, sy(-18.5)); N("hq-stairs-1", -20.5, -30.4, sy(-20.5)); N("hq-stairs-2", -22.5, -30.4, sy(-22.5)); N("hq-stairs-3", -24.5, -30.4, sy(-24.5)); N("hq-stairs-top", -27, -30.4, F1); N("hq-lobby-stair-foot", -16.8, -29.0, GF + 0.12);
  N("hq-hall-c", -17, -26, F1); N("hq-hall-e", -14, -24.5, F1); N("hq-door-lounge", -26, -26, F1); N("hq-lounge-c", -30, -22.8, F1); N("hq-door-office", -15, -32, F1); N("hq-office-c", -15.5, -34.6, F1);
  N("hq-door-bed", -12, -25.5, F1); N("hq-bed-c", -7, -25.5, F1); N("hq-bed-door-bath", -8, -32, F1); N("hq-bath-c", -8, -35, F1); N("hq-balcony-door", -6, -20, F1); N("hq-balcony-c", -6, -18.3, F1);
  N("hq-terrace-door", -31, -20, F1); N("hq-terrace-c", -31, -18.5, F1);
}
