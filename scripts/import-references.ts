// Import canonical reference images from a local folder into the EXISTING reference system
// (referenceAssets + the configured StorageProvider). Uses uploadReference(), so every rule of the
// reference library applies: image validation, one active master per creator, identity version.
//
// Images are read from disk at run time and are never copied into the repo.
//
//   npx tsx scripts/import-references.ts --root "<…>/Northline Media/AI Influencers" [--dry-run] [--replace-master SIE,VES]
//
// Uses NORTHLINE_STORE / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment, like the app.
// Idempotent: a file whose sha256 already exists as an ACTIVE reference for that creator is skipped.
// A MASTER_FACE is only replaced for creators listed in --replace-master; otherwise it is reported as a conflict.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRepo } from "../src/lib/db";
import { getStorage } from "../src/lib/providers/storage";
import { uploadReference } from "../src/lib/references/service";
import { REFERENCE_TYPES, TALENT_CODES, type ReferenceType, type TalentCode } from "../src/lib/domain/types";

type Entry = { code: TalentCode; folder: string; file: string; type: ReferenceType; notes: string };

const FACE = "01 Canonical References/00 Master Face";
/** The six masters selected in the Northline Media folder (2026-09-30) plus Sienna's two supporting references. */
export const IMPORT_SET: Entry[] = [
  { code: "SIE", folder: "Sienna Veyra", file: `${FACE}/SIE_canon_master-face-v2_sunset-beach_2026-09-30.png`, type: "MASTER_FACE", notes: "Operator's final master proof (2026-09-30)." },
  { code: "SIE", folder: "Sienna Veyra", file: `${FACE}/SIE_canon_master-face-01_sunset-balcony_2026-09-29.png`, type: "FACE_3Q_RIGHT", notes: "Operator ChatGPT face lock (2026-09-29); face turned toward image-right." },
  { code: "SIE", folder: "Sienna Veyra", file: `${FACE}/SIE_canon_master-face-02_night-rooftop_2026-09-29.png`, type: "UPPER_BODY", notes: "Operator ChatGPT face lock (2026-09-29); seated, waist-up." },
  { code: "ALE", folder: "Alessia Varenne", file: `${FACE}/ALE_canon_master-face-v2_paris-dinner-flash_2026-09-30.png`, type: "MASTER_FACE", notes: "Operator's final master proof (brown eyes, no freckles)." },
  { code: "MIL", folder: "Mila Calloway", file: `${FACE}/MIL_canon_master-face-v2_stadium-concert-wink_2026-09-30.png`, type: "MASTER_FACE", notes: "Operator's final master proof. One eye closed (wink): hazel eye colour not verifiable from this image." },
  { code: "VES", folder: "Vesper Laurent", file: `${FACE}/VES_canon_master-face-v2_la-night-balcony_2026-09-30.png`, type: "MASTER_FACE", notes: "Operator's final master proof. Eyes checked: image-left green, image-right icy blue-gray. Scar through left eyebrow not visible." },
  { code: "ZOE", folder: "Zoe Avell", file: `${FACE}/ZOE_canon_master-face-v2_poolside-matcha_2026-09-30.png`, type: "MASTER_FACE", notes: "Operator's final master proof. Brown eyes and LEFT-nostril stud checked. Wears gold hoops (not in her locks)." },
  {
    code: "SKY", folder: "Skye Halston", file: `${FACE}/SKY_canon_master-face-v2_poolside-sunset-bun_2026-09-30.png`, type: "MASTER_FACE",
    notes: "REVIEW REQUIRED: hard lock is beauty mark on her LEFT cheek; this master shows it on her RIGHT cheek (image-left). Lock unchanged; operator to keep or regenerate this master.",
  },
];

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

export async function main() {
  const root = arg("--root");
  if (!root || !fs.existsSync(path.join(root, "01 TALENT"))) throw new Error('Pass --root "<Northline Media>/AI Influencers" (the folder that contains "01 TALENT").');
  const dry = process.argv.includes("--dry-run");
  const replace = new Set((arg("--replace-master") ?? "").split(",").filter(Boolean));
  const repo = await getRepo();
  const storage = getStorage();
  console.log(`store=${process.env.NORTHLINE_STORE ?? "file"} dry-run=${dry}`);

  const report: Array<Record<string, string>> = [];
  for (const e of IMPORT_SET) {
    if (!TALENT_CODES.includes(e.code) || !REFERENCE_TYPES.includes(e.type)) throw new Error(`bad entry ${e.code} ${e.type}`);
    const full = path.join(root, "01 TALENT", e.folder, e.file);
    if (!fs.existsSync(full)) { report.push({ code: e.code, type: e.type, result: "MISSING FILE", file: e.file }); continue; }
    const bytes = new Uint8Array(fs.readFileSync(full));
    const sha = createHash("sha256").update(bytes).digest("hex");
    const refs = (await repo.list("referenceAssets", { talent: e.code })).filter((r) => r.status === "ACTIVE");
    if (refs.some((r) => r.sha256 === sha)) { report.push({ code: e.code, type: e.type, result: "skipped (already imported)", sha: sha.slice(0, 12) }); continue; }
    const master = refs.find((r) => r.referenceType === "MASTER_FACE");
    let replaceId: string | undefined;
    if (e.type === "MASTER_FACE" && master) {
      if (!replace.has(e.code)) { report.push({ code: e.code, type: e.type, result: `CONFLICT: active master ${master.id} exists (pass --replace-master ${e.code})` }); continue; }
      replaceId = master.id;
    }
    if (dry) { report.push({ code: e.code, type: e.type, result: replaceId ? `would replace master ${replaceId}` : "would import", sha: sha.slice(0, 12) }); continue; }
    const ref = await uploadReference(repo, storage, { talent: e.code, type: e.type, bytes, filename: path.basename(e.file), notes: e.notes, createdBy: "operator import", replaceId });
    const back = await storage.read(ref.storagePath);
    const ok = back && createHash("sha256").update(back.bytes).digest("hex") === sha;
    report.push({ code: e.code, type: e.type, result: ok ? "imported (storage read-back identical)" : "IMPORTED BUT READ-BACK FAILED", id: ref.id, storagePath: ref.storagePath, identity: ref.identityVersion });
  }
  console.table(report);
  for (const c of TALENT_CODES) {
    const masters = (await repo.list("referenceAssets", { talent: c })).filter((r) => r.status === "ACTIVE" && r.referenceType === "MASTER_FACE");
    console.log(`${c}: ${masters.length} active master${masters.length === 1 ? "" : "s"}`);
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("import-references")) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
