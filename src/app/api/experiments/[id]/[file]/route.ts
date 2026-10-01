import { getStorage } from "@/lib/providers/storage";
import { experimentMime, safeExperimentPath } from "@/lib/experiments";

export const dynamic = "force-dynamic";

// Authenticated by the proxy (not a public path). Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const p = safeExperimentPath(id, file);
  if (!p) return new Response("not found", { status: 404 });
  const f = await getStorage().read(p);
  if (!f) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(f.bytes), { headers: { "content-type": experimentMime(file), "cache-control": "private, max-age=60", "x-content-type-options": "nosniff" } });
}
