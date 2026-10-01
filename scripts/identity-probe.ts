// Sienna identity probe: EXACTLY three controlled images, changing ONLY the reference strategy.
//   A  control   — current Attempt-2 reference configuration (MASTER_FACE + FACE_3Q_RIGHT + UPPER_BODY, default fidelity)
//   B  master HF — ACTIVE MASTER_FACE only, input_fidelity=high, master explicitly authoritative
//   C  crops HF  — tight DERIVED face crops of MASTER_FACE + FACE_3Q_RIGHT, input_fidelity=high, role-labelled
// Constant across A/B/C: scene text, pose, framing, wardrobe, environment, lighting, expression, model, size, quality (provider default).
// Outputs go to Supabase Storage under experiments/<id>/ (RAW originals + manifest); derived crops are NOT reference_assets (zero canonical authority).
// Never changes the production prompt system. Never selects a winner. Idempotent: a condition that already has an output is skipped (never regenerated).
//
//   npx tsx scripts/identity-probe.ts --prepare [--out DIR]   # derive + save crops locally only, NO spend
//   npx tsx scripts/identity-probe.ts --run [--out DIR] [--only B|C|A]
import fs from "node:fs";
import path from "node:path";
import { getRepo } from "../src/lib/db";
import { getStorage } from "../src/lib/providers/storage";
import { getImageProvider } from "../src/lib/providers";
import { inspectImage } from "../src/lib/media/inspect";
import { cropRaster, decodePng, encodePng } from "../src/lib/media/png";
import { buildCanonicalIdentity } from "../src/lib/identity/canonical";
import { buildPrompts } from "../src/lib/pipeline/prompts";
import type { GenerationBriefData } from "../src/lib/db/records";
import type { ImageReference } from "../src/lib/providers/types";

export const EXPERIMENT_ID = "sie-identity-probe-v1";
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const OUT = arg("--out") ?? path.join(process.cwd(), ".data", "experiments", EXPERIMENT_ID);

/** Tight face crops (pure crop, no scaling). Boxes are in source-image pixels. */
export const CROPS = {
  MASTER_FACE: { x: 400, y: 190, width: 460, height: 480 },
  FACE_3Q_RIGHT: { x: 430, y: 150, width: 400, height: 400 },
} as const;

const SCENE = "Waist-up candid smartphone photo on a quiet Miami street in bright, natural morning daylight. She stands relaxed with her head turned very slightly, looking at the camera with a calm, relaxed expression and soft closed lips (not smiling). Her face is large in the frame. Plain white ribbed tank top. Small gold hoop earrings and a thin gold chain necklace with a small round pendant. Long, loose, messy dark chocolate-brown waves with a center part. No text, signage or logos anywhere.";

function probeBrief(): GenerationBriefData {
  const ci = buildCanonicalIdentity("SIE");
  return {
    production: { code: "SIE-PROBE", format: "POST", platform: "instagram" }, creator: { code: "SIE", name: ci.name }, identityVersion: ci.id, identityBlock: ci.providerBlock,
    hardLocks: ci.hardLocks.map((l) => ({ id: l.id, label: l.label })), negativeConstraints: [...new Set(ci.negativeConstraints)], references: [], referencePolicy: "",
    concept: "identity probe", location: "a quiet Miami street", timeOfDay: "daytime",
    visualDirection: { outfit: "plain white ribbed tank top", lighting: "bright natural morning daylight", palette: [], mood: "calm" },
    continuity: ["same creator identity, outfit and time of day"], recentConsiderations: [],
    providerRequirements: { provider: "openai", model: "gpt-image-1", size: "1024x1536", aspect: "2:3", count: 1 },
    shots: [{ n: 1, kind: "IMG", description: SCENE }], revision: null,
  };
}

