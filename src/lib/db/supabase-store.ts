// Production persistence via Supabase (server-side only; uses the service-role key — never import from client code).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewRecord, Repo } from "./repo";
import type { TableName, Tables } from "./records";

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (o: Record<string, unknown>, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));
// JSON columns keep their inner keys untouched; only top-level columns are renamed.
const table = (t: TableName) => snake(t);

export class SupabaseRepo implements Repo {
  readonly driver = "supabase" as const;
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  private fail(op: string, t: string, e: { message: string }): never {
    throw new Error(`Supabase ${op} on ${t} failed: ${e.message}`);
  }
  async list<T extends TableName>(t: T, filter?: Partial<Tables[T]>) {
    let q = this.db.from(table(t)).select("*");
    for (const [k, v] of Object.entries(filter ?? {})) if (v !== undefined) q = q.eq(snake(k), v as never);
    const { data, error } = await q.order("created_at", { ascending: true }) // same contract as the file store: oldest first; pages sort newest-first explicitly;
    if (error) this.fail("list", t, error);
    return (data ?? []).map((r) => mapKeys(r, camel)) as unknown as Tables[T][];
  }
  async get<T extends TableName>(t: T, id: string) {
    const { data, error } = await this.db.from(table(t)).select("*").eq("id", id).maybeSingle();
    if (error) this.fail("get", t, error);
    return data ? (mapKeys(data, camel) as unknown as Tables[T]) : null;
  }
  async insert<T extends TableName>(t: T, rec: NewRecord<T>) {
    const { data, error } = await this.db.from(table(t)).insert(mapKeys(rec as Record<string, unknown>, snake)).select().single();
    if (error) this.fail("insert", t, error);
    return mapKeys(data, camel) as unknown as Tables[T];
  }
  async update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) {
    const p = mapKeys(patch as Record<string, unknown>, snake);
    delete p.id;
    const { data, error } = await this.db.from(table(t)).update({ ...p, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) this.fail("update", t, error);
    return mapKeys(data, camel) as unknown as Tables[T];
  }
  async claim<T extends TableName>(t: T, id: string, expect: Partial<Tables[T]>, patch: Partial<Tables[T]>) {
    // Single conditional UPDATE ... WHERE id = $1 AND <expected columns>: Postgres row locking guarantees only one caller matches.
    const p = mapKeys(patch as Record<string, unknown>, snake);
    delete p.id;
    let q = this.db.from(table(t)).update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
    for (const [k, v] of Object.entries(expect)) if (v !== undefined) q = v === null ? q.is(snake(k), null) : q.eq(snake(k), v as never);
    const { data, error } = await q.select();
    if (error) this.fail("claim", t, error);
    return data && data.length ? (mapKeys(data[0], camel) as unknown as Tables[T]) : null;
  }
  async nextProductionSeq(code: string, year: number) {
    const { data, error } = await this.db.rpc("next_production_seq", { p_code: code, p_year: year });
    if (error) this.fail("rpc next_production_seq", "production_sequences", error);
    return data as number;
  }
}
