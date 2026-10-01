import { notFound } from "next/navigation";
import { getStorage } from "@/lib/providers/storage";
import { safeExperimentPath } from "@/lib/experiments";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Result { condition: string; label: string; storagePath: string; width: number; height: number; bytes: number; provider: string; model: string | null; size: string; latencyMs: number; referenceConfiguration: string[]; referenceOrder: string[]; inputFidelity: string; promptAddendum: string; usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { image_tokens?: number; text_tokens?: number } } | null; estimatedCostUsd: number | null; costNote: string; sha256: string }
interface Manifest { experiment: string; status: string; assembledAt: string; scene: string; changedOnly: string; constant: string; results: Record<string, Result>; crops: Record<string, { sourceReferenceId: string; box: object; authority: string }> }

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = safeExperimentPath(id, "manifest.json");
  if (!p) notFound();
  const f = await getStorage().read(p);
  if (!f) notFound();
  const m = JSON.parse(Buffer.from(f.bytes).toString()) as Manifest;
  const file = (name: string) => `/api/experiments/${id}/${name}`;
  return (
    <>
      <PageHeader title={`Experiment · ${m.experiment}`} sub="Controlled reference-strategy probe. Read-only record: nothing here is a canonical reference or a production asset." actions={<Pill tone="warn">{m.status}</Pill>} />
      <Card className="mb-4 text-[13px]">
        <p><b>Changed only:</b> {m.changedOnly}. <b>Constant:</b> {m.constant}.</p>
        <p className="mt-1 text-muted">Scene: {m.scene}</p>
        <p className="mt-1 text-faint">No winner has been selected. The production prompt system is unchanged until a human chooses.</p>
      </Card>
      <div className="mb-4 grid gap-4">
        <Card><h2 className="mb-2 font-bold">Face crops at equal scale</h2><p className="mb-2 text-[12px] text-faint">Left to right: canonical MASTER_FACE · canonical FACE_3Q_RIGHT · A · B · C</p><a href={file("PROBE_faces_equal_scale.png")} target="_blank" rel="noreferrer"><img src={file("PROBE_faces_equal_scale.png")} alt="Equal-scale face crops" className="w-full rounded-lg border border-edge" /></a></Card>
        <Card><h2 className="mb-2 font-bold">Side by side</h2><a href={file("PROBE_side_by_side.png")} target="_blank" rel="noreferrer"><img src={file("PROBE_side_by_side.png")} alt="Probe results A, B, C" className="w-full rounded-lg border border-edge" /></a></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {(["A", "B", "C"] as const).map((c) => { const r = m.results[c]; if (!r) return <Card key={c}><Empty>Condition {c} has no result.</Empty></Card>; return (
          <Card key={c}>
            <h2 className="mb-2 font-bold">Probe {c} <span className="font-mono text-[11px] font-normal text-faint">{r.label}</span></h2>
            <a href={file(`${r.label}.png`)} target="_blank" rel="noreferrer"><img src={file(`${r.label}.png`)} alt={`Probe ${c}`} className="mb-2 w-full rounded-lg border border-edge" /></a>
            <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
              <dt className="text-muted">References</dt><dd className="font-mono text-[11.5px]">{r.referenceOrder.join(" → ")}</dd>
              <dt className="text-muted">Input fidelity</dt><dd>{r.inputFidelity}</dd>
              <dt className="text-muted">Provider / model</dt><dd className="font-mono text-[11.5px]">{r.provider} / {r.model}</dd>
              <dt className="text-muted">Output</dt><dd>{r.width}×{r.height} · {r.bytes} bytes</dd>
              <dt className="text-muted">Usage</dt><dd>{r.usage ? `${r.usage.input_tokens} in (${r.usage.input_tokens_details?.image_tokens} image + ${r.usage.input_tokens_details?.text_tokens} text) · ${r.usage.output_tokens} out` : "unknown"}</dd>
              <dt className="text-muted">Est. cost</dt><dd>{r.estimatedCostUsd ?? "unknown"} <span className="text-faint">— {r.costNote}</span></dd>
              <dt className="text-muted">Prompt addendum</dt><dd className="text-[12px] text-muted">{r.promptAddendum}</dd>
            </dl>
          </Card>); })}
      </div>
      <Card className="mt-4 text-[12px] text-faint"><b>Derived crops</b> (lineage only, zero canonical authority): {Object.entries(m.crops).map(([k, v]) => `${k} ← reference ${v.sourceReferenceId.slice(0, 8)} ${JSON.stringify(v.box)}`).join(" · ")}</Card>
    </>
  );
}
