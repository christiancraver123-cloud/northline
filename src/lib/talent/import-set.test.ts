// The canonical master import set: exactly one MASTER_FACE per creator, each from that creator's own master-face folder.
import { describe, expect, it } from "vitest";
import { IMPORT_SET } from "../../../scripts/import-references";
import { TALENT_CODES } from "@/lib/domain/types";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";

describe("canonical master import set", () => {
  it("has exactly one MASTER_FACE for each of the six creators, from their own folder", () => {
    for (const c of TALENT_CODES) {
      const masters = IMPORT_SET.filter((e) => e.code === c && e.type === "MASTER_FACE");
      expect(masters, c).toHaveLength(1);
      expect(masters[0].folder).toBe(ROSTER_BY_CODE[c].name);
      expect(masters[0].file).toMatch(new RegExp(`^01 Canonical References/00 Master Face/${c}_canon_master-face-v2_`));
    }
    for (const e of IMPORT_SET) expect(e.file.split("/").pop()!.startsWith(`${e.code}_`), e.file).toBe(true);
  });
});
