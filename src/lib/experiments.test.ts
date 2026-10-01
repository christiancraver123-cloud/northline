import { describe, expect, it } from "vitest";
import { safeExperimentPath } from "./experiments";

describe("experiment file paths are whitelisted", () => {
  it("accepts the known artifact names", () => {
    expect(safeExperimentPath("sie-identity-probe-v1", "manifest.json")).toBe("experiments/sie-identity-probe-v1/manifest.json");
    expect(safeExperimentPath("sie-identity-probe-v1", "B_master_high_fidelity.png")).toBe("experiments/sie-identity-probe-v1/B_master_high_fidelity.png");
  });
  it("rejects traversal, odd ids and non-image/json files", () => {
    for (const [id, f] of [["..", "manifest.json"], ["a/b", "x.png"], ["sie", "../../etc/passwd.png"], ["sie", "x.exe"], ["SIE", "x.png"], ["sie", "a/b.png"], ["sie", ".png"], ["", "x.png"]] as const) expect(safeExperimentPath(id, f), `${id} ${f}`).toBeNull();
  });
});