const ROLE_B = "REFERENCE RULES: the single attached image is Sienna's canonical MASTER_FACE and is the ONLY and authoritative definition of her identity. Reproduce exactly this woman's facial geometry: face width and shape, cheekbones, jaw and chin, eye shape and spacing, brows, nose, lips, freckle density and placement, and skin tone. Ignore the reference's background, environment, lighting, wardrobe and pose; they are temporary scene details, not identity.";
const ROLE_C = "REFERENCE RULES: two attached images. Image 1 is Sienna's canonical MASTER_FACE (tight face crop) and defines her exact identity. Image 2 is the SAME woman from another angle (tight face crop), included only to establish facial geometry. The references exist to establish facial geometry. Ignore reference backgrounds, environments, lighting, wardrobe and any temporary scene characteristics. Do not average the references into a new person: reproduce the woman in Image 1.";

type Cond = "A" | "B" | "C";
const COND: Record<Cond, { label: string; refs: string[]; fidelity: "high" | null; roleText: string }> = {
  A: { label: "A_control_attempt2_refs", refs: ["MASTER_FACE", "FACE_3Q_RIGHT", "UPPER_BODY"], fidelity: null, roleText: "" },
  B: { label: "B_master_high_fidelity", refs: ["MASTER_FACE"], fidelity: "high", roleText: ROLE_B },
  C: { label: "C_cropped_identity_set_high_fidelity", refs: ["MASTER_FACE_CROP", "FACE_3Q_RIGHT_CROP"], fidelity: "high", roleText: ROLE_C },
};

const sha = (u: Uint8Array) => inspectImage(u).sha256;
const toPng = (x: Uint8Array) => x;

