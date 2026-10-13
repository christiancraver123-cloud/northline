// Reads the folder inbox from disk. Read-only. Root: NORTHLINE_INBOX_DIR, else "../_Inbox (unsorted Higgsfield + ChatGPT downloads)" next to the app.
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildItems, IMAGE_EXT, parseReview, safeRel, type InboxFile, type InboxItem, type ReviewNote } from "./folder";

export const inboxRoot = () => process.env.NORTHLINE_INBOX_DIR?.trim() || path.resolve(process.cwd(), "..", "_Inbox (unsorted Higgsfield + ChatGPT downloads)");
const dirs = async (p: string) => { try { return (await fs.readdir(p, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort(); } catch { return []; } };

export async function listBatches(): Promise<string[]> { return (await dirs(inboxRoot())).reverse(); }

export async function readBatch(batch: string): Promise<InboxItem[]> {
  const root = inboxRoot();
  if (!(await listBatches()).includes(batch)) return [];
  let reviews: Record<string, Record<string, ReviewNote>> = {};
  try { reviews = { [batch]: parseReview(JSON.parse(await fs.readFile(path.join(root, batch, "review.json"), "utf8"))) }; } catch { /* no review.json */ }
  const files: InboxFile[] = [];
  for (const folder of await dirs(path.join(root, batch))) {
    try { for (const file of await fs.readdir(path.join(root, batch, folder))) if (IMAGE_EXT.test(file) && !file.startsWith(".")) files.push({ batch, folder, file }); } catch { /* unreadable */ }
  }
  return buildItems(files, reviews);
}

/** Absolute path for a safe batch/folder/file key, or null. Never escapes the inbox root. */
export function resolveKey(key: string): string | null {
  if (!safeRel(key)) return null;
  const root = inboxRoot(), full = path.resolve(root, key);
  return full.startsWith(root + path.sep) ? full : null;
}
