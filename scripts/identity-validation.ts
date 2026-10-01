// Sienna identity VALIDATION: exactly ONE image. Question: does MASTER_FACE-only + input_fidelity=high reproduce canonical Sienna when the pose changes?
// Reference strategy (selected by the operator from the probe): the ACTIVE canonical MASTER_FACE ONLY (full image), input_fidelity=high,
// master explicitly labelled the exact identity authority. No supporting references, no crops, no generated/production images, no probe outputs.
// Same canonical identity locks (loaded from the identity, via the unchanged production prompt builder).
// Scene: one ordinary lifestyle photo, face large, natural 3/4 angle close to the master's viewing geometry, relaxed expression, plain daylight, minimal scene.
// Idempotent: refuses if the output already exists (never generates a second image). Does not touch canonical references or create productions.
//
//   npx tsx scripts/identity-validation.ts --run [--out DIR]
//   npx tsx scripts/identity-validation.ts --assemble --face x,y,w,h [--out DIR]   # comparison sheets + manifest + report; no generation
import fs from "node:fs";
import path from "node:path";
import { getRepo } from "../src/lib/db";
import { getStorage } from "../src/lib/providers/storage";
import { getImageProvider } from "../src/lib/providers";
import { inspectImage } from "../src/lib/media/inspect";
import { cropRaster, decodePng, downscaleRaster, encodePng, type Raster } from "../src/lib/media/png";
import { buildCanonicalIdentity } from "../src/lib/identity/canonical";
import { buildPrompts } from "../src/lib/pipeline/prompts";
import type { GenerationBriefData } from "../src/lib/db/records";

export const EXPERIMENT_ID = "sie-identity-validation-v1";
const LABEL = "V_master_only_high_fidelity_3q";
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const OUT = arg("--out") ?? path.join(process.cwd(), ".data", "experiments", EXPERIMENT_ID);

export const SCENE = "A single ordinary social-media lifestyle photo taken on a phone in plain, soft, natural daylight (bright overcast), against a simple plain light-colored wall with a little blurred greenery, minimal scene. Chest-up framing with her face LARGE in the frame so identity is easy to judge. Her head is tilted slightly to one side and turned about three-quarters toward the camera, chin slightly lowered, eyes looking at the camera: the same viewing geometry as the MASTER_FACE reference. Relaxed, calm expression with soft closed lips (not smiling). Plain white ribbed tank top. Small gold hoop earrings and a thin gold chain necklace with a small round pendant. Her long, loose, messy dark chocolate-brown waves with a center part, with natural flyaways. Natural color, no dramatic grading, no heavy styling. No text, signage or logos anywhere.";
export const ROLE = "REFERENCE RULES: the single attached image is Sienna's canonical MASTER_FACE and is the EXACT identity authority and the ONLY identity source. Reproduce exactly this woman: her facial geometry (face width and shape, cheekbones, jaw and chin), eye shape and spacing, both eyes the same light green-gray, brow shape, nose, lip shape and proportions, freckle density and placement, warm tan complexion, and hair character. Do not beautify, idealize or reinterpret her face, and do not drift toward a different, more conventionally attractive woman. Ignore the reference's background, environment, lighting, wardrobe and pose: they are temporary scene details, not identity. The pose in this new photo is intentionally different from the reference only in the ways stated in the scene.";

function brief(): GenerationBriefData {
  const ci = buildCanonicalIdentity("SIE");
  return {
    production: { code: "SIE-VALIDATION", format: "POST", platform: "instagram" }, creator: { code: "SIE", name: ci.name }, identityVersion: ci.id, identityBlock: ci.providerBlock,
    hardLocks: ci.hardLocks.map((l) => ({ id: l.id, label: l.label })), negativeConstraints: [...new Set(ci.negativeConstraints)], references: [], referencePolicy: "",
    concept: "identity validation", location: "a plain wall with blurred greenery", timeOfDay: "daytime",
    visualDirection: { outfit: "plain white ribbed tank top", lighting: "plain soft natural daylight", palette: [], mood: "calm" },
    continuity: ["same creator identity"], recentConsiderations: [],
    providerRequirements: { provider: "openai", model: "gpt-image-1", size: "1024x1536", aspect: "2:3", count: 1 },
    shots: [{ n: 1, kind: "IMG", description: SCENE }], revision: null,
  };
}

const to3 = (r: Raster): Raster => (r.channels === 3 ? r : { ...r, channels: 3, data: Uint8Array.from({ length: r.width * r.height * 3 }, (_, i) => r.data[Math.floor(i / 3) * r.channels + (i % 3)]) });
const toHeight = (r: Raster, h: number) => downscaleRaster(r, Math.round((r.width * h) / r.height));
function sheet(cells: Raster[], G = 10): Uint8Array {
  const H = Math.max(...cells.map((c) => c.height)), W = cells.reduce((s, c) => s + c.width, 0) + (cells.length + 1) * G;
  const d = new Uint8Array(W * (H + 2 * G) * 3).fill(18); let x = G;
  for (const c of cells) { for (let y = 0; y < c.height; y++) d.set(c.data.subarray(y * c.width * 3, (y + 1) * c.width * 3), ((G + y) * W + x) * 3); x += c.width + G; }
  return encodePng({ width: W, height: H + 2 * G, channels: 3, data: d });
}

