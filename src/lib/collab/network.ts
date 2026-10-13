// (Ported from the original Command Center.) The Northline social graph: who actually knows whom, and why. Collabs follow these edges so
// (Ported from the original Command Center.) cross-promotion looks like friendship, not six accounts shouting about each other. Pure.
//
//   Sienna ↔ Zoe
//     ↕       ↕
//   Vesper ↔ Skye
//     ↕
//   Alessia ↔ Mila

export const CODES = ["SIE", "ALE", "MIL", "VES", "ZOE", "SKY"] as const;
export type Code = (typeof CODES)[number];

export type Edge = { a: Code; b: Code; how: string; dynamic: string };

export const EDGES: Edge[] = [
  { a: "SIE", b: "ZOE", how: "best friends since a Pilates retreat in Tulum; Zoe flies to Miami, Sienna flies to LA", dynamic: "Sienna drags Zoe out, Zoe drags Sienna to a 7am class" },
  { a: "SIE", b: "VES", how: "their Miami→LA flight got cancelled and they drove half the country together", dynamic: "bad ideas, good stories; Vesper drives, Sienna picks the music" },
  { a: "ZOE", b: "SKY", how: "Skye is teaching Zoe to surf, badly, most Sunday mornings", dynamic: "beach mornings, matcha after, Skye's dog steals the show" },
  { a: "VES", b: "SKY", how: "SoCal road-trip friends from a surf-town boxing gym", dynamic: "friendly rivalry: boxing vs surfing, whoever loses buys tacos" },
  { a: "VES", b: "ALE", how: "met at a Paris gallery opening; Vesper crashes at Alessia's New York place", dynamic: "quiet, expensive, a little intimidating together" },
  { a: "ALE", b: "MIL", how: "cousins: Alessia is Mila's older cousin", dynamic: "opposite worlds; Alessia in a honky-tonk, Mila in Paris, both out of place" },
];

const key = (a: string, b: string) => [a, b].sort().join("-");
const EDGE_BY_KEY = new Map(EDGES.map((e) => [key(e.a, e.b), e]));

export const edgeOf = (a: string, b: string): Edge | undefined => EDGE_BY_KEY.get(key(a, b));
export const areFriends = (a: string, b: string) => Boolean(edgeOf(a, b));
export const friendsOf = (c: string): string[] => EDGES.flatMap((e) => (e.a === c ? [e.b] : e.b === c ? [e.a] : []));

/** Shortest friend path a→b (inclusive), or [] if none. */
export function pathBetween(a: string, b: string): Code[] {
  const prev = new Map<string, string | null>([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === b) break;
    for (const n of friendsOf(cur)) if (!prev.has(n)) (prev.set(n, cur), queue.push(n));
  }
  if (!prev.has(b)) return [];
  const out: string[] = [];
  for (let c: string | null = b; c; c = prev.get(c) ?? null) out.unshift(c);
  return out as Code[];
}

/** Is the group connected using only friendships between its own members? */
export function isConnected(codes: string[]): boolean {
  if (codes.length <= 1) return true;
  const seen = new Set([codes[0]!]);
  const queue = [codes[0]!];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of friendsOf(cur)) if (codes.includes(n) && !seen.has(n)) (seen.add(n), queue.push(n));
  }
  return seen.size === codes.length;
}

/** Members ordered by friend-distance from the lead (lead first) — the order posts roll out. */
export function rolloutOrder(codes: string[], lead: string): string[] {
  const dist = new Map<string, number>([[lead, 0]]);
  const queue = [lead];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of friendsOf(cur)) if (codes.includes(n) && !dist.has(n)) (dist.set(n, dist.get(cur)! + 1), queue.push(n));
  }
  return [...codes].sort((x, y) => (dist.get(x) ?? 99) - (dist.get(y) ?? 99) || CODES.indexOf(x as Code) - CODES.indexOf(y as Code));
}

export type CollabKind = "duo" | "group" | "event";
export const kindOf = (n: number): CollabKind => (n === 2 ? "duo" : n >= 6 ? "event" : "group");

/** Human reason the line-up doesn't work, plus a fix. null = fine. */
export function lineupProblem(codes: string[], names: Record<string, string>): string | null {
  const uniq = [...new Set(codes)];
  if (uniq.length !== codes.length) return "Each creator can only be in a collab once.";
  if (uniq.some((c) => !(CODES as readonly string[]).includes(c))) return "Unknown creator code.";
  if (uniq.length < 2) return "Pick at least two creators.";
  if (uniq.length === 6) return null; // all-six events are allowed to mix everyone
  if (isConnected(uniq)) return null;
  const n = (c: string) => names[c] ?? c;
  if (uniq.length === 2) {
    const path = pathBetween(uniq[0]!, uniq[1]!);
    const via = path.slice(1, -1).map(n);
    return `${n(uniq[0]!)} and ${n(uniq[1]!)} don't know each other yet.${via.length ? ` Add ${via.join(" and ")} so there's a mutual friend in the photos, and they meet there.` : ""}`;
  }
  const lonely = uniq.filter((c) => !friendsOf(c).some((f) => uniq.includes(f))).map(n);
  return `${lonely.length ? `${lonely.join(", ")} ${lonely.length > 1 ? "don't" : "doesn't"} know anyone else in this group.` : "This group splits into two separate friend circles."} Add a mutual friend or split it into two collabs.`;
}
