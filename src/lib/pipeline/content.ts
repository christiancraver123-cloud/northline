// Content history + Content QA: evaluates structured production data against the creator's recent productions. Uses real Northline data only.
import type { Repo } from "@/lib/db/repo";
import type { Production, QaFindingRecord } from "@/lib/db/records";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { QaStatus } from "@/lib/domain/types";

const THEMES: [string, RegExp][] = [
  ["rooftop", /roof/i], ["nightlife", /night|lounge|\bbar\b|club|valet|honky|dive bar/i], ["beach", /beach|surf|coast|tide|boardwalk|lake/i],
  ["cafe", /coffee|caf[eé]|matcha/i], ["fitness", /pilates|gym|studio|workout/i], ["travel", /hotel|airport|trip|boutique/i], ["dining", /restaurant|dinner|wine/i], ["street", /street|city|boulevard/i],
];
export const themesOf = (...texts: (string | undefined)[]): string[] => { const t = texts.filter(Boolean).join(" "); return THEMES.filter(([, re]) => re.test(t)).map(([n]) => n); };

export interface ContentHistory { previous: Production[]; recentLocations: string[]; recentFormats: string[]; themeCounts: [string, number][] }

export async function contentHistory(repo: Repo, production: Pick<Production, "id" | "talent" | "createdAt">, n = 5): Promise<ContentHistory> {
  const previous = (await repo.list("productions"))
    .filter((p) => p.id !== production.id && p.talent[0] === production.talent[0] && p.status !== "REJECTED" && p.createdAt <= production.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, n);
  const counts = new Map<string, number>();
  for (const p of previous) for (const t of new Set(themesOf(p.brief?.location, p.concept))) counts.set(t, (counts.get(t) ?? 0) + 1);
  return { previous, recentLocations: previous.map((p) => p.brief?.location).filter(Boolean) as string[], recentFormats: previous.map((p) => p.contentType), themeCounts: [...counts].sort((a, b) => b[1] - a[1]) };
}

const ord = (n: number) => ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth"][n] ?? `${n}th`;

export interface ContentQaOutcome { status: Extract<QaStatus, "PASS" | "REVIEW">; findings: QaFindingRecord[]; summary: string; recommendation: string | null }

export async function evaluateContent(repo: Repo, production: Production): Promise<ContentQaOutcome> {
  const h = await contentHistory(repo, production);
  const first = ROSTER_BY_CODE[production.talent[0]].first;
  const mine = new Set(themesOf(production.brief?.location, production.concept));
  const findings: QaFindingRecord[] = [];
  const window = h.previous.length;
  for (const [theme, count] of h.themeCounts) {
    if (mine.has(theme) && count >= 2) findings.push({ lockId: null, severity: "REVIEW", message: `${ord(count + 1)} ${theme} production among ${first}'s previous ${window} productions` });
  }
  const loc = production.brief?.location;
  const locCount = loc ? h.recentLocations.filter((l) => l === loc).length : 0;
  if (locCount >= 2) findings.push({ lockId: null, severity: "REVIEW", message: `Location "${loc}" used ${locCount} times in ${first}'s previous ${window} productions` });
  const streak = [production.contentType, ...h.recentFormats].findIndex((f) => f !== production.contentType);
  if ((streak === -1 ? 1 + h.recentFormats.length : streak) >= 3) findings.push({ lockId: null, severity: "REVIEW", message: `${production.contentType} format used ${streak === -1 ? 1 + h.recentFormats.length : streak} productions in a row` });
  if (!findings.length) return { status: "PASS", findings, summary: `No repetition concerns against ${first}'s previous ${window} production(s).`, recommendation: null };
  const used = new Set(h.themeCounts.map(([t]) => t));
  const alt = ROSTER_BY_CODE[production.talent[0]].visual.environments.find((e) => !themesOf(e).some((t) => used.has(t)));
  return { status: "REVIEW", findings, summary: findings.map((f) => f.message).join("; "), recommendation: `Keep the asset but schedule it later${alt ? `, or produce a different-setting alternative (e.g. ${alt})` : ""}.` };
}
