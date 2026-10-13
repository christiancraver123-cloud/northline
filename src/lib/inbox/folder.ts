// Folder inbox (ported from the original Mac Command Center): images dropped next to the app in
// "_Inbox (unsorted Higgsfield + ChatGPT downloads)/<batch>/<folder>/<file>", waiting for a human call.
// Pure helpers. The folder is read-only to Northline: nothing is moved, renamed or deleted.
import type { TalentCode } from "@/lib/domain/types";

export const VERDICTS = ["post", "fix", "hold", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];
export type FolderKind = { kind: "creator"; code: TalentCode } | { kind: "collab" } | { kind: "other" };
export interface ReviewNote { verdict: Verdict; note: string }
export interface InboxFile { batch: string; folder: string; file: string }
export interface InboxItem extends InboxFile { key: string; group: FolderKind; review: ReviewNote | null }

const CREATOR_FOLDERS: Record<string, TalentCode> = { sienna: "SIE", alessia: "ALE", mila: "MIL", vesper: "VES", zoe: "ZOE", skye: "SKY" };
/** Marker written into an imported production's brief notes so the inbox can show "already in Northline". */
export const INBOX_NOTE = "From inbox: ";
export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** "Sienna" / "Sienna Veyra" → SIE; "Collabs" → collab; "Reference material - Sienna", "Archive - Zoe", grids… → other (reference only). */
export function classifyFolder(name: string): FolderKind {
  const first = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (CREATOR_FOLDERS[first]) return { kind: "creator", code: CREATOR_FOLDERS[first] };
  if (/^collabs?$/.test(first)) return { kind: "collab" };
  return { kind: "other" };
}

/** A relative inbox path is safe when it has exactly batch/folder/file, no dot segments, and ends in an image. */
export function safeRel(rel: string): boolean {
  if (!rel || rel.length > 600 || rel.includes("\0") || rel.includes("\\")) return false;
  const parts = rel.split("/");
  return parts.length === 3 && parts.every((p) => p !== "" && p !== "." && p !== ".." && !p.startsWith(".")) && IMAGE_EXT.test(rel);
}

/** Parse a batch's review.json ({ items: { "Folder/file.png": { verdict, note } } }). Bad entries are dropped. */
export function parseReview(raw: unknown): Record<string, ReviewNote> {
  const out: Record<string, ReviewNote> = {};
  const items = (raw as { items?: unknown } | null)?.items;
  if (!items || typeof items !== "object") return out;
  for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
    const r = v as { verdict?: unknown; note?: unknown } | null;
    if (r && typeof r.verdict === "string" && (VERDICTS as readonly string[]).includes(r.verdict)) out[k] = { verdict: r.verdict as Verdict, note: typeof r.note === "string" ? r.note.slice(0, 400) : "" };
  }
  return out;
}

export function buildItems(files: InboxFile[], reviews: Record<string, Record<string, ReviewNote>>): InboxItem[] {
  return files.map((f) => ({ ...f, key: `${f.batch}/${f.folder}/${f.file}`, group: classifyFolder(f.folder), review: reviews[f.batch]?.[`${f.folder}/${f.file}`] ?? null })).sort((a, b) => a.key.localeCompare(b.key));
}
