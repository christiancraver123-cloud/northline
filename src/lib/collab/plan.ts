// (Ported from the original Command Center.) COLLAB planner: one shared event → a storyline, distinct images per account, a Reel,
// each creator's caption in her own voice, tags, Story reposts and a posting order that
// moves the audience from the discovery account outward along real friendships. Pure.

import { edgeOf, friendsOf as friendsOfCode, kindOf, lineupProblem, rolloutOrder, type CollabKind } from "./network";

const friendsOf = (c: string) => friendsOfCode(c) as string[];

export type CollabMember = {
  code: string;
  name: string;
  handle: string; // "" until her account exists
  live: boolean; // active + account + AI label
  followers: number;
  visual_identity: string;
  photography_style: string;
  look: { hair: string; expression: string; jewellery: string; palette: string; build: string };
};

export type CollabInput = { codes: string[]; event: string; location?: string; lead?: string };

export type CollabShot = { id: string; owner: string; kind: "solo" | "group"; people: string[]; composition: string; prompt: string };
export type CollabPost = {
  owner: string;
  day: number; // days after the collab's first post
  format: "carousel" | "reel";
  shots: string[]; // shot ids, all unique to this account
  caption: string;
  tags: string[]; // codes tagged on the post
  mentions: string[]; // codes @-mentioned in the caption (friends only)
  stories: Array<{ by: string; what: string }>;
  waitsForLaunch: boolean;
  concept: string;
};

export type CollabPlan = {
  kind: CollabKind;
  title: string;
  location: string;
  timeOfDay: "day" | "golden hour" | "night";
  lead: string;
  order: string[];
  storyline: string;
  relationships: string[];
  shots: CollabShot[];
  posts: CollabPost[];
  reel: { owner: string; concept: string; beats: string[] };
  notes: string[];
};

const NIGHT = /(dinner|party|club|bar|birthday|night|drinks|concert|gala|rooftop|date|casino|karaoke)/i;
const GOLDEN = /(sunset|golden|beach|boat|yacht|pool|picnic|festival|surf|lake)/i;

export function timeOfDay(event: string): CollabPlan["timeOfDay"] {
  if (NIGHT.test(event)) return "night";
  if (GOLDEN.test(event)) return "golden hour";
  return "day";
}

const COMPOSITIONS = [
  "arms around each other, laughing mid-sentence, candid",
  "walking ahead, one of them looking back at the camera",
  "sitting at a table, one mid-bite, the other mid-story",
  "mirror selfie together, phone covering part of one face",
  "from slightly behind, both looking at the view, one turning to the lens",
  "squeezed into one frame, slightly blurry flash, genuinely laughing",
];

