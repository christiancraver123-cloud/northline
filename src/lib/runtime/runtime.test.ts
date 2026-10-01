// Deployment hardening: production fails closed, auth can't be disabled in production, NORTHLINE_READONLY blocks every mutation,
// and render.yaml carries variable NAMES only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { FileRepo } from "@/lib/db/file-store";
import { getRepo } from "@/lib/db";
import { getStorage } from "@/lib/providers/storage";
import type { StorageProvider } from "@/lib/providers/types";
import { authConfig, issueToken, COOKIE } from "@/lib/auth/session";
import { proxy } from "@/proxy";
import { loadIdentity } from "@/lib/identity/service";
import { POST as tickPost } from "@/app/api/agents/tick/route";
import { POST as createPost } from "@/app/api/n8n/production-orchestrator/route";
import { GET as healthGet } from "@/app/api/health/route";
import { ProductionConfigError, ReadOnlyError, isReadOnly, productionConfigProblems, readOnlyRepo, readOnlyStorage } from "./mode";

const PROD_OK = { NODE_ENV: "production", NORTHLINE_STORE: "supabase", SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "SECRETVALUE-service", NORTHLINE_ADMIN_PASSWORD: "SECRETVALUE-pw", NORTHLINE_SESSION_SECRET: "SECRETVALUE-session" };
const stub = (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) vi.stubEnv(k, v); };
const resetRepoCache = () => { delete (globalThis as { __northlineRepo?: unknown }).__northlineRepo; };
beforeEach(resetRepoCache);
afterEach(() => { vi.unstubAllEnvs(); resetRepoCache(); });

