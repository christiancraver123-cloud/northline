// Derived delivery assets. The provider's RAW original is NEVER modified or replaced; a derivative is a separate stored file
// with a lineage record (asset_derivatives) pointing back to the exact source asset + sha256 + the operation applied.
//
// 4:5 Instagram delivery: the provider produces 1024x1536 (2:3). We CROP (never stretch or pad): remove (h - w*5/4) rows, biased to keep
// head-room (default: remove 25% of the excess from the top, 75% from the bottom). No upscaling — 1024x1280 is delivered as-is.
import type { Repo } from "@/lib/db/repo";
import type { Asset, AssetDerivative } from "@/lib/db/records";
import { inspectImage } from "@/lib/media/inspect";
import { cropRaster, decodePng, encodePng } from "@/lib/media/png";
import type { StorageProvider } from "@/lib/providers/types";

export class DeriveError extends Error {}
export interface Crop45 { x: number; y: number; width: number; height: number }

/** Pure geometry: the 4:5 crop box for a width x height image. `topBias` = share of the removed rows taken from the top (0 = keep the very top). */
export function crop45Box(width: number, height: number, topBias = 0.25): Crop45 {
  const ratio = width / height;
  if (Math.abs(ratio - 0.8) < 0.002) return { x: 0, y: 0, width, height }; // already 4:5
  if (ratio < 0.8) { const h = Math.round((width * 5) / 4), cut = height - h; return { x: 0, y: Math.round(cut * topBias), width, height: h }; }
  const w = Math.round((height * 4) / 5), cut = width - w; // wider than 4:5: trim the sides evenly
  return { x: Math.round(cut / 2), y: 0, width: w, height };
}

const deliveryName = (filename: string) => (/_RAW\.\w+$/i.test(filename) ? filename.replace(/_RAW(\.\w+)$/i, "_4x5$1") : filename.replace(/(\.\w+)$/, "_4x5$1"));

/** Create (or return the existing) 4:5 delivery derivative of a RAW asset. Idempotent per source sha256. */
export async function createDelivery45(repo: Repo, storage: StorageProvider, assetId: string, o: { createdBy?: string; topBias?: number } = {}): Promise<{ derivative: AssetDerivative; created: boolean }> {
  const asset = await repo.get("assets", assetId);
  if (!asset) throw new DeriveError("Asset not found.");
  if (!asset.storagePath) throw new DeriveError("This asset has no image file to derive from.");
  const src = await storage.read(asset.storagePath);
  if (!src) throw new DeriveError("The source image could not be read from storage.");
  const info = inspectImage(src.bytes);
  if (!info.ok || info.mime !== "image/png") throw new DeriveError(`Only PNG sources can be cropped (found ${info.mime ?? "unknown"}).`);
  const existing = (await repo.list("assetDerivatives", { sourceAssetId: asset.id })).find((d) => d.kind === "DELIVERY_4X5" && d.sourceSha256 === info.sha256);
  if (existing) return { derivative: existing, created: false };

  const raster = decodePng(src.bytes);
  const box = crop45Box(raster.width, raster.height, o.topBias ?? 0.25);
  const out = encodePng(cropRaster(raster, box.x, box.y, box.width, box.height));
  const outInfo = inspectImage(out);
  const production = (await repo.get("productions", asset.productionId))!;
  const filename = deliveryName(asset.filename);
  const path = `${production.code}/delivery/${filename}`;
  if (path === asset.storagePath) throw new DeriveError("Refusing to overwrite the RAW original."); // belt and braces
  await storage.save(path, out, "image/png");
  const back = await storage.read(path);
  if (!back || inspectImage(back.bytes).sha256 !== outInfo.sha256) throw new DeriveError("Derived file failed storage read-back verification.");
  const derivative = await repo.insert("assetDerivatives", {
    productionId: asset.productionId, sourceAssetId: asset.id, kind: "DELIVERY_4X5", storagePath: path, filename, mime: "image/png",
    width: outInfo.width, height: outInfo.height, bytes: outInfo.bytes, sha256: outInfo.sha256, sourceSha256: info.sha256, createdBy: o.createdBy ?? "operator",
    derivation: { operation: "crop", aspect: "4:5", scaled: false, upscaled: false, sourceWidth: raster.width, sourceHeight: raster.height, cropBox: box, topBias: o.topBias ?? 0.25, sourceStoragePath: asset.storagePath, sourceFilename: asset.filename, sourceAttemptNo: asset.attemptNo },
    origin: asset.origin,
  });
  return { derivative, created: true };
}

export async function deliveryFor(repo: Repo, productionId: string): Promise<Map<string, AssetDerivative>> {
  const m = new Map<string, AssetDerivative>();
  for (const d of await repo.list("assetDerivatives", { productionId })) if (d.kind === "DELIVERY_4X5") m.set(d.sourceAssetId, d);
  return m;
}
export type { Asset };
