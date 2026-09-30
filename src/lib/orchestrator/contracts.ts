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
});
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type CreateRequestInput = z.input<typeof CreateRequestSchema>;
