// Caption writer. Free path: creator-voice templates (deterministic). AI path (when a text model is configured): the model
// writes in her voice from her voice card; output is checked the same way. Pure helpers here; the server call is in ./service.
import type { TalentCode } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";

export interface CaptionContext { concept: string; location?: string; scene?: string }

/** Short lowercase "thing" from the concept: "Imported image (x.png)" and file names are ignored. */
export function topicOf(ctx: CaptionContext): string {
  const raw = [ctx.scene, ctx.concept].find((s) => s && !/^imported image|\.(png|jpe?g|webp)\)?$/i.test(s.trim())) ?? "";
  return raw.replace(/\(collab\).*$/i, "").replace(/[—–-].*$/, "").replace(/[.!?]+$/, "").trim().toLowerCase().slice(0, 60);
}

const POOLS: Record<TalentCode, { withTopic: string[]; plain: string[] }> = {
  SIE: { withTopic: ["{t}. not sorry.", "{t} and zero regrets", "told myself one {t}. lied.", "{t} hits different in miami"], plain: ["caught in 4k golden hour. not sorry.", "miami, you're doing too much (thank you)", "main character energy, side character budget", "sun's out, phone's out"] },
  ALE: { withTopic: ["{t}. don't ask.", "{t}, quietly.", "{t}. you had to be there.", "an evening: {t}"], plain: ["don't ask.", "paris, again.", "the details are the point.", "later than planned. worth it."] },
  MIL: { withTopic: ["{t} and i'm not ok (in a good way)", "{t} w the girls. i was the problem", "y'all. {t}.", "{t} >>> literally everything"], plain: ["we said one drink btw", "nashville you have my whole heart", "dressed up for no reason. again", "this is my sign to go outside"] },
  VES: { withTopic: ["{t}. seemed reasonable at the time.", "{t}. worth it.", "{t}, after dark.", "{t}. no notes."], plain: ["seemed reasonable at the time.", "la after midnight.", "don't wait up.", "quiet night. loud thoughts."] },
  ZOE: { withTopic: ["{t} + matcha = no notes", "{t}. phone stayed in the bag. mostly.", "slow morning, {t}, good people", "{t} era 🌿"], plain: ["matcha first, everything else second ✨", "soft life, strong core", "la mornings are a love language", "hydrate, stretch, repeat"] },
  SKY: { withTopic: ["{t}. sand in places. worth it.", "{t} before the crowds 🌊", "{t} with the dog (he's the star)", "{t}. salty hair, no plans."], plain: ["dawn patrol, no regrets 🌊", "san diego sunsets do not miss", "salt water fixes everything", "the dog insisted"] },
};
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Three caption options in her voice. Deterministic for the same input; `seed` rotates the picks ("Write more"). */
export function templateCaptions(code: TalentCode, ctx: CaptionContext, n = 3, seed = 0): string[] {
  const pool = POOLS[code], topic = topicOf(ctx), out: string[] = [];
  const src = topic ? [...pool.withTopic.map((s) => s.replace("{t}", topic)), ...pool.plain] : [...pool.plain, ROSTER_BY_CODE[code].voice.sample];
  const start = (hash(code + topic) + seed * n) % src.length;
  for (let i = 0; out.length < n && i < src.length * 2; i++) { const c = src[(start + i) % src.length]; if (!out.includes(c)) out.push(c); }
  return out;
}

/** 3–5 non-branded hashtags from her market and lifestyle. Never brand names. */
export function hashtagsFor(code: TalentCode): string[] {
  const t = ROSTER_BY_CODE[code];
  const tags = [...t.markets, ...t.visual.lifestyle.slice(0, 3)].map((s) => "#" + s.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((s) => s.length > 2);
  return [...new Set(tags)].slice(0, 5);
}

/** Line added to captions so the AI disclosure travels with the post (the account bio + Instagram's AI label still apply). */
export const AI_TAG = "#aigenerated";

const BANNED = [/\b(nude|naked|nsfw|explicit|onlyfans|xxx)\b/i, /\b(nike|adidas|gucci|chanel|prada|starbucks|apple|lululemon)\b/i, /\b(school ?girl|teen|underage)\b/i];
/** Keep only safe, reasonable captions: no explicit words, no real brands, not empty, not huge. */
export function cleanCaptions(list: unknown[]): string[] {
  return [...new Set(list.filter((x): x is string => typeof x === "string").map((s) => s.replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "")))]
    .filter((s) => s.length >= 3 && s.length <= 300 && !BANNED.some((r) => r.test(s)));
}

export function captionPrompt(code: TalentCode, ctx: CaptionContext, avoid: string[]): { system: string; prompt: string } {
  const t = ROSTER_BY_CODE[code];
  return {
    system: "You write short Instagram captions for a clearly-adult fictional virtual creator. Stay in her voice. No hashtags, no brand names, no real people, nothing explicit. Reply with JSON only: {\"captions\": [\"...\", \"...\", \"...\"]}.",
    prompt: [`Creator: ${t.name} (${t.age}), ${t.markets.join(" / ")}. Personality: ${t.personality.slice(0, 5).join(", ")}.`, `Voice: ${t.voice.tone}. Style: ${t.voice.style}. Example: "${t.voice.sample}"`,
      `Post: ${ctx.scene || ctx.concept}${ctx.location ? ` — ${ctx.location}` : ""}.`, avoid.length ? `Don't repeat these: ${avoid.join(" | ")}` : "", "Write 3 different options, each under 120 characters."].filter(Boolean).join("\n"),
  };
}