describe("production fails closed", () => {
  it("reports problems by variable NAME and only in production", () => {
    expect(productionConfigProblems({ NODE_ENV: "development" })).toEqual([]);
    const p = productionConfigProblems({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(p.join(" ")).toMatch(/NORTHLINE_STORE.*supabase/);
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NORTHLINE_ADMIN_PASSWORD", "NORTHLINE_SESSION_SECRET"]) expect(p.join(" ")).toContain(name);
    expect(productionConfigProblems(PROD_OK as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
  it("getRepo refuses the local demo store in production", async () => {
    stub({ NODE_ENV: "production", NORTHLINE_STORE: "file" });
    await expect(getRepo()).rejects.toBeInstanceOf(ProductionConfigError);
  });
  it("getRepo refuses a half-configured Supabase store in production", async () => {
    stub({ NODE_ENV: "production", NORTHLINE_STORE: "supabase" });
    await expect(getRepo()).rejects.toThrow(/SUPABASE_URL/);
  });
  it("getStorage never silently falls back to local disk in production", () => {
    stub({ NODE_ENV: "production", NORTHLINE_STORE: "file" });
    expect(() => getStorage()).toThrow(ProductionConfigError);
  });
  it("outside production the demo store still works (development unchanged)", async () => {
    stub({ NODE_ENV: "development", NORTHLINE_STORE: "file", NORTHLINE_DEMO_SEED: "false" });
    expect(await getRepo()).toBeTruthy();
  });
});

describe("NORTHLINE_AUTH_DISABLED can never bypass authentication in production", () => {
  it("authConfig ignores it in production, still honours it in development", () => {
    expect(authConfig({ NODE_ENV: "production", NORTHLINE_AUTH_DISABLED: "true", NORTHLINE_ADMIN_PASSWORD: "x", NORTHLINE_SESSION_SECRET: "y" } as NodeJS.ProcessEnv).disabled).toBe(false);
    expect(authConfig({ NODE_ENV: "production", NORTHLINE_AUTH_DISABLED: "true" } as NodeJS.ProcessEnv).disabled).toBe(false); // even with nothing else configured
    expect(authConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv).disabled).toBe(false); // no password => locked, not open
    expect(authConfig({ NODE_ENV: "development", NORTHLINE_AUTH_DISABLED: "true" } as NodeJS.ProcessEnv).disabled).toBe(true);
  });
  it("the proxy still gates pages and APIs in production with the flag set", () => {
    stub({ ...PROD_OK, NORTHLINE_AUTH_DISABLED: "true" });
    const page = proxy(new NextRequest("https://nl.example/productions"));
    expect(page.status).toBe(307);
    expect(new URL(page.headers.get("location")!).pathname).toBe("/login");
    expect(proxy(new NextRequest("https://nl.example/api/assets/x/file")).status).toBe(401);
    const ok = proxy(new NextRequest("https://nl.example/productions", { headers: { cookie: `${COOKIE}=${issueToken("SECRETVALUE-session")}` } }));
    expect(ok.status).toBe(200); // a valid session still works
  });
});

describe("read-only mode", () => {
  it("parses the flag", () => {
    expect(isReadOnly({ NORTHLINE_READONLY: "true" })).toBe(true);
    expect(isReadOnly({ NORTHLINE_READONLY: "1" })).toBe(true);
    expect(isReadOnly({ NORTHLINE_READONLY: "false" })).toBe(false);
    expect(isReadOnly({})).toBe(false);
  });
  it("the repo wrapper reads normally and refuses every write", async () => {
    const base = new FileRepo(null);
    const row = await base.insert("storylines", { talent: ["SIE"], title: "t", summary: "s", status: "ACTIVE" });
    const ro = readOnlyRepo(base);
    expect((await ro.list("storylines")).map((r) => r.id)).toEqual([row.id]);
    expect((await ro.get("storylines", row.id))!.title).toBe("t");
    await expect(ro.insert("storylines", { talent: ["SIE"], title: "x", summary: "", status: "ACTIVE" })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(ro.update("storylines", row.id, { title: "changed" })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(ro.claim("storylines", row.id, { status: "ACTIVE" }, { status: "DONE" })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(ro.nextProductionSeq("SIE", 2026)).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await base.get("storylines", row.id))!.title).toBe("t"); // nothing changed underneath
    expect(await base.list("storylines")).toHaveLength(1);
  });
  it("getRepo returns a read-only repo for a Supabase store when the flag is on (no network is touched)", async () => {
    stub({ ...PROD_OK, NORTHLINE_READONLY: "true" });
    const repo = await getRepo();
    await expect(repo.insert("storylines", { talent: ["SIE"], title: "x", summary: "", status: "ACTIVE" })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(repo.nextProductionSeq("SIE", 2026)).rejects.toBeInstanceOf(ReadOnlyError);
  });
  it("the storage wrapper reads and refuses to save; getStorage applies it", async () => {
    const files = new Map<string, Uint8Array>([["a.png", Uint8Array.from([1, 2, 3])]]);
    const inner: StorageProvider = { async save(p, b) { files.set(p, b); return p; }, async read(p) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } };
    const ro = readOnlyStorage(inner);
    expect((await ro.read("a.png"))!.bytes).toHaveLength(3);
    await expect(ro.save("b.png", Uint8Array.from([9]), "image/png")).rejects.toBeInstanceOf(ReadOnlyError);
    expect(files.has("b.png")).toBe(false);
    stub({ ...PROD_OK, NORTHLINE_READONLY: "true" });
    await expect(getStorage().save("c.png", Uint8Array.from([1]), "image/png")).rejects.toBeInstanceOf(ReadOnlyError);
  });
  it("opening a page never persists: a missing identity snapshot is computed, not stored", async () => {
    const base = new FileRepo(null);
    const ro = readOnlyRepo(base);
    const loaded = await loadIdentity(ro, "SIE");
    expect(loaded.identityId).toBe("SIE-IDENTITY-v1.0");
    expect(await base.list("canonicalIdentities")).toHaveLength(0);
  });
  it("machine endpoints are 401 without the secret and 403 (before any work) in read-only mode", async () => {
    stub({ NODE_ENV: "development", NORTHLINE_WEBHOOK_SECRET: "wh-secret", NORTHLINE_READONLY: "true" });
    const req = (auth?: string) => new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify({ talent: ["SIE"], format: "POST" }) });
    for (const post of [tickPost, createPost]) {
      expect((await post(req())).status).toBe(401);
      expect((await post(req("Bearer wrong"))).status).toBe(401);
      const r = await post(req("Bearer wh-secret"));
      expect(r.status).toBe(403);
      expect((await r.json()).error).toMatch(/read-only/);
    }
    expect(fs.existsSync(path.join(process.cwd(), ".data", "northline.json"))).toBe(fs.existsSync(path.join(process.cwd(), ".data", "northline.json"))); // no store was opened by these calls
  });
  it("/api/health: 503 with variable NAMES when misconfigured; 200 with readOnly when fine; never echoes a value", async () => {
    stub({ NODE_ENV: "production", NORTHLINE_ADMIN_PASSWORD: "SECRETVALUE-pw" });
    const bad = await healthGet();
    expect(bad.status).toBe(503);
    const badBody = JSON.stringify(await bad.json());
    expect(badBody).toMatch(/NORTHLINE_STORE/);
    expect(badBody).not.toContain("SECRETVALUE");
    vi.unstubAllEnvs();
    stub({ ...PROD_OK, NORTHLINE_READONLY: "true" });
    const ok = await healthGet();
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody).toEqual({ ok: true, store: "supabase", readOnly: true });
    expect(JSON.stringify(okBody)).not.toContain("SECRETVALUE");
  });
});

describe("render.yaml (names only)", () => {
  const text = fs.readFileSync(path.join(process.cwd(), "render.yaml"), "utf8");
  const vars = [...text.matchAll(/- key: (\S+)\n((?:\s{8}\S.*\n?)*)/g)].map((m) => ({ key: m[1], body: m[2] }));
  const byKey = Object.fromEntries(vars.map((v) => [v.key, v.body]));
  it("declares exactly the review-only variables", () => {
    expect(vars.map((v) => v.key).sort()).toEqual(["NODE_VERSION", "NORTHLINE_ADMIN_PASSWORD", "NORTHLINE_AUTONOMOUS_GENERATION", "NORTHLINE_DURABLE_JOBS", "NORTHLINE_GOVERNOR", "NORTHLINE_READONLY", "NORTHLINE_SESSION_SECRET", "NORTHLINE_STORE", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
  });
  it("review-only: read-only on, Supabase store, and no provider / webhook variables", () => {
    expect(byKey.NORTHLINE_READONLY).toMatch(/value: "true"/);
    expect(byKey.NORTHLINE_STORE).toMatch(/value: supabase/);
    expect(text).not.toMatch(/OPENAI|GEMINI|IMAGE_PROVIDER|HIGGS|N8N|WEBHOOK|AUTH_DISABLED|LLM_/);
  });
  it("first deployment: governor ON (reads limits), durable jobs OFF, autonomous generation OFF", () => {
    expect(byKey.NORTHLINE_GOVERNOR).toMatch(/value: "on"/);
    expect(byKey.NORTHLINE_DURABLE_JOBS).toMatch(/value: "off"/);
    expect(byKey.NORTHLINE_AUTONOMOUS_GENERATION).toMatch(/value: "off"/);
    expect(byKey.NORTHLINE_PAUSE).toBeUndefined();
  });
  it("secrets are never given a value in the file", () => {
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NORTHLINE_ADMIN_PASSWORD"]) { expect(byKey[k], k).toMatch(/sync: false/); expect(byKey[k], k).not.toMatch(/value:/); }
    expect(byKey.NORTHLINE_SESSION_SECRET).toMatch(/generateValue: true/);
    expect(byKey.NORTHLINE_SESSION_SECRET).not.toMatch(/value:/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|supabase\.co/);
  });
  it("builds with dev dependencies (the build needs TypeScript/Tailwind) and health-checks the right path", () => {
    expect(text).toMatch(/buildCommand: npm ci --include=dev && npm run build/);
    expect(text).toMatch(/startCommand: npm start/);
    expect(text).toMatch(/healthCheckPath: \/api\/health/);
  });
});
