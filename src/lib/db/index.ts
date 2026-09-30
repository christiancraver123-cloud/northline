import { FileRepo } from "./file-store";
import { SupabaseRepo } from "./supabase-store";
import { seedDemo } from "./seed";
import type { Repo } from "./repo";

const g = globalThis as unknown as { __northlineRepo?: Promise<Repo> };

export function storeDriver(): "file" | "supabase" {
  return process.env.NORTHLINE_STORE === "supabase" ? "supabase" : "file";
}

export function getRepo(): Promise<Repo> {
  g.__northlineRepo ??= (async () => {
    if (storeDriver() === "supabase") {
      const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("NORTHLINE_STORE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side env).");
      return new SupabaseRepo(url, key);
    }
    const repo = new FileRepo();
    if (!repo.seeded) { await seedDemo(repo, { productions: process.env.NORTHLINE_DEMO_SEED !== "false" }); repo.markSeeded(); }
    return repo;
  })();
  return g.__northlineRepo;
}
