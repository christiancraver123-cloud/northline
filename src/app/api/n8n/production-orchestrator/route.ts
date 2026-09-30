// NL-01 Production Orchestrator webhook. Contract: docs/n8n.md. Auth: Authorization: Bearer $NORTHLINE_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import { executeCreate } from "@/lib/orchestrator/execute";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  try {
    const r = await executeCreate(await getRepo(), parsed.data);
    return NextResponse.json({ ok: r.failures.length === 0, runId: r.runId, campaignId: r.campaignId, productions: r.productions, failures: r.failures, approvalRequired: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "internal error" }, { status: 500 });
  }
}
