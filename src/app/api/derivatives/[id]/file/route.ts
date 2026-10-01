import { getRepo } from "@/lib/db";
import { getStorage } from "@/lib/providers/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await (await getRepo()).get("assetDerivatives", (await params).id);
  if (!d?.storagePath) return new Response("not found", { status: 404 });
  const f = await getStorage().read(d.storagePath);
  if (!f) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(f.bytes), { headers: { "content-type": f.mime, "cache-control": "private, max-age=60", "x-content-type-options": "nosniff" } });
}
