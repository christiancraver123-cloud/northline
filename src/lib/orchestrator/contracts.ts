// Structured request contract shared by the Create UI, natural-language parser, API and n8n webhook.
import { z } from "zod";
import { CONTENT_TYPES, PLATFORMS, TALENT_CODES } from "@/lib/domain/types";

const talentList = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.enum(TALENT_CODES)).min(1).max(6))
  .transform((a) => [...new Set(a)]);

/** Operator-written creative direction (replaces the rule-based Creative Director for one production / one regeneration). */
export const CreativeInputSchema = z.object({
    hook: z.string().trim().min(1).max(300), location: z.string().trim().min(1).max(300), outfit: z.string().trim().min(1).max(600),
    lighting: z.string().trim().min(1).max(300), storyBeat: z.string().trim().min(1).max(600),
    /** Optional shared continuity facts for multi-frame productions; anything omitted is derived from the brief and the canonical identity. */
    continuity: z.object({
      bag: z.string().trim().max(300), props: z.array(z.string().trim().min(1).max(200)).max(10), timeWindow: z.string().trim().max(300),
      cameraStyle: z.string().trim().max(300), locationProgression: z.array(z.string().trim().min(1).max(300)).max(10),
    }).partial().optional(),
    shots: z.array(z.object({ n: z.number().int().min(1).max(10), kind: z.enum(["IMG", "STORY"]).default("IMG"), description: z.string().trim().min(1).max(800), camera: z.string().trim().max(300).optional() })).min(1).max(10),
  });

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
  creative: CreativeInputSchema.optional(),
});
export type CreativeInput = z.input<typeof CreativeInputSchema>;
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type CreateRequestInput = z.input<typeof CreateRequestSchema>;
