// Creator priority: a transparent, explainable score (0-100) of which creator most needs attention / content next.
// PURE. It never generates, spends or publishes anything — it only ranks. Every point is attributed to a named reason.
// Weights are explicit and can be overridden with NORTHLINE_PRIORITY_WEIGHTS='{"perGapDay":5,...}' (unknown keys are ignored).
import type { TalentCode } from "@/lib/domain/types";

export interface PriorityWeights {
  base: number;            // starting score for an active creator
  perGapDay: number;       // + per day since the last published post
  maxGap: number;          // cap on the posting-gap contribution
  neverPosted: number;     // + when an active creator has never posted
  noApprovedContent: number; // + when nothing approved is ready to publish
  perApprovedReady: number;  // − per approved, unpublished asset ready (backlog lowers urgency)
  maxBacklogRelief: number;
  dueSoonWithoutContent: number; // + when something is planned within 2 days but nothing approved is ready
  engagementSwing: number;   // ± up to this much for engagement vs the roster average (only when data exists)
  perRecentFailure: number;  // + per failed generation in 7 days (production needs attention)
  maxFailures: number;
  setupMultiplier: number;   // creators still in setup are scaled down
}
export const DEFAULT_WEIGHTS: PriorityWeights = {
  base: 30, perGapDay: 4, maxGap: 36, neverPosted: 15, noApprovedContent: 15, perApprovedReady: 3, maxBacklogRelief: 15,
  dueSoonWithoutContent: 10, engagementSwing: 12, perRecentFailure: 3, maxFailures: 9, setupMultiplier: 0.5,
};
export function weightsFromEnv(env: Record<string, string | undefined> = process.env): PriorityWeights {
  if (!env.NORTHLINE_PRIORITY_WEIGHTS) return DEFAULT_WEIGHTS;
  try {
    const o = JSON.parse(env.NORTHLINE_PRIORITY_WEIGHTS) as Record<string, unknown>;
    const w = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(w) as (keyof PriorityWeights)[]) if (typeof o[k] === "number" && Number.isFinite(o[k])) w[k] = o[k] as number;
    return w;
  } catch { return DEFAULT_WEIGHTS; }
}

export interface PriorityInput {
  code: TalentCode; name: string; active: boolean;
  daysSinceLastPost: number | null; // null = never posted
  approvedReady: number;            // approved, unpublished image assets
  plannedWithin2Days: number;       // calendar entries in the next 2 days
  engagementRate: number | null;    // this creator's recent average (null = no data)
  rosterEngagementRate: number | null;
  failures7d: number;
}
export interface PriorityResult { code: TalentCode; name: string; score: number; reasons: string[]; parts: { reason: string; points: number }[] }

export function scoreCreator(i: PriorityInput, w: PriorityWeights = DEFAULT_WEIGHTS): PriorityResult {
  const parts: { reason: string; points: number }[] = [{ reason: "base", points: w.base }];
  const add = (points: number, reason: string) => { if (points) parts.push({ reason, points: Math.round(points * 10) / 10 }); };
  if (i.daysSinceLastPost === null) add(i.active ? w.neverPosted : 0, "has never posted");
  else add(Math.min(w.maxGap, i.daysSinceLastPost * w.perGapDay), `${i.daysSinceLastPost} day posting gap`);
  if (i.approvedReady === 0) add(w.noApprovedContent, "no approved content queued");
  else add(-Math.min(w.maxBacklogRelief, i.approvedReady * w.perApprovedReady), `${i.approvedReady} approved asset(s) ready`);
  if (i.plannedWithin2Days > 0 && i.approvedReady === 0) add(w.dueSoonWithoutContent, "content planned within 2 days but none approved");
  if (i.engagementRate != null && i.rosterEngagementRate != null && i.rosterEngagementRate > 0) {
    const rel = Math.max(-1, Math.min(1, (i.engagementRate - i.rosterEngagementRate) / i.rosterEngagementRate));
    add(rel * w.engagementSwing, rel >= 0 ? "engagement above roster average" : "engagement below roster average");
  }
  add(Math.min(w.maxFailures, i.failures7d * w.perRecentFailure), `${i.failures7d} failed generation(s) in 7 days`);
  let score = parts.reduce((s, p) => s + p.points, 0);
  if (!i.active) { score *= w.setupMultiplier; parts.push({ reason: "account still in setup (score scaled down)", points: 0 }); }
  score = Math.round(Math.max(0, Math.min(100, score)));
  const reasons = parts.filter((p) => p.reason !== "base" && (p.points !== 0 || p.reason.startsWith("account"))).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map((p) => p.reason);
  return { code: i.code, name: i.name, score, reasons, parts };
}

export const rankCreators = (xs: PriorityInput[], w: PriorityWeights = DEFAULT_WEIGHTS) => xs.map((x) => scoreCreator(x, w)).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
