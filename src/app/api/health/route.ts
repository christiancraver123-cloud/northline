import { NextResponse } from "next/server";
import { storeDriver } from "@/lib/db";
import { isReadOnly, productionConfigProblems } from "@/lib/runtime/mode";
export const dynamic = "force-dynamic";

// Public liveness check for the host. Reports misconfiguration by variable NAME only (never values) and does not touch the database.
export const GET = () => {
  const problems = productionConfigProblems();
  if (problems.length) return NextResponse.json({ ok: false, error: "misconfigured", problems }, { status: 503 });
  return NextResponse.json({ ok: true, store: storeDriver(), readOnly: isReadOnly() });
};
