import { storeDriver } from "@/lib/db";
import { providerStatus } from "@/lib/providers";
import { Card, PageHeader, PROVIDER_STATE_TONE, Pill } from "@/components/ui";
import { getRepo } from "@/lib/db";
import { llmProviderStatuses } from "@/lib/llm/status";
import { defaultRouter } from "@/lib/llm/router";

// Shows only whether variables are set — never their values.
const set = (n: string) => !!process.env[n];
const Row = ({ k, ok, note }: { k: string; ok: boolean; note?: string }) => <div className="flex items-center justify-between border-t border-edge py-1.5 first:border-0"><span className="font-mono text-[13px]">{k}{note && <span className="ml-2 text-faint">{note}</span>}</span><Pill tone={ok ? "ok" : "warn"}>{ok ? "set" : "not set"}</Pill></div>;

export default async function Settings() {
  const ps = providerStatus();
  const llm = await llmProviderStatuses(await getRepo(), defaultRouter());
  return (
    <>
      <PageHeader title="Settings" sub="Configuration status. Secrets live in server environment variables and are never shown here." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-bold">Persistence</h2><p className="mb-2 text-muted">Driver: <b className="text-ink">{storeDriver()}</b> {storeDriver() === "file" && <Pill tone="warn">demo data, local only</Pill>}</p><Row k="SUPABASE_URL" ok={set("SUPABASE_URL")} /><Row k="SUPABASE_SERVICE_ROLE_KEY" ok={set("SUPABASE_SERVICE_ROLE_KEY")} /></Card>
        <Card><h2 className="mb-2 font-bold">Providers</h2><p className="mb-2 text-muted">Image: <b className="text-ink">{ps.image.mode === "openai" ? "openai (configured — live result in run history)" : ps.image.mode === "unavailable" ? "UNAVAILABLE — " + ps.image.reason : "mock (demo)"}</b> · Video: <b className="text-ink">{ps.video.live ? "higgsfield" : "mock"}</b></p><Row k="IMAGE_PROVIDER" ok={set("IMAGE_PROVIDER")} /><Row k="OPENAI_API_KEY" ok={set("OPENAI_API_KEY")} /><Row k="VIDEO_PROVIDER" ok={set("VIDEO_PROVIDER")} /><Row k="HIGGSFIELD_API_KEY" ok={set("HIGGSFIELD_API_KEY")} note="adapter stub" /></Card>
        <Card><h2 className="mb-2 font-bold">LLM providers</h2>
          {llm.filter((p) => p.name !== "mock" || p.state === "configured").map((p) => <div key={p.name} className="border-t border-edge py-1.5 first:border-0"><div className="flex items-center justify-between"><span className="font-mono text-[13px]">{p.name} <span className="text-faint">{p.model}</span></span><Pill tone={PROVIDER_STATE_TONE[p.state] as never}>{p.state.replace("_", "-")}</Pill></div><div className="text-[11px] text-faint">{p.detail ?? "ready"} · {p.calls} call(s), {p.failures} failed · tokens {p.tokens ?? "n/a"} · cost {p.costUsd == null ? "unknown (set LLM_PRICING_JSON)" : `$${p.costUsd.toFixed(4)}`}</div></div>)}
          <Row k="GEMINI_API_KEY" ok={set("GEMINI_API_KEY")} /><Row k="GEMINI_MODEL" ok={set("GEMINI_MODEL")} note="default gemini-3.8-flash" /><Row k="OPENAI_TEXT_MODEL" ok={set("OPENAI_TEXT_MODEL")} note="default gpt-4o-mini" /><Row k="LLM_PRICING_JSON" ok={set("LLM_PRICING_JSON")} note="enables cost tracking" />
        </Card>
        <Card><h2 className="mb-2 font-bold">Automation</h2><Row k="NORTHLINE_WEBHOOK_SECRET" ok={set("NORTHLINE_WEBHOOK_SECRET")} /><Row k="N8N_BASE_URL" ok={set("N8N_BASE_URL")} /><Row k="N8N_API_KEY" ok={set("N8N_API_KEY")} /></Card>
        <Card><h2 className="mb-2 font-bold">Approval policy</h2><ul className="list-disc pl-4 text-[13px] text-muted"><li>Draft-first: no publishing adapter exists.</li><li>Approval blocked until virtual/AI disclosure is confirmed on Launch.</li><li>Approval blocked while assets are failed or pending.</li></ul></Card>
      </div>
    </>
  );
}
