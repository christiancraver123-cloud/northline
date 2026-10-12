// Model cost tiers. Routine work must not default to expensive models.
//   cheap   — classification, formatting, simple QA, captions, summaries
//   normal  — standard agent work
//   premium — planning / difficult strategy only
// Tiers map onto the providers that exist (Gemini, OpenAI). Model names come from env so nothing is guessed:
//   GEMINI_MODEL_CHEAP / GEMINI_MODEL_NORMAL / GEMINI_MODEL_PREMIUM, OPENAI_TEXT_MODEL_CHEAP / _NORMAL / _PREMIUM.
// Unset → the provider's default model (and the UI says "provider default").
import type { AgentCode } from "@/lib/db/records";
import type { LlmProviderName } from "./types";

export type Tier = "cheap" | "normal" | "premium";
const CHEAP = new Set(["content_qa.review", "content_qa.audit", "technical_qa.attempt", "production.digest", "orchestrator.consolidate", "caption.write", "dm.classify"]);
const PREMIUM = new Set(["growth.recommendations"]);
export const tierForKind = (kind: string): Tier => (CHEAP.has(kind) ? "cheap" : PREMIUM.has(kind) ? "premium" : "normal");

/** Display tier per agent (what its typical work needs). Identity QA stays on an explicit operator choice (never auto-routed). */
export const AGENT_TIER: Record<AgentCode, Tier | "rules"> = {
  ORCHESTRATOR: "normal", CONTENT_STRATEGIST: "normal", CREATIVE_DIRECTOR: "normal", PROMPT_ENGINEER: "rules", CAPTION_WRITER: "cheap",
  IDENTITY_QA: "normal", CONTENT_QA: "cheap", PRODUCTION_MANAGER: "rules", PERFORMANCE_AGENT: "normal", GROWTH_STRATEGIST: "premium",
};

const KEY: Record<Exclude<LlmProviderName, "mock">, string> = { gemini: "GEMINI_MODEL", openai: "OPENAI_TEXT_MODEL" };
/** Configured model for a provider + tier, or undefined (= provider default). Never invents a model name. */
export function tierModel(provider: LlmProviderName, tier: Tier, env: Record<string, string | undefined> = process.env): string | undefined {
  if (provider === "mock") return undefined;
  const v = env[`${KEY[provider]}_${tier.toUpperCase()}`]?.trim();
  return v || undefined;
}
