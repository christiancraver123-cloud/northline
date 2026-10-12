// Publishing provider abstraction. Provider-specific code lives only in adapters here.
//  MOCK_INSTAGRAM — no network, deterministic, simulates SUCCESS / FAILURE / RETRYABLE FAILURE so the workflow and UI can be tested.
//  META_INSTAGRAM — FUTURE. Not implemented: it refuses every call. Live Instagram is blocked (account suspended, Meta verification pending).
import { ProviderError } from "@/lib/providers/types";
import type { TalentCode } from "@/lib/domain/types";

export type PublishProviderName = "MOCK_INSTAGRAM" | "META_INSTAGRAM";
export type MockOutcome = "success" | "failure" | "retryable";
export const MOCK_OUTCOMES: MockOutcome[] = ["success", "failure", "retryable"];

export interface PublishRequest { publicationId: string; talent: TalentCode; handle: string | null; imageUrl: string | null; caption: string; attempt: number; mockOutcome?: MockOutcome }
export interface PublishResult { providerPostId: string; permalink: string }
export interface InsightsSnapshot { views: number; reach: number; likes: number; comments: number; shares: number; saves: number; profileVisits: number; follows: number }

export interface PublishProvider {
  readonly name: PublishProviderName;
  readonly live: boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
  insights(post: { providerPostId: string; publishedAt: string; talent: TalentCode }, now?: Date): Promise<InsightsSnapshot>;
}

/** Small deterministic hash so mock numbers are stable per post (and visibly fake: they always come with source "mock"). */
function seed(s: string): number { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function mockInstagram(env: Record<string, string | undefined> = process.env): PublishProvider {
  return {
    name: "MOCK_INSTAGRAM", live: false,
    async publish(req) {
      const outcome = req.mockOutcome ?? (["success", "failure", "retryable"].includes(env.NORTHLINE_MOCK_PUBLISH_OUTCOME ?? "") ? env.NORTHLINE_MOCK_PUBLISH_OUTCOME as MockOutcome : "success");
      if (outcome === "failure") throw new ProviderError("MOCK_INSTAGRAM", "simulated permanent failure (media rejected)", false, "invalid_request");
      // A retryable failure fails the FIRST attempt only, so a retry demonstrably succeeds.
      if (outcome === "retryable" && req.attempt <= 1) throw new ProviderError("MOCK_INSTAGRAM", "simulated temporary failure (provider unavailable)", true, "provider_unavailable");
      const id = `mock_${seed(req.publicationId).toString(36)}`;
      return { providerPostId: id, permalink: `mock://instagram/${req.handle ?? req.talent.toLowerCase()}/p/${id}` };
    },
    async insights(post, now = new Date()) {
      const r = seed(post.providerPostId), hours = Math.max(1, (now.getTime() - new Date(post.publishedAt).getTime()) / 3_600_000);
      const growth = Math.min(1, Math.log10(1 + hours) / 2); // ramps over ~4 days
      const views = Math.round((400 + (r % 4600)) * growth), reach = Math.round(views * (0.62 + ((r >> 3) % 25) / 100));
      const likes = Math.round(reach * (0.03 + ((r >> 5) % 60) / 1000)), comments = Math.round(likes * (0.03 + ((r >> 7) % 8) / 100));
      return { views, reach, likes, comments, shares: Math.round(likes * (0.05 + ((r >> 9) % 10) / 100)), saves: Math.round(likes * (0.08 + ((r >> 11) % 12) / 100)), profileVisits: Math.round(reach * 0.015), follows: Math.round(reach * (0.002 + ((r >> 13) % 4) / 1000)) };
    },
  };
}

/** Placeholder for the real adapter. It never calls Meta. */
export const metaInstagram: PublishProvider = {
  name: "META_INSTAGRAM", live: true,
  async publish() { throw new ProviderError("META_INSTAGRAM", "live Instagram publishing is not implemented in this build (account blocked; no Meta adapter)", false, "provider_unavailable"); },
  async insights() { throw new ProviderError("META_INSTAGRAM", "live Instagram insights are not implemented in this build", false, "provider_unavailable"); },
};

export const engagementRate = (s: Pick<InsightsSnapshot, "likes" | "comments" | "shares" | "saves" | "reach">): number | null =>
  s.reach > 0 ? (s.likes + s.comments + s.shares + s.saves) / s.reach : null;
