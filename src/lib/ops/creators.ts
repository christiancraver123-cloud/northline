// Per-creator operational overview for the Command Center. PURE derivation from persisted rows; nothing invented.
// Where a value has no source (e.g. no published posts, no insights) it is null and the UI says so.
import type { AgentTask, AnalyticsRecord, Asset, CalendarEntry, LaunchState, Production, ProviderJob, Publication, Storyline } from "@/lib/db/records";
import type { TalentCode } from "@/lib/domain/types";
import { ROSTER } from "@/lib/talent/roster";
import { engagementRate } from "@/lib/publishing/provider";
import { DEFAULT_WEIGHTS, scoreCreator, type PriorityInput, type PriorityResult, type PriorityWeights } from "@/lib/priority";

export interface CreatorOverview {
  code: TalentCode; name: string; color: string; active: boolean; aiDisclosure: boolean;
  storyline: string | null;
  lastContentAt: string | null;   // last PUBLISHED post (publications), else null
  lastProducedAt: string | null;  // last production created
  nextPlanned: string | null;     // next calendar slot (date time)
  approvedReady: number;          // approved, unpublished, current image assets
  awaitingApproval: number;       // productions in REVIEW
  inProduction: number;           // GENERATING / RAW
  published: number;
  engagementRate: number | null;  // average of each post's latest snapshot; mock data flagged separately
  insightsAreMock: boolean;
  postingGapDays: number | null;
  failures7d: number;
  agentActivity: string | null;   // title of a RUNNING task for this creator
  priority: PriorityResult;
}

export interface CreatorRows {
  productions: Production[]; assets: Asset[]; publications: Publication[] | null; analytics: AnalyticsRecord[]; calendar: CalendarEntry[];
  jobs: ProviderJob[]; launch: LaunchState[]; storylines: Storyline[]; tasks: AgentTask[];
}

const DAY = 86_400_000;
/** Latest snapshot per publication (rows are oldest-first, so a later row wins a timestamp tie). */
export function latestInsights(rows: AnalyticsRecord[]): AnalyticsRecord[] {
  const by = new Map<string, AnalyticsRecord>();
  for (const r of rows) { if (!r.publicationId) continue; const p = by.get(r.publicationId); if (!p || r.createdAt >= p.createdAt) by.set(r.publicationId, r); }
  return [...by.values()];
}
const er = (r: AnalyticsRecord) => engagementRate({ likes: r.likes ?? 0, comments: r.comments ?? 0, shares: r.shares ?? 0, saves: r.saves ?? 0, reach: r.reach ?? 0 });

export function creatorOverviews(rows: CreatorRows, now = new Date(), w: PriorityWeights = DEFAULT_WEIGHTS): CreatorOverview[] {
  const today = now.toISOString().slice(0, 10), in2 = new Date(now.getTime() + 2 * DAY).toISOString().slice(0, 10), since7 = new Date(now.getTime() - 7 * DAY).toISOString();
  const prodById = new Map(rows.productions.map((p) => [p.id, p]));
  const snaps = latestInsights(rows.analytics);
  const rate = (xs: AnalyticsRecord[]) => { const v = xs.map(er).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rosterRate = rate(snaps);
  const base = ROSTER.map((t) => {
    const prods = rows.productions.filter((p) => p.talent[0] === t.code);
    const pubs = (rows.publications ?? []).filter((p) => p.talent === t.code && p.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const mySnaps = snaps.filter((s) => s.talent === t.code);
    const launch = rows.launch.find((l) => l.talent === t.code);
    const cal = rows.calendar.filter((c) => c.talent === t.code && c.state !== "PUBLISHED" && c.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const lastContentAt = pubs[0]?.publishedAt ?? null;
    const approvedReady = rows.assets.filter((a) => a.talent[0] === t.code && a.current && a.kind === "IMG" && a.status === "APPROVED" && a.publication !== "PUBLISHED").length;
    const failures7d = rows.jobs.filter((j) => j.operation === "image.generate" && j.state === "FAILED" && j.failureCategory !== "budget_blocked" && (j.finishedAt ?? j.createdAt) >= since7 && prodById.get(j.productionId)?.talent[0] === t.code).length;
    const running = rows.tasks.find((x) => x.status === "RUNNING" && (x.talent === t.code || prodById.get(x.productionId ?? "")?.talent[0] === t.code));
    const story = rows.storylines.find((s) => s.status === "ACTIVE" && s.talent.includes(t.code));
    const o = {
      code: t.code, name: t.name, color: t.color, active: t.launchStatus === "active", aiDisclosure: !!launch?.aiDisclosure,
      storyline: story ? story.title : null,
      lastContentAt, lastProducedAt: prods.map((p) => p.createdAt).sort().at(-1) ?? null,
      nextPlanned: cal[0] ? `${cal[0].date} ${cal[0].time}` : null,
      approvedReady, awaitingApproval: prods.filter((p) => p.status === "REVIEW").length, inProduction: prods.filter((p) => p.status === "GENERATING" || p.status === "RAW").length,
      published: pubs.length, engagementRate: rate(mySnaps), insightsAreMock: mySnaps.some((s) => s.source === "mock"),
      postingGapDays: lastContentAt ? Math.floor((now.getTime() - new Date(lastContentAt).getTime()) / DAY) : null,
      failures7d, agentActivity: running?.title ?? null,
    };
    const input: PriorityInput = { code: t.code, name: t.name, active: o.active, daysSinceLastPost: o.postingGapDays, approvedReady, plannedWithin2Days: cal.filter((c) => c.date <= in2).length, engagementRate: o.engagementRate, rosterEngagementRate: rosterRate, failures7d };
    return { ...o, priority: scoreCreator(input, w) };
  });
  return base;
}
