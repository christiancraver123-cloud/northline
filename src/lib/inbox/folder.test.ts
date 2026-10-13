import { describe, expect, it } from "vitest";
import { buildItems, classifyFolder, parseReview, safeRel } from "./folder";

describe("folder inbox (ported)", () => {
  it("maps creator folders by first word; reference folders are never creators", () => {
    expect(classifyFolder("Sienna")).toEqual({ kind: "creator", code: "SIE" });
    expect(classifyFolder("Skye Halston")).toEqual({ kind: "creator", code: "SKY" });
    expect(classifyFolder("Collabs")).toEqual({ kind: "collab" });
    for (const f of ["Reference material - Sienna", "Archive - Zoe", "Unassigned - Needs Review", "Roster", "Unsure - Mila or Skye"]) expect(classifyFolder(f).kind).toBe("other");
  });
  it("only accepts batch/folder/file image paths without traversal", () => {
    expect(safeRel("b/Sienna/x.png")).toBe(true);
    for (const bad of ["../x.png", "b/../x.png", "b/Sienna/x.txt", "b/x.png", "b/.hidden/x.png", "b/Sienna/sub/x.png", "b\\Sienna\\x.png"]) expect(safeRel(bad), bad).toBe(false);
  });
  it("parses review.json defensively and attaches notes", () => {
    const r = parseReview({ items: { "Sienna/a.png": { verdict: "post", note: "ok" }, "Sienna/b.png": { verdict: "delete-everything" }, x: null } });
    expect(r).toEqual({ "Sienna/a.png": { verdict: "post", note: "ok" } });
    const items = buildItems([{ batch: "B", folder: "Sienna", file: "a.png" }], { B: r });
    expect(items[0]).toMatchObject({ key: "B/Sienna/a.png", review: { verdict: "post" }, group: { kind: "creator", code: "SIE" } });
  });
});
