// Founder dashboard view-model. Loads rows once, derives the "10-second" picture. Read-only: never writes or calls a provider.
// Honesty: unknown values say UNKNOWN / NOT CONFIGURED / BLOCKED. Nothing is reported healthy without evidence.
import type { Repo } from "@/lib/db/repo";
import type { Asset, Production, Publication, QaResult } from "@/lib/db/records";
import { loadCommandCenter } from "./load";
import { creatorOverviews, type CreatorOverview } from "./creators";
import type { CommandCenter } from "./command-center";
import { listIfMigrated } from "@/lib/publishing/service";
import { resolveImageProvider } from "@/lib/providers";
import { instagramStatus, publishingMode } from "@/lib/flags";
import { weightsFromEnv } from "@/lib/priority";
import { qaTriad, type Triad } from "@/lib/pipeline/qa-triad";
import { isReadOnly } from "@/lib/runtime/mode";

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";
export interface StatusItem { label: string; value: string; tone: Tone; href?: string; title?: string }
export interface AttentionItem { text: string; tone: Tone; href: string; count?: number }
export interface PipelineStage { key: string; label: string; count: number; note: string }
export interface ApprovalCard { approvalId: string; production: Production; asset: Asset | null; triad: Triad | null; ageHours: number; provider: string; costUsd: number | null }
export interface SystemRow { name: string; state: string; tone: Tone; detail: string }

export interface Dashboard {
  status: StatusItem[]; attention: AttentionItem[]; creators: CreatorOverview[]; pipeline: PipelineStage[]; approvals: ApprovalCard[];
  system: SystemRow[]; cc: CommandCenter; publicationsMigrated: boolean; recentPublications: Publication[];
  /** Active MASTER_FACE reference id per creator (canonical avatar), if uploaded. */
  masters: Record<string, string>;
}

const H = 3_600_000, D = 24 * H;

