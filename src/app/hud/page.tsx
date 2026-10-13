// Command HUD: a full-screen mission-control view of the studio. Read-only; every figure comes from the same data the
// dashboard uses (nothing invented). Clicking a monitor opens the page that owns that data.
import { getRepo, storeDriver } from "@/lib/db";
import { loadDashboard } from "@/lib/ops/dashboard";
import { loadPortraits } from "@/lib/talent/portraits-server";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { instagramStatus } from "@/lib/flags";
import { isReadOnly } from "@/lib/runtime/mode";
import { nyDay } from "@/lib/ops/tonight";
import { approvalBlockers } from "@/lib/orchestrator/approvals";
import { Hud, type HudData } from "@/components/hud/Hud";

export const dynamic = "force-dynamic";

export default async function HudPage() {
  const repo = await getRepo();
  const now = new Date();
  const [d, portraits, assets, refs, events, cal, prods, approvals] = await Promise.all([
    loadDashboard(repo, now), loadPortraits(repo), repo.list("assets"), repo.list("referenceAssets"), repo.list("agentEvents"), repo.list("calendarEntries"), repo.list("productions"), repo.list("approvals"),
  ]);
  const prodBy = new Map(prods.map((p) => [p.id, p]));
  const imgs = assets.filter((a) => a.current && a.kind === "IMG" && a.storagePath);
  const pendingBy = (code: string) => d.approvals.filter((a) => a.production.talent[0] === code).length;
  const today = nyDay(now);
  const since = now.getTime() - 24 * 3600_000;
  // Activity per hour, last 24h: agent events + approval decisions + new images. Real timestamps only.
  const stamps = [...events.map((e) => e.createdAt), ...approvals.filter((a) => a.decidedAt).map((a) => a.decidedAt!), ...imgs.map((a) => a.createdAt)].map((s) => new Date(s).getTime()).filter((t) => t >= since);
  const activity = Array.from({ length: 24 }, (_, i) => stamps.filter((t) => t >= since + i * 3600_000 && t < since + (i + 1) * 3600_000).length);
  const decided = approvals.filter((a) => a.state !== "PENDING" && a.decidedAt).map((a) => ({ at: a.decidedAt!, level: "info" as const, kind: a.state === "APPROVED" ? "approved" : a.state === "REJECTED" ? "denied" : a.state.toLowerCase(), message: `${prodBy.get(a.productionId)?.code ?? "production"} by ${a.decidedBy ?? "you"}` }));
  const log = [...events.map((e) => ({ at: e.createdAt, level: e.level, kind: e.kind, message: e.message })), ...decided, ...imgs.slice(-40).map((a) => ({ at: a.createdAt, level: "info" as const, kind: "image in", message: `${a.talent[0]} · ${a.filename.split("/").pop()}` }))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 28);
  const ig = instagramStatus();

  const data: HudData = {
    generatedAt: now.toISOString(),
    creators: d.creators.map((c) => ({
      code: c.code, name: c.name, first: ROSTER_BY_CODE[c.code].first, color: c.color, portrait: portraits[c.code].url, active: c.active,
      priority: c.priority.score, ready: c.approvedReady, pending: pendingBy(c.code), images: imgs.filter((a) => a.talent[0] === c.code).length,
      refs: refs.filter((r) => r.talent === c.code && r.status === "ACTIVE").length, lastPost: c.lastContentAt, city: ROSTER_BY_CODE[c.code].markets[0] ?? "",
    })),
    queue: await Promise.all(d.approvals.slice(0, 200).map(async (a) => ({ id: a.approvalId, code: a.production.code, concept: a.production.concept, talent: a.production.talent[0], color: ROSTER_BY_CODE[a.production.talent[0]].color, thumb: a.asset?.storagePath ? `/api/assets/${a.asset.id}/file` : null, qa: a.triad?.overall ?? "NOT RUN", age: a.ageHours, blockers: await approvalBlockers(repo, a.production.id) }))),
    pending: d.approvals.length,
    pipeline: d.pipeline.map((p) => ({ key: p.key, label: p.label, count: p.count })),
    system: {
      mode: isReadOnly() ? "Read-only" : "Online", store: storeDriver() === "file" ? "This Mac" : "Cloud", instagram: ig.state === "BLOCKED" ? "Blocked" : ig.label,
      governor: d.cc.system.governor, autonomous: d.cc.system.autonomousGeneration, imagesToday: d.cc.budget.imagesToday.total,
      queue: { queued: d.cc.queue.queued, running: d.cc.queue.running, failed: d.cc.queue.failed, blocked: d.cc.queue.blocked },
      providers: d.cc.providers.map((p) => ({ label: p.label, state: p.state })),
    },
    totals: { images: imgs.length, refs: refs.filter((r) => r.status === "ACTIVE").length, productions: prods.length, approved: assets.filter((a) => a.current && a.status === "APPROVED").length },
    activity,
    log,
    schedule: cal.filter((c) => c.state !== "PUBLISHED" && c.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6).map((c) => ({ date: c.date, time: c.time, talent: c.talent, color: ROSTER_BY_CODE[c.talent].color, code: prodBy.get(c.productionId)?.code ?? "", productionId: c.productionId })),
    attention: d.attention.slice(0, 8).map((a) => ({ text: a.text, tone: a.tone, href: a.href })),
  };
  return <Hud data={data} />;
}
