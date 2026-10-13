import { promises as fs } from "node:fs";
import { resolveKey } from "@/lib/inbox/folder-server";

export const dynamic = "force-dynamic";
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** Serves one image from the folder inbox (read-only). The key must be a safe batch/folder/file path inside the inbox root. */
export async function GET(req: Request) {
  const full = resolveKey(new URL(req.url).searchParams.get("key") ?? "");
  if (!full) return new Response("bad key", { status: 400 });
  try {
    const bytes = await fs.readFile(full);
    return new Response(bytes, { headers: { "content-type": MIME[full.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  } catch { return new Response("not found", { status: 404 }); }
}
