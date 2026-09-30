import { getRepo } from "@/lib/db";
import { localStorageProvider } from "@/lib/providers/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await (await getRepo()).get("assets", (await params).id);
  if (!a?.storagePath) return new Response("not found", { status: 404 });
  const f = await localStorageProvider.read(a.storagePath);
  if (!f) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(f.bytes), { headers: { "content-type": f.mime, "cache-control": "private, max-age=60" } });
}
