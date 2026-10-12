// Import an organised creator image package (folder with manifest.csv + <Persona>/<Category>/<file>) into Northline
// as ARCHIVED library productions. See src/lib/pipeline/library.ts for exactly what is (and is not) created.
//
//   npx tsx scripts/import-library.ts --dir "<extracted package>" --batch 2026-10-12 [--dry-run]
//
// Uses NORTHLINE_STORE / SUPABASE_* from the environment, like the app. Re-running is a no-op (sha256 dedupe).
import fs from "node:fs";
import path from "node:path";
import { getRepo } from "../src/lib/db";
import { getStorage } from "../src/lib/providers/storage";
import { importLibrary, type LibraryItem } from "../src/lib/pipeline/library";
import type { TalentCode } from "../src/lib/domain/types";

export const PERSONA: Record<string, TalentCode> = { Sienna: "SIE", Alessia: "ALE", Mila: "MIL", Vesper: "VES", Zoe: "ZOE", Skye: "SKY" };
/** Never imported: content-floor risks, unidentified people, test files, multi-creator images (one asset = one creator). */
export function skipReason(rel: string): string | null {
  const [persona, category] = rel.split("/");
  const f = rel.toLowerCase();
  if (!PERSONA[persona]) return `no single creator (${persona})`;
  if (/nsfw/.test(f)) return "labelled NSFW (content floor)";
  if (category === "Test_Placeholders") return "test placeholder";
  return null;
}

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function main() {
  const dir = arg("--dir"), batch = arg("--batch") ?? new Date().toISOString().slice(0, 10), dryRun = process.argv.includes("--dry-run");
  if (!dir || !fs.existsSync(path.join(dir, "manifest.csv"))) throw new Error('Pass --dir "<folder containing manifest.csv>"');
  const [head, ...rows] = parseCsv(fs.readFileSync(path.join(dir, "manifest.csv"), "utf8")).filter((r) => r.length > 1);
  const fi = head.indexOf("filename");
  const items: LibraryItem[] = [], skipped: [string, string][] = [];
  for (const r of rows) {
    const rel = r[fi], why = skipReason(rel);
    if (why) { skipped.push([rel, why]); continue; }
    const full = path.join(dir, rel);
    if (!fs.existsSync(full)) { skipped.push([rel, "file missing"]); continue; }
    items.push({ talent: PERSONA[rel.split("/")[0]], category: rel.split("/")[1], filename: path.basename(rel), bytes: new Uint8Array(fs.readFileSync(full)) });
  }
  console.log(`store=${process.env.NORTHLINE_STORE ?? "file"} batch=${batch} dry-run=${dryRun} candidates=${items.length} skipped=${skipped.length}`);
  const res = await importLibrary(await getRepo(), getStorage(), items, { batch, dryRun });
  console.log(JSON.stringify({ ...res, skipped }, null, 1));
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("import-library")) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
