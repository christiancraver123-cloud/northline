import { describe, expect, it } from "vitest";
import { suggestSlot } from "@/lib/orchestrator/schedule";
import { missedSlots, nightSteps, nyDay, nyInstant, tonightSlots } from "./tonight";

const e = (id: string, date: string, time: string, state: "APPROVED" | "PUBLISHED" = "APPROVED") => ({ id, productionId: id, talent: "SIE" as const, date, time, state });

describe("tonight (ported)", () => {
  const now = new Date("2026-10-12T23:00:00Z"); // 19:00 in New York (EDT)
  it("uses New York wall-clock time", () => {
    expect(nyDay(now)).toBe("2026-10-12");
    expect(nyInstant("2026-10-12", "19:00").toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(nyDay(new Date("2026-10-13T02:00:00Z"))).toBe("2026-10-12"); // 22:00 NY is still the 12th
  });
  it("splits today's open slots from missed ones; posted slots never show", () => {
    const rows = [e("a", "2026-10-12", "21:00"), e("b", "2026-10-12", "09:00"), e("c", "2026-10-11", "19:00"), e("d", "2026-10-10", "19:00", "PUBLISHED"), e("f", "2026-10-13", "19:00")];
    expect(tonightSlots(rows, now).map((x) => x.id)).toEqual(["b", "a"]);
    expect(missedSlots(rows, now).map((x) => x.id)).toEqual(["c"]);
  });
  it("nightly checklist follows the production", () => {
    expect(nightSteps({ status: "RAW" }, true).map((s) => s.done)).toEqual([true, false, false]);
    expect(nightSteps({ status: "APPROVED" }, true).map((s) => s.done)).toEqual([true, true, false]);
  });
  it("next open slot counts days in New York, not UTC (9:50pm ET → tomorrow is the 13th)", () => {
    expect(suggestSlot([], "SIE", new Date("2026-10-13T01:50:00Z")).date).toBe("2026-10-13");
  });
});
