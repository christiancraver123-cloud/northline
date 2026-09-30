// Natural-language -> structured CreateRequest. Deterministic v0 parser (an LLM orchestrator can replace it
// behind the same output contract). Returns issues instead of guessing when intent is unclear.
import { ROSTER } from "@/lib/talent/roster";
import { TALENT_CODES, type ContentType, type TalentCode } from "@/lib/domain/types";
import type { CreateRequest } from "./contracts";

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function detectTalent(text: string): TalentCode[] {
  const lower = text.toLowerCase();
  let talent: TalentCode[] = ROSTER.filter((t) => new RegExp(`\\b${t.first.toLowerCase()}\\b|\\b${t.name.split(" ")[1].toLowerCase()}\\b`).test(lower)).map((t) => t.code);
  for (const c of TALENT_CODES) if (new RegExp(`\\b${c.toLowerCase()}\\b`).test(lower) && !talent.includes(c)) talent.push(c);
  if (/\b(all six|all 6|six[- ]creators?|everyone|all creators|whole roster|entire roster)\b/.test(lower)) talent = [...TALENT_CODES];
  return talent;
}

export interface ParsedIntent { request: CreateRequest | null; issues: string[] }

export function parseIntent(text: string): ParsedIntent {
  const s = text.trim();
  const lower = s.toLowerCase();
  const issues: string[] = [];
  if (!s) return { request: null, issues: ["Describe what to create."] };

  let talent: TalentCode[] = ROSTER.filter((t) => new RegExp(`\\b${t.first.toLowerCase()}\\b|\\b${t.name.split(" ")[1].toLowerCase()}\\b`).test(lower)).map((t) => t.code);
  for (const c of TALENT_CODES) if (new RegExp(`\\b${c.toLowerCase()}\\b`).test(lower) && !talent.includes(c)) talent.push(c);
  if (/\b(all six|all 6|six[- ]creators?|everyone|all creators|whole roster|entire roster)\b/.test(lower)) talent = [...TALENT_CODES];
  if (!talent.length) issues.push("No creator recognised. Name at least one of: Sienna, Alessia, Mila, Vesper, Zoe, Skye.");

  let format: ContentType | null = null;
  if (/\bcampaign\b/.test(lower)) format = "CAMPAIGN";
  else if (/\bcollab/.test(lower)) format = "COLLAB";
  else if (/\breels?\b/.test(lower)) format = "REEL";
  else if (/\bcarousels?\b/.test(lower)) format = "CAROUSEL";
  else if (/\bstor(y|ies)\b/.test(lower)) format = "STORY";
  else if (/\bposts?\b/.test(lower)) format = "POST";
  if (!format) { format = "POST"; }

  let quantity = 1;
  const num = lower.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,2}?(posts?|carousels?|reels?|stor(?:y|ies))\b/);
  if (num) quantity = Math.min(10, NUM[num[1]] ?? parseInt(num[1], 10));

  // Concept: strip the command scaffolding, keep the creative gist.
  let concept = s
    .replace(/^\s*(please\s+)?(create|make|build|give|generate|produce|plan)\s+/i, "")
    .replace(/\b(a|an|the|me)\b\s*/gi, (m, _w, off) => (off === 0 ? "" : m))
    .replace(/\b(for|with|between|involving)\s+(all six creators|all six|everyone|[A-Za-z, &]+?)(?=$|[.,])/i, (m) =>
      ROSTER.some((t) => m.toLowerCase().includes(t.first.toLowerCase())) || /all six|everyone/i.test(m) ? "" : m)
    .replace(/\b(carousels?|reels?|posts?|campaigns?|collabs?|stor(?:y|ies))\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, "");
  if (concept.length < 3) concept = "";

  if (issues.length) return { request: null, issues };
  return { request: { talent, platform: "instagram", format, concept, quantity }, issues: [] };
}
