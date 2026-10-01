// Structured request contract shared by the Create UI, natural-language parser, API and n8n webhook.
import { z } from "zod";
import { CONTENT_TYPES, PLATFORMS, TALENT_CODES } from "@/lib/domain/types";

const talentList = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.enum(TALENT_CODES)).min(1).max(6))
  .transform((a) => [...new Set(a)]);

export const CreateRequestSchema = z.object({
  talent: talentList,
  platform: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(PLATFORMS)).default("instagram"),
  format: z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.enum(CONTENT_TYPES)),
  concept: z.string().trim().max(500).default(""),
  quantity: z.number().int().min(1).max(10).default(1),
  asset_count: z.number().int().min(1).max(10).optional(),
  campaign_name: z.string().trim().max(120).optional(),
  /** Optional dedupe key (n8n retries): the same key never creates a second production run. */
  idempotency_key: z.string().trim().min(1).max(120).optional(),
  /** Optional operator-written creative direction (solo, non-campaign requests). When present it replaces the rule-based Creative Director. */
  creative: z.object({
    hook: z.string().trim().min(1).max(300), location: z.string().trim().min(1).max(300), outfit: z.string().trim().min(1).max(600),
    lighting: z.string().trim().min(1).max(300), storyBeat: z.string().trim().min(1).max(600),
    shots: z.array(z.object({ n: z.number().int().min(1).max(10), kind: z.enum(["IMG", "STORY"]).default("IMG"), description: z.string().trim().min(1).max(800), camera: z.string().trim().max(300).optional() })).min(1).max(10),
  }).optional(),
});
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type CreateRequestInput = z.input<typeof CreateRequestSchema>;
