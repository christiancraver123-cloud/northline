import { afterEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

import { requireOperator } from "./guard";
import { issueToken } from "./session";

const prod = { NODE_ENV: "production", NORTHLINE_ADMIN_PASSWORD: "pw", NORTHLINE_SESSION_SECRET: "sec" };
afterEach(() => { vi.unstubAllEnvs(); cookieValue = undefined; });
const stub = (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) vi.stubEnv(k, v); };

describe("requireOperator (every server action)", () => {
  it("rejects a missing/invalid session in production, even with NORTHLINE_AUTH_DISABLED=true", async () => {
    stub({ ...prod, NORTHLINE_AUTH_DISABLED: "true" });
    await expect(requireOperator()).rejects.toThrow("Not authenticated");
    cookieValue = "garbage.token";
    await expect(requireOperator()).rejects.toThrow("Not authenticated");
  });
  it("allows an authenticated operator when not read-only", async () => {
    stub(prod);
    cookieValue = issueToken("sec");
    await expect(requireOperator()).resolves.toBeUndefined();
  });
  it("in read-only mode an authenticated operator is redirected before any action work starts", async () => {
    stub({ ...prod, NORTHLINE_READONLY: "true" });
    cookieValue = issueToken("sec");
    await expect(requireOperator()).rejects.toThrow("REDIRECT:/?readonly=1");
  });
  it("unauthenticated is still 'Not authenticated' in read-only mode (auth is checked first)", async () => {
    stub({ ...prod, NORTHLINE_READONLY: "true" });
    await expect(requireOperator()).rejects.toThrow("Not authenticated");
  });
});
