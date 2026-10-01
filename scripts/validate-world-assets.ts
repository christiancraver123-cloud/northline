// Validates docs/world-assets/registry.json and that no unregistered art files exist. Exit 1 on any problem.  Usage: npm run world:assets
import fs from "node:fs";
import path from "node:path";
import { WORLD_ASSET_DIRS, unregisteredBinaries, validateRegistry } from "../src/lib/world/assets";
const reg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/world-assets/registry.json"), "utf8"));
const problems = [...validateRegistry(reg), ...unregisteredBinaries(reg, WORLD_ASSET_DIRS).map((f) => `${f}: art/binary file is not listed in the asset registry`)];
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`world asset registry OK (${reg.assets.length} entr${reg.assets.length === 1 ? "y" : "ies"})`);