export async function main() {
  const repo = await getRepo(), storage = getStorage();
  const master = (await repo.list("referenceAssets", { talent: "SIE" })).find((r) => r.status === "ACTIVE" && r.referenceType === "MASTER_FACE");
  if (!master) throw new Error("Sienna has no ACTIVE MASTER_FACE");
  const mb = (await storage.read(master.storagePath))?.bytes; if (!mb) throw new Error("MASTER_FACE unreadable");
  const outPath = `experiments/${EXPERIMENT_ID}/${LABEL}.png`, sidePath = `experiments/${EXPERIMENT_ID}/${LABEL}.json`;
  fs.mkdirSync(OUT, { recursive: true });

  if (process.argv.includes("--run")) {
    if (await storage.read(outPath)) throw new Error("Validation image already exists: refusing to generate a second one.");
    const provider = getImageProvider();
    if (provider.name !== "openai") throw new Error("not real OpenAI — refusing");
    const built = buildPrompts(brief(), buildCanonicalIdentity("SIE"), { refsByShot: { 1: [master.id] } })[0]; // unchanged production prompt builder (same canonical hard locks + negatives)
    const prompt = `${built.positive}\n\n${ROLE}`, t0 = Date.now();
    const res = await provider.generate({ productionCode: "SIE-VALIDATION", shotN: 1, prompt, negative: built.negative, talent: "SIE", references: [{ type: "MASTER_FACE", bytes: mb, mime: "image/png" }], size: "1024x1536", inputFidelity: "high" });
    if (!res.bytes) throw new Error("no image bytes");
    await storage.save(outPath, res.bytes, "image/png");
    fs.writeFileSync(path.join(OUT, `${LABEL}.png`), res.bytes);
    const info = inspectImage(res.bytes);
    const record = { label: LABEL, storagePath: outPath, sha256: info.sha256, width: info.width, height: info.height, bytes: info.bytes, provider: res.provider, model: res.model, size: "1024x1536", latencyMs: Date.now() - t0, referenceConfiguration: ["MASTER_FACE (full image, ACTIVE canonical, only reference)"], masterReferenceId: master.id, masterSha256: master.sha256, inputFidelity: "high", fullPrompt: prompt, negative: built.negative, promptAddendum: ROLE, usage: (res.metadata as { usage?: unknown } | undefined)?.usage ?? null, estimatedCostUsd: null, costNote: "not estimated: no pricing configuration (LLM_PRICING_JSON) is set", createdAt: new Date().toISOString() };
    await storage.save(sidePath, new TextEncoder().encode(JSON.stringify(record, null, 1)), "application/json");
    fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify(record, null, 1));
    console.log(`generated ${info.width}x${info.height} ${info.bytes}B in ${Math.round((Date.now() - t0) / 1000)}s usage=${JSON.stringify(record.usage)}`);
    return;
  }

  if (process.argv.includes("--assemble")) {
    const face = (arg("--face") ?? "").split(",").map(Number); if (face.length !== 4 || face.some(Number.isNaN)) throw new Error("--face x,y,w,h required");
    const gen = (await storage.read(outPath))?.bytes, sc = await storage.read(sidePath);
    if (!gen || !sc) throw new Error("run first");
    const G = to3(decodePng(gen)), M = to3(decodePng(mb));
    const crop = (r: Raster, b: number[]) => cropRaster(r, b[0], b[1], Math.min(b[2], r.width - b[0]), Math.min(b[3], r.height - b[1]));
    const faces = sheet([toHeight(crop(M, [400, 190, 460, 480]), 520), toHeight(crop(G, face), 520)]);
    const side = sheet([downscaleRaster(M, 560), downscaleRaster(G, 560)]);
    await storage.save(`experiments/${EXPERIMENT_ID}/VALIDATION_faces_equal_scale.png`, faces, "image/png");
    await storage.save(`experiments/${EXPERIMENT_ID}/VALIDATION_master_beside_result.png`, side, "image/png");
    fs.writeFileSync(path.join(OUT, "VALIDATION_faces_equal_scale.png"), faces); fs.writeFileSync(path.join(OUT, "VALIDATION_master_beside_result.png"), side);
    const record = JSON.parse(Buffer.from(sc.bytes).toString());
    const manifest = { experiment: EXPERIMENT_ID, status: "AWAITING HUMAN VISUAL APPROVAL", assembledAt: new Date().toISOString(), scene: SCENE, changedOnly: "n/a — single validation image", constant: "MASTER_FACE only, input_fidelity=high, master labelled exact identity authority, same canonical hard locks; pose changed to 3/4", sheets: [{ file: "VALIDATION_master_beside_result.png", title: "Canonical MASTER_FACE beside the validation image" }, { file: "VALIDATION_faces_equal_scale.png", title: "Equal-scale face crops: canonical MASTER_FACE · validation image" }], sources: { MASTER_FACE: { id: master.id, sha256: master.sha256 } }, crops: {}, results: { V: record } };
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
    await storage.save(`experiments/${EXPERIMENT_ID}/manifest.json`, new TextEncoder().encode(JSON.stringify(manifest, null, 1)), "application/json");
    const exists = (await repo.list("agentReports")).some((r) => (r.data as { experimentId?: string }).experimentId === EXPERIMENT_ID);
    if (!exists) await repo.insert("agentReports", { agentId: "IDENTITY_QA", kind: "QA", title: "Sienna identity validation — AWAITING HUMAN VISUAL APPROVAL", body: `One validation image: MASTER_FACE only, input_fidelity=high, 3/4 pose. Usage: ${record.usage?.input_tokens} in (${record.usage?.input_tokens_details?.image_tokens} image) / ${record.usage?.output_tokens} out. Canonical references unchanged; the result is not a reference.\n\nView: /experiments/${EXPERIMENT_ID}`, data: { experimentId: EXPERIMENT_ID, status: "AWAITING HUMAN VISUAL APPROVAL", usage: record.usage }, sources: [`experiments/${EXPERIMENT_ID}`], runId: null, read: false, origin: "live" } as never);
    console.log("assembled: AWAITING HUMAN VISUAL APPROVAL");
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("identity-validation")) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