export async function loadDashboard(repo: Repo, now = new Date(), env: Record<string, string | undefined> = process.env): Promise<Dashboard> {
  const [cc, productions, assets, approvals, jobs, tasks, calendar, launch, storylines, analytics, qa, refs] = await Promise.all([
    loadCommandCenter(repo, now), repo.list("productions"), repo.list("assets"), repo.list("approvals", { state: "PENDING" }), repo.list("providerJobs"), repo.list("agentTasks"),
    repo.list("calendarEntries"), repo.list("launchStates"), repo.list("storylines"), repo.list("analytics"), repo.list("qaResults"), repo.list("referenceAssets"),
  ]);
  const publications = await listIfMigrated(repo, "publications");
  const creators = creatorOverviews({ productions, assets, publications, analytics, calendar, jobs, launch, storylines, tasks }, now, weightsFromEnv(env)).sort((a, b) => b.priority.score - a.priority.score);
  const img = resolveImageProvider(env as NodeJS.ProcessEnv);
  const ig = instagramStatus(env);
  const since7 = new Date(now.getTime() - 7 * D).toISOString(), today = now.toISOString().slice(0, 10), todayStart = `${today}T00:00:00.000Z`;
  const imageJobs = jobs.filter((j) => j.operation === "image.generate");
  const failedJobs = imageJobs.filter((j) => j.state === "FAILED" && j.failureCategory !== "budget_blocked" && (j.finishedAt ?? j.createdAt) >= since7);
  const runningJobs = jobs.filter((j) => j.state === "SUBMITTED" || j.state === "PROCESSING" || j.state === "QUEUED").length + tasks.filter((t) => t.status === "RUNNING").length;
  const spendToday = imageJobs.filter((j) => j.state === "SUCCEEDED" && (j.finishedAt ?? "") >= todayStart && j.provider !== "mock");
  const spendKnown = spendToday.every((j) => j.costUsd != null);
  const spend = spendToday.length === 0 ? "$0" : spendKnown ? `$${spendToday.reduce((s, j) => s + (j.costUsd ?? 0), 0).toFixed(2)}` : "UNKNOWN";
  const limits = cc.budget.limits, global = Array.isArray(limits) ? limits.find((l) => l.metric === "images_per_day" && l.scope === "global" && l.enabled) : undefined;
  const remaining = cc.budget.governor === "OFF" ? "no limit (governor off)" : !Array.isArray(limits) ? String(limits) : global ? `${Math.max(0, global.limit - global.used)} images left` : "no daily limit set";

  const status: StatusItem[] = [
    { label: "Environment", value: cc.system.mode.toUpperCase(), tone: cc.system.mode === "read-only" ? "warn" : cc.system.mode === "production" ? "info" : "mute" },
    { label: "Read-only", value: isReadOnly(env) ? "ON" : "OFF", tone: isReadOnly(env) ? "warn" : "mute" },
    { label: "Governor", value: cc.budget.governor + (cc.budget.pause.paused === true ? " · PAUSED" : ""), tone: cc.budget.pause.paused === true ? "bad" : cc.budget.governor === "ON" ? "ok" : "warn" },
    { label: "Autonomous gen", value: cc.system.autonomousGeneration, tone: cc.system.autonomousGeneration === "ENABLED" ? "bad" : "ok" },
    { label: "Instagram", value: ig.state, tone: "bad", title: ig.detail, href: "/inbox" },
    { label: "Image provider", value: img.mode === "unavailable" ? "NOT CONFIGURED" : img.mode === "mock" ? "MOCK" : `${img.provider.name.toUpperCase()}`, tone: img.mode === "unavailable" ? "bad" : img.mode === "mock" ? "warn" : "ok", title: img.reason ?? undefined, href: "/settings" },
    { label: "Running", value: String(runningJobs), tone: runningJobs ? "info" : "mute", href: "/agents" },
    { label: "Failed (7d)", value: String(failedJobs.length), tone: failedJobs.length ? "bad" : "mute", href: "/productions?status=FAILED" },
    { label: "Approvals", value: String(approvals.length), tone: approvals.length ? "warn" : "mute", href: "/approvals" },
    { label: "Images today", value: String(cc.budget.imagesToday.total), tone: "mute" },
    { label: "Spend today", value: spend, tone: spend === "UNKNOWN" ? "warn" : "mute", title: "From recorded provider costs. UNKNOWN = a paid job has no recorded price (set pricing to fix)." },
    { label: "Budget left", value: remaining, tone: "mute" },
  ];

  const overdue = calendar.filter((c) => c.date < today && c.state !== "PUBLISHED");
  const gaps = creators.filter((c) => c.active && (c.postingGapDays === null || c.postingGapDays >= 3));
  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const attention: AttentionItem[] = [
    { text: ig.label + " — publishing and insights are mock-only", tone: "bad", href: "/inbox" },
    ...(failedJobs.length ? [{ text: `${failedJobs.length} failed image job(s) in the last 7 days`, tone: "bad" as Tone, href: "/productions?status=FAILED", count: failedJobs.length }] : []),
    ...(blocked.length ? [{ text: `${blocked.length} blocked task(s): ${blocked[0].blockedReason ?? blocked[0].kind}`, tone: "bad" as Tone, href: "/agents", count: blocked.length }] : []),
    ...(approvals.length ? [{ text: `${approvals.length} production(s) waiting for your approval`, tone: "warn" as Tone, href: "/approvals", count: approvals.length }] : []),
    ...gaps.map((c) => ({ text: c.postingGapDays === null ? `${c.name.split(" ")[0]} has never posted` : `${c.name.split(" ")[0]}: ${c.postingGapDays}-day posting gap`, tone: "warn" as Tone, href: `/talent/${c.code}` })),
    ...(overdue.length ? [{ text: `${overdue.length} planned post(s) past their date`, tone: "warn" as Tone, href: "/calendar", count: overdue.length }] : []),
    ...(img.mode === "unavailable" ? [{ text: `Image provider not configured: ${img.reason}`, tone: "warn" as Tone, href: "/settings" }] : []),
    ...(publications === null ? [{ text: "Migration 0009 not applied: publishing and insights tables are missing", tone: "warn" as Tone, href: "/settings" }] : []),
  ];

  const failedProd = new Set(assets.filter((a) => a.current && a.status === "FAILED").map((a) => a.productionId));
  const queuedGen = tasks.filter((t) => t.status === "QUEUED" && (t.kind === "production.create" || t.kind === "production.regenerate")).length;
  const by = (s: Production["status"]) => productions.filter((p) => p.status === s).length;
  const pipeline: PipelineStage[] = [
    { key: "IDEA", label: "Idea", count: by("IDEA"), note: "Planned or blocked before generation" },
    { key: "QUEUED", label: "Queued", count: queuedGen, note: "Generation tasks waiting for a worker" },
    { key: "RUNNING", label: "Running", count: by("GENERATING"), note: "Images being generated" },
    { key: "QA", label: "QA", count: by("RAW"), note: "Generated; QA or revision in progress" },
    { key: "REVIEW", label: "Review", count: by("REVIEW"), note: "Waiting for your approval" },
    { key: "APPROVED", label: "Approved", count: by("APPROVED"), note: "Ready to publish" },
    { key: "SCHEDULED", label: "Scheduled", count: by("SCHEDULED"), note: "Slotted on the calendar" },
    { key: "PUBLISHED", label: "Published", count: by("PUBLISHED"), note: "Published (mock provider today)" },
    { key: "FAILED", label: "Failed", count: failedProd.size, note: "Has a failed image" },
    { key: "BLOCKED", label: "Blocked", count: blocked.length, note: "Tasks blocked (budget, pause, limits)" },
  ];

  const prodById = new Map(productions.map((p) => [p.id, p]));
  const cards: ApprovalCard[] = approvals.map((a): ApprovalCard | null => {
    const p = prodById.get(a.productionId);
    if (!p) return null;
    const asset = assets.filter((x) => x.productionId === p.id && x.current && x.kind !== "REEL").sort((x, y) => x.seq - y.seq)[0] ?? null;
    const job = asset ? jobs.find((j) => j.id === asset.generationJobId) : undefined;
    return { approvalId: a.id, production: p, asset, triad: asset ? qaTriad(qa as QaResult[], asset.id) : null, ageHours: Math.round((now.getTime() - new Date(a.createdAt).getTime()) / H), provider: asset ? `${asset.provider}${asset.model ? ` · ${asset.model}` : ""}` : "—", costUsd: job?.costUsd ?? null };
  }).filter((x): x is ApprovalCard => !!x).sort((a, b) => b.ageHours - a.ageHours);

  const webhook = env.NORTHLINE_WEBHOOK_SECRET ? "CONFIGURED" : "NOT CONFIGURED";
  const llm = cc.providers;
  const system: SystemRow[] = [
    { name: "Database", state: repo.driver === "supabase" ? "SUPABASE" : "LOCAL FILE (demo)", tone: repo.driver === "supabase" ? "ok" : "warn", detail: repo.driver === "supabase" ? "Reads succeeded for this page." : "Demo persistence in .data/ — not production." },
    { name: "Storage", state: repo.driver === "supabase" && env.SUPABASE_URL ? "SUPABASE STORAGE" : "LOCAL DISK", tone: repo.driver === "supabase" ? "ok" : "warn", detail: isReadOnly(env) ? "Read-only: uploads refused." : "Private bucket / .data/assets." },
    { name: "Image provider", state: img.mode === "unavailable" ? "NOT CONFIGURED" : img.mode.toUpperCase(), tone: img.mode === "openai" ? "ok" : img.mode === "mock" ? "warn" : "bad", detail: img.reason ?? (img.mode === "mock" ? "Mock: no paid calls, no real images (set IMAGE_PROVIDER=mock-png for placeholder files)." : `${img.provider.name} ${img.provider.model ?? ""}`) },
    { name: "LLM router", state: llm.some((p) => p.state === "HEALTHY") ? "HEALTHY" : llm.every((p) => p.state === "UNKNOWN" || p.state === "NOT_CONFIGURED") ? "UNKNOWN" : "DEGRADED", tone: llm.some((p) => p.state === "HEALTHY") ? "ok" : "mute", detail: llm.map((p) => `${p.label}: ${p.state.replace("_", " ")}`).join(" · ") },
    { name: "Governor", state: cc.budget.governor + (cc.budget.pause.paused === true ? " · PAUSED" : ""), tone: cc.budget.governor === "ON" ? "ok" : "warn", detail: cc.budget.governor === "ON" ? remaining : "Budget limits are not enforced (NORTHLINE_GOVERNOR is off)." },
    { name: "Jobs", state: `${cc.queue.running} running · ${cc.queue.queued} queued`, tone: cc.queue.failed ? "warn" : "mute", detail: `Durable jobs ${cc.system.durableJobs}. ${cc.queue.failed} failed, ${cc.queue.blocked} blocked.` },
    { name: "n8n / webhooks", state: webhook, tone: webhook === "CONFIGURED" ? "ok" : "mute", detail: "Machine endpoints use a Bearer secret and fail closed when it is unset." },
    { name: "Publishing", state: `${publishingMode(env).toUpperCase()}${publications === null ? " · NOT MIGRATED" : ""}`, tone: publications === null ? "warn" : "mute", detail: publications === null ? "Apply migration 0009 to enable publishing records." : "Founder click required. Mock provider only." },
    { name: "Instagram / Meta", state: ig.state, tone: "bad", detail: ig.detail },
  ];
  return { status, attention, creators, pipeline, approvals: cards, system, cc, publicationsMigrated: publications !== null, masters: Object.fromEntries(refs.filter((r) => r.referenceType === "MASTER_FACE" && r.status === "ACTIVE").map((r) => [r.talent, r.id])), recentPublications: (publications ?? []).filter((p) => p.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, 6) };
}