export async function main() {
  const repo = await getRepo(), storage = getStorage();
  const active = (await repo.list("referenceAssets", { talent: "SIE" })).filter((r) => r.status === "ACTIVE");
  const get = (t: string) => { const r = active.find((x) => x.referenceType === t); if (!r) throw new Error(`Sienna has no ACTIVE ${t}`); return r; };
  const [master, q3, upper] = [get("MASTER_FACE"), get("FACE_3Q_RIGHT"), get("UPPER_BODY")];
  const bytesOf = async (r: { storagePath: string }) => { const f = await storage.read(r.storagePath); if (!f) throw new Error("reference unreadable"); return f.bytes; };
  const mb = await bytesOf(master), qb = await bytesOf(q3), ub = await bytesOf(upper);

  // derived crops: lineage to the canonical source, zero authority of their own
  const crop = (src: Uint8Array, c: { x: number; y: number; width: number; height: number }) => { const r = decodePng(src); return encodePng(cropRaster(r, c.x, c.y, c.width, c.height)); };
  const masterCrop = crop(mb, CROPS.MASTER_FACE), q3Crop = crop(qb, CROPS.FACE_3Q_RIGHT);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "ref_MASTER_FACE_CROP.png"), masterCrop);
  fs.writeFileSync(path.join(OUT, "ref_FACE_3Q_RIGHT_CROP.png"), q3Crop);
  console.log("crops:", { master: `${inspectImage(masterCrop).width}x${inspectImage(masterCrop).height}`, q3: `${inspectImage(q3Crop).width}x${inspectImage(q3Crop).height}` }, "->", OUT);
  if (process.argv.includes("--prepare") && !process.argv.includes("--run")) return;

  const provider = getImageProvider();
  if (provider.name !== "openai") throw new Error("not real OpenAI — refusing");
  const ci = buildCanonicalIdentity("SIE");
  const built = buildPrompts(probeBrief(), ci, { refsByShot: { 1: [master.id] } })[0]; // production prompt builder, unchanged
  const refImgs: Record<string, ImageReference> = {
    MASTER_FACE: { type: "MASTER_FACE", bytes: mb, mime: "image/png" }, FACE_3Q_RIGHT: { type: "FACE_3Q_RIGHT", bytes: qb, mime: "image/png" }, UPPER_BODY: { type: "UPPER_BODY", bytes: ub, mime: "image/png" },
    MASTER_FACE_CROP: { type: "MASTER_FACE", bytes: toPng(masterCrop), mime: "image/png" }, FACE_3Q_RIGHT_CROP: { type: "FACE_3Q_RIGHT", bytes: toPng(q3Crop), mime: "image/png" },
  };
  const only = arg("--only") as Cond | undefined;
  const order: Cond[] = only ? [only] : ["B", "C", "A"]; // B first: cheapest way to learn whether input_fidelity is accepted
  const side = (c: Cond) => `experiments/${EXPERIMENT_ID}/${COND[c].label}.json`;
  const order2: Cond[] = only ? [only] : order;
  for (const c of order2) {
    const cfg = COND[c], outPath = `experiments/${EXPERIMENT_ID}/${cfg.label}.png`;
    if (await storage.read(outPath)) { console.log(`${c}: already generated — skipping (never regenerated)`); continue; }
    const t0 = Date.now();
    const prompt = cfg.roleText ? `${built.positive}\n\n${cfg.roleText}` : built.positive;
    const res = await provider.generate({ productionCode: "SIE-PROBE", shotN: 1, prompt, negative: built.negative, talent: "SIE", references: cfg.refs.map((r) => refImgs[r]), size: "1024x1536", ...(cfg.fidelity ? { inputFidelity: cfg.fidelity } : {}) });
    if (!res.bytes) throw new Error(`${c}: no image bytes`);
    await storage.save(outPath, res.bytes, "image/png");
    fs.writeFileSync(path.join(OUT, `${cfg.label}.png`), res.bytes);
    const info = inspectImage(res.bytes);
    const record = { condition: c, label: cfg.label, storagePath: outPath, sha256: info.sha256, width: info.width, height: info.height, bytes: info.bytes, provider: res.provider, model: res.model, size: "1024x1536", latencyMs: Date.now() - t0, referenceConfiguration: cfg.refs, referenceOrder: cfg.refs.map((r, i) => `${i + 1}:${r}`), inputFidelity: cfg.fidelity ?? "default (unset)", fullPrompt: prompt, negative: built.negative, promptAddendum: cfg.roleText || "(none — production prompt only)", usage: (res.metadata as { usage?: unknown } | undefined)?.usage ?? null, estimatedCostUsd: null, costNote: "not estimated: no pricing configuration (LLM_PRICING_JSON) is set", createdAt: new Date().toISOString() };
    await storage.save(side(c), new TextEncoder().encode(JSON.stringify(record, null, 1)), "application/json");
    console.log(`${c}: generated ${info.width}x${info.height} ${info.bytes}B in ${Math.round((Date.now() - t0) / 1000)}s usage=${JSON.stringify(record.usage)}`);
  }
  // assemble the manifest from the per-condition sidecars (each saved exactly once; nothing is ever overwritten)
  const results: Record<string, unknown> = {};
  for (const c of ["A", "B", "C"] as Cond[]) { const f = await storage.read(side(c)); if (f) results[c] = JSON.parse(Buffer.from(f.bytes).toString()); }
  if (Object.keys(results).length === 3) {
    const manifest = { experiment: EXPERIMENT_ID, status: "AWAITING HUMAN IDENTITY SELECTION", assembledAt: new Date().toISOString(), scene: SCENE, basePrompt: built.positive, baseNegative: built.negative, constant: "scene, pose, framing, wardrobe, environment, lighting, expression, model, size, provider-default quality", changedOnly: "reference strategy", sources: { MASTER_FACE: { id: master.id, sha256: master.sha256 }, FACE_3Q_RIGHT: { id: q3.id, sha256: q3.sha256 }, UPPER_BODY: { id: upper.id, sha256: upper.sha256 } }, crops: { MASTER_FACE_CROP: { sourceReferenceId: master.id, sourceSha256: master.sha256, box: CROPS.MASTER_FACE, sha256: sha(masterCrop), authority: "NONE (derived, lineage only)" }, FACE_3Q_RIGHT_CROP: { sourceReferenceId: q3.id, sourceSha256: q3.sha256, box: CROPS.FACE_3Q_RIGHT, sha256: sha(q3Crop), authority: "NONE (derived, lineage only)" } }, results };
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
    const mp = `experiments/${EXPERIMENT_ID}/manifest.json`;
    await storage.save((await storage.read(mp)) ? `experiments/${EXPERIMENT_ID}/manifest-${Date.now()}.json` : mp, new TextEncoder().encode(JSON.stringify(manifest, null, 1)), "application/json");
    console.log("manifest assembled: AWAITING HUMAN IDENTITY SELECTION");
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("identity-probe")) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
