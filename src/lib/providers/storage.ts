import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./types";
import { assertProductionConfig, isReadOnly, readOnlyStorage } from "@/lib/runtime/mode";

const ROOT = () => path.join(process.cwd(), ".data", "assets");
const safe = (p: string) => path.normalize(p).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
const mimeOf = (p: string) => (p.endsWith(".mp4") ? "video/mp4" : p.endsWith(".jpg") || p.endsWith(".jpeg") ? "image/jpeg" : p.endsWith(".webp") ? "image/webp" : "image/png");

/** Local-disk storage for dev/demo (.data/assets). */
export const localStorageProvider: StorageProvider = {
  async save(p, bytes) {
    const full = path.join(ROOT(), safe(p));
    if (!full.startsWith(ROOT())) throw new Error("invalid storage path");
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
    return p;
  },
  async read(p) {
    const full = path.join(ROOT(), safe(p));
    if (!full.startsWith(ROOT()) || !fs.existsSync(full)) return null;
    return { bytes: fs.readFileSync(full), mime: mimeOf(full) };
  },
};

/** Supabase Storage (private bucket `northline-assets`). Server-side, service-role only. NOT exercised against a live project yet. */
export function supabaseStorageProvider(url: string, serviceKey: string, bucket = "northline-assets"): StorageProvider {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async save(p, bytes, mime) {
      const { error } = await db.storage.from(bucket).upload(safe(p), bytes, { contentType: mime, upsert: false });
      if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
      return p;
    },
    async read(p) {
      const { data, error } = await db.storage.from(bucket).download(safe(p));
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || mimeOf(p) };
    },
  };
}

export function getStorage(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  assertProductionConfig(env); // production fails closed: never silently use local disk
  const base = env.NORTHLINE_STORE === "supabase" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? supabaseStorageProvider(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : localStorageProvider;
  return isReadOnly(env) ? readOnlyStorage(base) : base;
}
