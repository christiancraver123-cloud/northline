// Applies every SQL migration to a real (embedded) Postgres and checks schema behaviour. Does NOT test supabase-js / PostgREST.
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { TABLE_NAMES } from "./records";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

async function migrated() {
  const db = new PGlite();
  for (const f of files) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  return db;
}

describe("supabase migrations (embedded Postgres)", () => {
  it("apply cleanly in order and create every table the repo layer uses", async () => {
    const db = await migrated();
    const { rows } = await db.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public'");
    const have = new Set(rows.map((r) => r.table_name));
    for (const t of TABLE_NAMES) expect(have.has(snake(t)), snake(t)).toBe(true);
    expect(have.has("talent")).toBe(true);
  });
  it("seeds exactly the six canonical creators", async () => {
    const db = await migrated();
    const { rows } = await db.query<{ code: string; name: string }>("select code, name from talent order by code");
    expect(rows.map((r) => `${r.code}:${r.name}`).sort()).toEqual(["ALE:Alessia Varenne", "MIL:Mila Calloway", "SIE:Sienna Veyra", "SKY:Skye Halston", "VES:Vesper Laurent", "ZOE:Zoe Avell"]);
    const v = await db.query<{ e: string }>("select canonical_identity->'identity'->>'eyes' as e from talent where code='VES'");
    expect(v.rows[0].e).toMatch(/LEFT side of image = emerald green/);
  });
  it("next_production_seq is sequential per creator+year", async () => {
    const db = await migrated();
    const n = async (c: string, y: number) => (await db.query<{ n: number }>("select next_production_seq($1,$2) as n", [c, y])).rows[0].n;
    expect([await n("SIE", 2026), await n("SIE", 2026), await n("VES", 2026), await n("SIE", 2027)]).toEqual([1, 2, 1, 1]);
  });
  it("enforces invariants: generated assets can never be marked reference; priority range; enum statuses", async () => {
    const db = await migrated();
    const p = await db.query<{ id: string }>("insert into productions (code, talent, content_type) values ('SIE-2026-001','{SIE}','POST') returning id");
    await expect(db.query("insert into assets (production_id, talent, kind, seq, provider, filename, is_reference) values ($1,'{SIE}','IMG',1,'mock','f.png',true)", [p.rows[0].id])).rejects.toThrow();
    await expect(db.query("insert into productions (code, talent, content_type, status) values ('X','{SIE}','POST','BOGUS')")).rejects.toThrow();
    await expect(db.query("insert into agent_tasks (agent_id, kind, title, priority) values ('ORCH','k','t',9)")).rejects.toThrow();
  });
  it("all operational tables have RLS enabled (server-side access only)", async () => {
    const db = await migrated();
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
});
