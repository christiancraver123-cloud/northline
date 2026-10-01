// Deployment-mode guards. Names only: this module never reads, logs or returns a secret VALUE.
//  * Production fails CLOSED unless the Supabase store is configured (no silent demo/file store on a host).
//  * NORTHLINE_READONLY=true turns every mutation off while keeping authenticated viewing working.
import type { Repo, NewRecord } from "@/lib/db/repo";
import type { TableName, Tables } from "@/lib/db/records";
import type { StorageProvider } from "@/lib/providers/types";

type Env = Record<string, string | undefined>;

export const isProduction = (env: Env = process.env) => env.NODE_ENV === "production";
export const isReadOnly = (env: Env = process.env) => ["true", "1", "yes"].includes((env.NORTHLINE_READONLY ?? "").trim().toLowerCase());

export class ProductionConfigError extends Error {
  constructor(public problems: string[]) { super(`Northline is misconfigured for production: ${problems.join("; ")}.`); }
}
export class ReadOnlyError extends Error {
  constructor(what = "this action") { super(`Northline is in read-only mode (NORTHLINE_READONLY): ${what} is disabled.`); }
}

/** Problems that make a PRODUCTION deployment unsafe. Names of variables only — never values. Empty outside production. */
export function productionConfigProblems(env: Env = process.env): string[] {
  if (!isProduction(env)) return [];
  const p: string[] = [];
  if (env.NORTHLINE_STORE !== "supabase") p.push("NORTHLINE_STORE must be \"supabase\" (the local demo store is not allowed in production)");
  if (!env.SUPABASE_URL) p.push("SUPABASE_URL is not set");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) p.push("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!env.NORTHLINE_ADMIN_PASSWORD) p.push("NORTHLINE_ADMIN_PASSWORD is not set");
  if (!env.NORTHLINE_SESSION_SECRET) p.push("NORTHLINE_SESSION_SECRET is not set");
  return p;
}
export function assertProductionConfig(env: Env = process.env) {
  const p = productionConfigProblems(env);
  if (p.length) throw new ProductionConfigError(p);
}

/** A Repo that reads normally and refuses every write. Wraps the real repo when NORTHLINE_READONLY is on. */
export function readOnlyRepo(inner: Repo): Repo {
  const deny = (what: string) => async (): Promise<never> => { throw new ReadOnlyError(what); };
  return {
    driver: inner.driver,
    list: <T extends TableName>(t: T, f?: Partial<Tables[T]>) => inner.list(t, f),
    get: <T extends TableName>(t: T, id: string) => inner.get(t, id),
    insert: deny("writing records") as <T extends TableName>(t: T, rec: NewRecord<T>) => Promise<Tables[T]>,
    update: deny("updating records") as Repo["update"],
    claim: deny("running tasks") as Repo["claim"],
    nextProductionSeq: deny("creating productions"),
  };
}

export function readOnlyStorage(inner: StorageProvider): StorageProvider {
  return { read: (p) => inner.read(p), save: async () => { throw new ReadOnlyError("storing files"); } };
}

/** For machine endpoints: a ready 403 body when read-only, else null. */
export const readOnlyResponse = (env: Env = process.env) => (isReadOnly(env) ? { ok: false, error: "read-only mode: this endpoint is disabled" } : null);
