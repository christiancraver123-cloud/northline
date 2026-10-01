// Asset registry validation (design: "Asset pipeline and registry"). A third-party asset may enter Northline World only with a complete,
// licence-safe registry row AND saved licence evidence. "Free download" is not "commercially usable"; unknown = rejected.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
export const AssetEntrySchema = z.object({
  asset_id: nonEmpty, name: nonEmpty, kind: z.enum(["internal-procedural", "third-party"]),
  source: nonEmpty, vendor_creator: nonEmpty, license: nonEmpty,
  commercial_use: z.enum(["yes", "no", "unknown"]), modification_rights: nonEmpty, redistribution_restrictions: nonEmpty,
  repo_redistribution_permitted: z.boolean(),
  attribution_required: z.boolean(), attribution_text: z.string(),
  original_format: nonEmpty, optimized_format: nonEmpty, triangles: z.number().int().nonnegative().nullable(), texture_resolution: z.string().nullable(), lod_available: z.boolean(),
  northline_usage: nonEmpty, date_acquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license_evidence: z.string().nullable(), files: z.array(z.string()),
});
export const RegistrySchema = z.object({ version: z.literal(1), assets: z.array(AssetEntrySchema) });
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const BINARY_EXT = /\.(glb|gltf|bin|png|jpe?g|webp|avif|ktx2?|basis|hdr|exr|dds|mp3|ogg|wav|m4a|fbx|obj|blend)$/i;

/** Returns human-readable problems; empty = valid. `root` resolves license_evidence paths. */
export function validateRegistry(raw: unknown, root = process.cwd()): string[] {
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.slice(0, 10).map((i) => `registry: ${i.path.join(".")}: ${i.message}`);
  const problems: string[] = [], ids = new Set<string>();
  for (const a of parsed.data.assets) {
    if (ids.has(a.asset_id)) problems.push(`${a.asset_id}: duplicate asset_id`); ids.add(a.asset_id);
    if (a.kind === "internal-procedural") {
      if (a.files.length) problems.push(`${a.asset_id}: an internal-procedural asset ships no files (it is generated in code)`);
      continue;
    }
    if (a.commercial_use !== "yes") problems.push(`${a.asset_id}: commercial use is "${a.commercial_use}" — only "yes" is committable`);
    if (!a.repo_redistribution_permitted) problems.push(`${a.asset_id}: the licence does not permit committing/deploying the file`);
    if (a.attribution_required && !a.attribution_text.trim()) problems.push(`${a.asset_id}: attribution is required but no attribution text is recorded`);
    if (!a.license_evidence) problems.push(`${a.asset_id}: no saved licence evidence`);
    else if (!fs.existsSync(path.join(root, a.license_evidence))) problems.push(`${a.asset_id}: licence evidence file is missing (${a.license_evidence})`);
    if (!a.files.length) problems.push(`${a.asset_id}: no files listed`);
  }
  return problems;
}

/** Binary/art files that exist in world asset folders but are not listed under any registry entry. */
export function unregisteredBinaries(reg: { assets: { files: string[] }[] }, dirs: string[], root = process.cwd()): string[] {
  const listed = new Set(reg.assets.flatMap((a) => a.files.map((f) => path.normalize(f))));
  const out: string[] = [];
  const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (BINARY_EXT.test(e.name) && !listed.has(path.normalize(path.relative(root, p)))) out.push(path.relative(root, p)); } };
  for (const d of dirs) walk(path.join(root, d));
  return out;
}
export const WORLD_ASSET_DIRS = ["public/world", "src/world-dev/assets"];
