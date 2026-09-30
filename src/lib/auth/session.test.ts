import { describe, expect, it } from "vitest";
import { authConfig, isPublicPath, issueToken, passwordOk, verifyToken } from "./session";

describe("operator session auth", () => {
  it("accepts a fresh signed token, rejects tampered/expired/wrong-secret", () => {
    const t = issueToken("s3cret", 1_000_000);
    expect(verifyToken(t, "s3cret", 1_000_000 + 1000)).toBe(true);
    expect(verifyToken(t, "other", 1_000_000)).toBe(false);
    expect(verifyToken(t + "x", "s3cret", 1_000_000)).toBe(false);
    expect(verifyToken(t, "s3cret", 1_000_000 + 13 * 3600 * 1000)).toBe(false);
    expect(verifyToken(undefined, "s3cret")).toBe(false);
    expect(verifyToken(t, undefined)).toBe(false);
  });
  it("password check is exact", () => {
    expect(passwordOk("abc", "abc")).toBe(true);
    expect(passwordOk("abd", "abc")).toBe(false);
    expect(passwordOk("abc", undefined)).toBe(false);
  });
  it("fails closed in production without credentials, open in dev", () => {
    expect(authConfig({ NODE_ENV: "production" } as never).disabled).toBe(false);
    expect(authConfig({ NODE_ENV: "development" } as never).disabled).toBe(true);
    expect(authConfig({ NODE_ENV: "development", NORTHLINE_ADMIN_PASSWORD: "x" } as never).disabled).toBe(false);
    expect(authConfig({ NODE_ENV: "production", NORTHLINE_AUTH_DISABLED: "true" } as never).disabled).toBe(true);
  });
  it("only machine endpoints and login are public", () => {
    for (const p of ["/login", "/api/health", "/api/n8n/production-orchestrator", "/api/create", "/api/agents/tick"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/agents", "/api/assets/1/file", "/approvals"]) expect(isPublicPath(p)).toBe(false);
  });
});
