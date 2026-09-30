import { NextResponse } from "next/server";
import { storeDriver } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = () => NextResponse.json({ ok: true, store: storeDriver() });
