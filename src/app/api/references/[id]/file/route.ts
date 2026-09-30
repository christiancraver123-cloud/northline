import { getRepo } from "@/lib/db";
import { getStorage } from "@/lib/providers/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await (await getRepo()).get("referenceAssets", (await params).id);
  if (!r) return new Response("not found", { status: 404 });
  const f = await getStorage().read(r.storagePath);
  if (!f) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(f.bytes), { headers: { "content-type": f.mime, "cache-control": "private, max-age=60", "x-content-type-options": "nosniff" } });
}
