// NL-01 Production Orchestrator webhook. Contract: docs/n8n.md. Auth: Authorization: Bearer $NORTHLINE_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import { submitCreate } from "@/lib/agents/ops/commands";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const hdrKey = req.headers.get("idempotency-key");
  const parsed = CreateRequestSchema.safeParse(hdrKey && body && typeof body === "object" ? { idempotency_key: hdrKey, ...(body as object) } : body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  try {
    const r = await submitCreate(await getRepo(), parsed.data, { createdBy: "n8n", trigger: "n8n" });
    if (r.task.status === "FAILED") return NextResponse.json({ ok: false, error: r.task.error, taskId: r.task.id }, { status: 500 });
    const out = r.output ?? {};
    return NextResponse.json({ ok: (out.failures ?? []).length === 0, taskId: r.task.id, runId: out.runId, productions: out.productions ?? [], failures: out.failures ?? [], approvalRequired: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "internal error" }, { status: 500 });
  }
}
