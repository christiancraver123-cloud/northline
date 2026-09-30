// Worker tick for n8n / cron / any scheduler. Turns due schedules into tasks and runs eligible queued tasks.
// Works with the Northline browser closed. Auth: Authorization: Bearer $NORTHLINE_WEBHOOK_SECRET. Idempotent and cheap when idle.
import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { ensureAgents, materializeDueSchedules } from "@/lib/agents/ops/service";
import { processQueue } from "@/lib/agents/ops/worker";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const repo = await getRepo();
    await ensureAgents(repo);
    const due = await materializeDueSchedules(repo);
    const res = await processQueue(repo, { max: 25, trigger: "queue" });
    return NextResponse.json({ ok: true, scheduledTasksCreated: due.length, tasksRun: res.ran.length, results: res.ran, remainingQueued: res.remainingQueued });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "internal error" }, { status: 500 });
  }
}
