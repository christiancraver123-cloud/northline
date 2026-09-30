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
    const v = await db.query<{ e: string }>("select canonical_identity->'core'->>'eyes' as e from talent where code='VES'");
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
  it("reference library invariants: one ACTIVE master per creator; authority must match type", async () => {
    const db = await migrated();
    const ins = (t: string, status = "ACTIVE", auth = t === "MASTER_FACE" ? "MASTER" : "SUPPORTING") =>
      db.query("insert into reference_assets (talent, reference_type, authority, status, storage_path, filename, mime, bytes, sha256, identity_version) values ('SIE',$1,$2,$3,'p','f','image/png',1,'h','SIE-IDENTITY-v1.0')", [t, auth, status]);
    await ins("MASTER_FACE");
    await expect(ins("MASTER_FACE")).rejects.toThrow(); // second active master
    await ins("MASTER_FACE", "ARCHIVED"); // archived masters are fine
    await ins("FACE_FRONT");
    await expect(ins("FACE_FRONT", "ACTIVE", "MASTER")).rejects.toThrow(); // wrong authority
  });
  it("task claim is exclusive and idempotency keys are unique", async () => {
    const db = await migrated();
    await db.query("insert into agents (code, name, role) values ('ORCHESTRATOR','O','r')");
    const t = await db.query<{ id: string }>("insert into agent_tasks (agent_id, kind, title, idempotency_key) values ('ORCHESTRATOR','k','t','key-1') returning id");
    const claim = (w: string) => db.query("update agent_tasks set status='RUNNING', claimed_by=$2 where id=$1 and status='QUEUED' returning id", [t.rows[0].id, w]);
    expect((await claim("w1")).rows).toHaveLength(1);
    expect((await claim("w2")).rows).toHaveLength(0); // loser gets nothing
    await expect(db.query("insert into agent_tasks (agent_id, kind, title, idempotency_key) values ('ORCHESTRATOR','k','t2','key-1')")).rejects.toThrow();
  });
  it("provider job states are the explicit generation states", async () => {
    const db = await migrated();
    const p = await db.query<{ id: string }>("insert into productions (code, talent, content_type) values ('SIE-2026-001','{SIE}','POST') returning id");
    await db.query("insert into provider_jobs (production_id, provider, operation, state) values ($1,'openai','image.generate','SUBMITTED')", [p.rows[0].id]);
    await expect(db.query("insert into provider_jobs (production_id, provider, operation, state) values ($1,'openai','image.generate','COMPLETE')", [p.rows[0].id])).rejects.toThrow();
  });
  it("all operational tables have RLS enabled (server-side access only)", async () => {
    const db = await migrated();
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
});
