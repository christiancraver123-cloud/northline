// Founder fast-travel destinations (development convenience, now a first-class Founder navigation feature). Optional: walking and flying remain the primary movement.
import { LANDMARKS, SPOTS, supportHeight } from "./layout";
import { PLAYER_START } from "./player";
import { getGraph } from "./nav";

export interface TravelPoint { id: string; label: string; section: "Northline" | "Districts" | "Creator residences"; x: number; z: number; y: number; yaw: number }
const lm = (id: string) => { const l = LANDMARKS.find((x) => x.id === id); if (!l) throw new Error(`travel: unknown landmark ${id}`); return l; };
const node = (id: string) => { const n = getGraph().nodes.get(id); if (!n) throw new Error(`travel: unknown nav node ${id}`); return n; };
const spot = (id: string) => { const s = SPOTS.find((x) => x.id === id); if (!s) throw new Error(`travel: unknown spot ${id}`); return s; };
type Sec = TravelPoint["section"];
/** the nearest clear walking-graph node to a landmark, so a travel destination is never inside furniture or a pool */
const snap = (x: number, z: number, y: number) => { let best: { x: number; z: number; y: number } | null = null, bd = Infinity; for (const n of getGraph().nodes.values()) { if (n.seat || Math.abs(n.y - y) > 2.5) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } } return best ?? { x, z, y };
};
const atLandmark = (ref: string, label: string, section: Sec, uid = ref, yaw?: number): TravelPoint => { const l = lm(ref), p = snap(l.x, l.z, l.y); return { id: uid, label, section, x: p.x, z: p.z, y: p.y, yaw: yaw ?? (l.z < 0 ? 0 : Math.PI) }; };
const atNode = (ref: string, label: string, section: Sec, uid: string, yaw: number): TravelPoint => { const n = node(ref); return { id: uid, label, section, x: n.x, z: n.z, y: n.y, yaw }; };
const atSpot = (ref: string, label: string, section: Sec, uid: string, yaw: number): TravelPoint => { const s = spot(ref), y = Number.isNaN(s.y) ? supportHeight(s.x, s.z, 1.2) : s.y; return { id: uid, label, section, x: s.x, z: s.z, y, yaw }; };

let cache: TravelPoint[] | null = null;
export function travelPoints(): TravelPoint[] {
  return (cache ??= [
    { id: "home", label: "Home (spawn)", section: "Northline", x: PLAYER_START.x, z: PLAYER_START.z, y: supportHeight(PLAYER_START.x, PLAYER_START.z, 1.2), yaw: PLAYER_START.yaw },
    atLandmark("hq", "Northline HQ", "Northline"), atNode("hq-cc-mid", "HQ Command Center", "Northline", "command-center", Math.PI * 1.5), atNode("hq-bed-c", "Founder suite", "Northline", "founder-suite", Math.PI),
    atLandmark("creative-studio", "Creative Row", "Districts", "creative-row"), atLandmark("production-office", "Production District", "Districts", "production"),
    atLandmark("pier", "Analytics Pier", "Districts"), atSpot("boardwalk-rail-mid", "Boardwalk", "Districts", "boardwalk", Math.PI), atSpot("beach-edge", "Creator Beach", "Districts", "creator-beach", Math.PI),
    atLandmark("marina", "Marina", "Districts"), atLandmark("alessia", "Residential Hills", "Districts", "residential-hills"), atLandmark("observatory", "Research Observatory", "Districts"), atSpot("pool-lounger-a", "Wellness", "Districts", "wellness", Math.PI),
    atLandmark("sienna", "Sienna's beach house", "Creator residences"), atLandmark("alessia", "Alessia's villa", "Creator residences", "alessia-villa"), atLandmark("mila", "Mila's house", "Creator residences"),
    atLandmark("vesper", "Vesper's house", "Creator residences"), atLandmark("zoe", "Zoe's bungalow", "Creator residences"), atLandmark("skye", "Skye's surf bungalow", "Creator residences"),
  ]);
}
export const travelPoint = (id: string) => travelPoints().find((p) => p.id === id) ?? null;
