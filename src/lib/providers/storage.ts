import fs from "node:fs";
import path from "node:path";
import type { StorageProvider } from "./types";

/** Local-disk storage for dev/demo (.data/assets). Supabase Storage adapter: see TODO.md. */
export const localStorageProvider: StorageProvider = {
  async save(p, bytes) {
    const full = path.join(process.cwd(), ".data", "assets", p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
    return p;
  },
  async read(p) {
    const full = path.join(process.cwd(), ".data", "assets", path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!full.startsWith(path.join(process.cwd(), ".data", "assets")) || !fs.existsSync(full)) return null;
    return { bytes: fs.readFileSync(full), mime: full.endsWith(".mp4") ? "video/mp4" : "image/png" };
  },
};
