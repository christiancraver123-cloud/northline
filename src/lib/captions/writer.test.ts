import { describe, expect, it } from "vitest";
import { cleanCaptions, hashtagsFor, templateCaptions, topicOf } from "./writer";

describe("caption writer", () => {
  it("gives 3 distinct options in her voice, using the scene but never file names", () => {
    expect(topicOf({ concept: "Imported image (IMG_2041.png)" })).toBe("");
    expect(topicOf({ concept: "Sunset rooftop drinks — Brickell" })).toBe("sunset rooftop drinks");
    const a = templateCaptions("SIE", { concept: "Sunset rooftop drinks" });
    expect(new Set(a).size).toBe(3);
    expect(a.join(" ")).not.toMatch(/\.png/);
    expect(templateCaptions("SIE", { concept: "Sunset rooftop drinks" })).toEqual(a); // deterministic
    expect(templateCaptions("SIE", { concept: "Sunset rooftop drinks" }, 3, 1)).not.toEqual(a); // "write more" rotates
    for (const c of ["ALE", "MIL", "VES", "ZOE", "SKY"] as const) expect(templateCaptions(c, { concept: "Imported image (x.png)" })).toHaveLength(3);
  });
  it("filters unsafe or branded output and builds non-branded hashtags", () => {
    expect(cleanCaptions(["fine one", "my nude era", "new nike fit", 42, "", "fine one"])).toEqual(["fine one"]);
    const tags = hashtagsFor("SKY");
    expect(tags.length).toBeGreaterThan(1); expect(tags.every((t) => /^#[a-z0-9]+$/.test(t))).toBe(true); expect(tags).toContain("#sandiego");
  });
});
