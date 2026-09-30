import { storeDriver } from "@/lib/db";
import { providerStatus } from "@/lib/providers";
import { Card, PageHeader, Pill } from "@/components/ui";

// Shows only whether variables are set — never their values.
const set = (n: string) => !!process.env[n];
const Row = ({ k, ok, note }: { k: string; ok: boolean; note?: string }) => <div className="flex items-center justify-between border-t border-edge py-1.5 first:border-0"><span className="font-mono text-[13px]">{k}{note && <span className="ml-2 text-faint">{note}</span>}</span><Pill tone={ok ? "ok" : "warn"}>{ok ? "set" : "not set"}</Pill></div>;

export default function Settings() {
  const ps = providerStatus();
  return (
    <>
      <PageHeader title="Settings" sub="Configuration status. Secrets live in server environment variables and are never shown here." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-bold">Persistence</h2><p className="mb-2 text-muted">Driver: <b className="text-ink">{storeDriver()}</b> {storeDriver() === "file" && <Pill tone="warn">demo data, local only</Pill>}</p><Row k="SUPABASE_URL" ok={set("SUPABASE_URL")} /><Row k="SUPABASE_SERVICE_ROLE_KEY" ok={set("SUPABASE_SERVICE_ROLE_KEY")} /></Card>
        <Card><h2 className="mb-2 font-bold">Providers</h2><p className="mb-2 text-muted">Image: <b className="text-ink">{ps.image.live ? "openai (live)" : "mock"}</b> · Video: <b className="text-ink">{ps.video.live ? "higgsfield" : "mock"}</b></p><Row k="IMAGE_PROVIDER" ok={set("IMAGE_PROVIDER")} /><Row k="OPENAI_API_KEY" ok={set("OPENAI_API_KEY")} /><Row k="VIDEO_PROVIDER" ok={set("VIDEO_PROVIDER")} /><Row k="HIGGSFIELD_API_KEY" ok={set("HIGGSFIELD_API_KEY")} note="adapter stub" /></Card>
        <Card><h2 className="mb-2 font-bold">Automation</h2><Row k="NORTHLINE_WEBHOOK_SECRET" ok={set("NORTHLINE_WEBHOOK_SECRET")} /><Row k="N8N_BASE_URL" ok={set("N8N_BASE_URL")} /><Row k="N8N_API_KEY" ok={set("N8N_API_KEY")} /></Card>
        <Card><h2 className="mb-2 font-bold">Approval policy</h2><ul className="list-disc pl-4 text-[13px] text-muted"><li>Draft-first: no publishing adapter exists.</li><li>Approval blocked until virtual/AI disclosure is confirmed on Launch.</li><li>Approval blocked while assets are failed or pending.</li></ul></Card>
      </div>
    </>
  );
}