// Caption templates per creator, written in each voice. {e} = event, {w} = who (friend mention).
const CAPTIONS: Record<string, string[]> = {
  SIE: ["{e}. {w} said it would be chill. it was not.", "told {w} i'm low maintenance. then planned {e}.", "{e} with {w}. only one of us was dressed for it."],
  ALE: ["{e}. don't ask.", "{w} insisted.", "{e}. apparently this is what we do now."],
  MIL: ["we said one drink btw. {e} with {w}", "{w} dressed me for {e}. i look like i do taxes", "{e} w {w}. i was the problem. again"],
  VES: ["{e}. seemed reasonable at the time.", "{w} picked the plan. i picked the exit.", "{e}. worth it."],
  ZOE: ["{e} with {w}. phone stayed in the bag. mostly.", "{e}. matcha after, obviously.", "{w} + {e} = no notes."],
  SKY: ["{e} with {w}. dog is furious he wasn't invited.", "{w} got absolutely washed at {e}. 10/10.", "{e}. sand in places. worth it."],
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const at = (m: CollabMember) => (m.handle ? `@${m.handle}` : m.name.split(" ")[0]!.toLowerCase());

export function captionFor(owner: CollabMember, event: string, mentioned: CollabMember[], variant = 0): string {
  const pool = CAPTIONS[owner.code] ?? ["{e} with {w}."];
  const t = pool[(hash(owner.code + event) + variant) % pool.length]!;
  const who = mentioned.length ? mentioned.map(at).join(" + ") : "the girls";
  return t.replace("{e}", event.toLowerCase()).replace("{w}", who);
}

function soloPrompt(m: CollabMember, event: string, where: string, tod: string, n: number): string {
  return [
    `Photorealistic phone photo, 4:5. ${m.name} (attach her master face). ${m.visual_identity}`,
    `Scene: ${event}${where}, ${tod}. Her own angle on the day, shot ${n} of 2 — different moment and framing from any other account's photos.`,
    `Outfit in her palette (${m.look.palette}); jewellery: ${m.look.jewellery}. Expression: ${m.look.expression}. Photo style: ${m.photography_style}`,
    "Fictional person, no logos, no text, no watermark. No nudity, nothing see-through.",
  ].join("\n");
}

function groupPrompt(people: CollabMember[], event: string, where: string, tod: string, composition: string): string {
  const who = people.map((p, i) => `Person ${i + 1}: ${p.name} (attach her master face${i === 0 ? " first" : ""}) — ${p.look.hair}; ${p.look.jewellery}; ${p.look.expression}; ${p.look.build}.`).join("\n");
  return [
    `Photorealistic candid phone photo, 4:5, of ${people.length} women together at ${event}${where}, ${tod}. ${composition}.`,
    who,
    "They must read as clearly different people: keep every person's hair, jewellery, build and expression exactly as described; don't blend their faces.",
    "Fictional people, no logos, no text, no watermark. No nudity, nothing see-through.",
  ].join("\n");
}

/**
 * Build the plan. Throws with a plain-English reason when the line-up isn't believable.
 * Each account gets its own images: solos from her angle plus one group frame nobody else posts.
 */
export function planCollab(input: CollabInput, members: CollabMember[]): CollabPlan {
  const byCode = new Map(members.map((m) => [m.code, m]));
  const codes = [...new Set(input.codes)];
  const names = Object.fromEntries(members.map((m) => [m.code, m.name]));
  const problem = lineupProblem(codes, names);
  if (problem) throw new Error(problem);
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new Error(`Missing creator data for ${missing.join(", ")}.`);
  const event = input.event.trim();
  if (event.length < 3) throw new Error("Describe the event in a few words, e.g. “Miami boat day”.");

  const kind = kindOf(codes.length);
  const crew = codes.map((c) => byCode.get(c)!);
  // Discovery account: a live creator with the biggest audience leads; otherwise the first picked.
  const liveCrew = crew.filter((m) => m.live).sort((a, b) => b.followers - a.followers);
  const lead = input.lead && codes.includes(input.lead) ? input.lead : (liveCrew[0] ?? crew[0]!).code;
  const order = rolloutOrder(codes, lead);
  const tod = timeOfDay(event);
  const where = input.location?.trim() ? ` in ${input.location.trim()}` : "";

  const relationships = codes.flatMap((a, i) => codes.slice(i + 1).map((b) => edgeOf(a, b)).filter(Boolean).map((e) => `${names[e!.a]} + ${names[e!.b]}: ${e!.how}. ${e!.dynamic}.`));

  // Shots: 2 solos per account + group frames owned by one account each (never shared).
  const shots: CollabShot[] = [];
  const comps = (i: number) => COMPOSITIONS[(hash(event) + i) % COMPOSITIONS.length]!;
  order.forEach((c, i) => {
    const m = byCode.get(c)!;
    for (const n of [1, 2]) shots.push({ id: `${c}-solo-${n}`, owner: c, kind: "solo", people: [c], composition: "solo", prompt: soloPrompt(m, event, where, tod, n) });
    // Group frame for this account: her friends in the crew (whole crew for duos and small groups).
    const inFrame = kind === "event" ? [c, ...friendsOf(c).filter((f) => codes.includes(f))] : codes.length <= 4 ? order : [c, ...friendsOf(c).filter((f) => codes.includes(f))];
    const people = [c, ...inFrame.filter((x) => x !== c)];
    shots.push({ id: `${c}-group`, owner: c, kind: "group", people, composition: comps(i), prompt: groupPrompt(people.map((p) => byCode.get(p)!), event, where, tod, comps(i)) });
  });
  if (kind === "event") {
    const everyone = order.map((c) => byCode.get(c)!);
    shots.push({ id: `${lead}-all-six`, owner: lead, kind: "group", people: order, composition: "all six in one frame, loose and candid, not a lineup", prompt: groupPrompt(everyone, event, where, tod, "all six in one frame, loose and candid, not a lineup") });
  }

  // Posting order: lead day 0, then outward by friend distance, 2 days apart (duo partner at +3).
  const spacing = kind === "duo" ? 3 : 2;
  const posts: CollabPost[] = order.map((c, i) => {
    const m = byCode.get(c)!;
    const mine = shots.filter((s) => s.owner === c);
    const inPhotos = [...new Set(mine.flatMap((s) => s.people))].filter((p) => p !== c);
    const mentions = inPhotos.filter((p) => friendsOf(c).includes(p));
    const stories = [
      ...inPhotos.filter((p) => friendsOf(c).includes(p)).map((p) => ({ by: p, what: `Repost ${names[c]}'s post to Story the same day with a one-line reaction.` })),
      ...(i > 0 && !(inPhotos.includes(order[0]!) && friendsOf(c).includes(order[0]!)) ? [{ by: order[0]!, what: `Repost ${names[c]}'s post to Story: "the other angle 👀".` }] : []),
    ];
    return {
      owner: c,
      day: i * spacing,
      format: "carousel" as const,
      shots: [`${c}-group`, `${c}-solo-1`, `${c}-solo-2`, ...(kind === "event" && c === lead ? [`${lead}-all-six`] : [])],
      caption: captionFor(m, event, mentions.map((p) => byCode.get(p)!), i),
      tags: inPhotos,
      mentions,
      stories: stories.filter((s, k, arr) => arr.findIndex((x) => x.by === s.by && x.what === s.what) === k),
      waitsForLaunch: !m.live,
      concept: `${event} (collab) — ${names[c]}'s carousel: her group frame + two solos from her angle`,
    };
  });

  // Reel: owned by the second account in the rollout for reach (lead for duos), a day after its post.
  const reelOwner = kind === "duo" ? lead : order[1]!;
  const reelDay = (posts.find((p) => p.owner === reelOwner)?.day ?? 0) + 1;
  const beats = [
    `0–1s hook: ${names[reelOwner]} to camera, mid-${event.toLowerCase()}, already laughing`,
    `1–4s: quick cuts of each of ${codes.map((c) => names[c]!.split(" ")[0]).join(", ")} in their own look`,
    "4–7s: the moment it goes wrong (spilled drink / wave / missed the boat)",
    "7–9s: deadpan ending on the friend who caused it",
  ];
  const reel = { owner: reelOwner, concept: `${event} — friends reel. Stills made in ChatGPT first; Higgsfield motion only when you say so.`, beats };
  posts.push({
    owner: reelOwner,
    day: reelDay,
    format: "reel",
    shots: [],
    caption: captionFor(byCode.get(reelOwner)!, event, codes.filter((c) => c !== reelOwner && friendsOf(reelOwner).includes(c)).map((c) => byCode.get(c)!), 1),
    tags: codes.filter((c) => c !== reelOwner),
    mentions: codes.filter((c) => c !== reelOwner && friendsOf(reelOwner).includes(c)),
    stories: codes.filter((c) => c !== reelOwner).map((c) => ({ by: c, what: `Share ${names[reelOwner]}'s reel to Story.` })),
    waitsForLaunch: !byCode.get(reelOwner)!.live,
    concept: `${event} (collab) — friends reel on ${names[reelOwner]}'s account`,
  });
  posts.sort((a, b) => a.day - b.day);

  const storyline = [
    `${event}${where}, ${tod}. ${kind === "event" ? "All six together: rare, so it should feel like an event." : kind === "duo" ? "Two friends, one day." : `${codes.length} friends, one day.`}`,
    `${names[lead]} posts first (discovery), then it rolls out along real friendships: ${order.map((c) => names[c]!.split(" ")[0]).join(" → ")}.`,
    "Every account shows a different angle of the same day; no image appears on two accounts.",
  ].join(" ");

  const notes: string[] = [];
  if (crew.some((m) => !m.live)) notes.push(`${crew.filter((m) => !m.live).map((m) => m.name.split(" ")[0]).join(", ")} ${crew.filter((m) => !m.live).length > 1 ? "aren't" : "isn't"} live yet: their posts wait for launch, and mentions use first names until their @ exists.`);
  if (kind === "event") notes.push("All-six events are the special ones: keep them to about one a month.");
  notes.push("Group photos with 2+ people drift easily in ChatGPT: attach each person's master face in the order listed and reject any image where two faces blend.");

  return { kind, title: event, location: input.location?.trim() ?? "", timeOfDay: tod, lead, order, storyline, relationships, shots, posts, reel, notes };
}
