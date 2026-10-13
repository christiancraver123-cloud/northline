import { test } from "vitest";
import assert from "node:assert/strict";
import { areFriends, isConnected, lineupProblem, pathBetween, rolloutOrder, EDGES } from "./network";
import { planCollab, timeOfDay, type CollabMember } from "./plan";

const NAMES: Record<string, string> = { SIE: "Sienna Veyra", ALE: "Alessia Varenne", MIL: "Mila Calloway", VES: "Vesper Laurent", ZOE: "Zoe Avell", SKY: "Skye Halston" };
const member = (code: string, live = false, followers = 0): CollabMember => ({
  code, name: NAMES[code]!, handle: code === "SIE" ? "itssiennaveyra" : "", live, followers,
  visual_identity: `${code} look`, photography_style: `${code} style`,
  look: { hair: `${code} hair`, expression: `${code} face`, jewellery: `${code} metal`, palette: `${code} palette`, build: `${code} build` },
});
const ALL = Object.keys(NAMES).map((c) => member(c, c === "SIE", c === "SIE" ? 900 : 0));

test("graph matches the operator's diagram", () => {
  assert.equal(EDGES.length, 6);
  for (const [a, b] of [["SIE", "ZOE"], ["SIE", "VES"], ["ZOE", "SKY"], ["VES", "SKY"], ["VES", "ALE"], ["ALE", "MIL"]]) assert.ok(areFriends(a!, b!), `${a}-${b}`);
  assert.ok(!areFriends("SIE", "ALE"));
  assert.deepEqual(pathBetween("SIE", "MIL"), ["SIE", "VES", "ALE", "MIL"]);
  assert.ok(isConnected(["SIE", "VES", "ALE"]));
  assert.ok(!isConnected(["SIE", "MIL", "ZOE"]));
});

test("unbelievable line-ups are refused with a fix", () => {
  assert.match(lineupProblem(["SIE", "ALE"], NAMES)!, /don't know each other.*Vesper/);
  assert.match(lineupProblem(["SIE", "ZOE", "MIL"], NAMES)!, /Mila Calloway doesn't know anyone/);
  assert.equal(lineupProblem(["SIE", "VES", "ALE"], NAMES), null);
  assert.equal(lineupProblem(Object.keys(NAMES), NAMES), null); // all-six event
  assert.throws(() => planCollab({ codes: ["SIE", "ALE"], event: "Miami dinner" }, ALL), /Vesper/);
});

test("duo: live creator leads, partner follows 3 days later, nothing shared", () => {
  const p = planCollab({ codes: ["ZOE", "SIE"], event: "Miami boat day" }, ALL);
  assert.equal(p.kind, "duo");
  assert.equal(p.lead, "SIE");
  assert.equal(p.timeOfDay, "golden hour");
  const feed = p.posts.filter((x) => x.format === "carousel");
  assert.deepEqual(feed.map((x) => [x.owner, x.day]), [["SIE", 0], ["ZOE", 3]]);
  const used = feed.flatMap((x) => x.shots);
  assert.equal(new Set(used).size, used.length, "no image on two accounts");
  assert.ok(feed[0]!.caption.includes("zoe"));
  assert.ok(feed[1]!.caption.includes("@itssiennaveyra"));
  assert.ok(feed[0]!.stories.some((s) => s.by === "ZOE"));
  assert.equal(feed[1]!.waitsForLaunch, true);
  assert.equal(p.reel.owner, "SIE");
  assert.equal(feed[1]!.stories.filter((s) => s.by === "SIE").length, 1, "one Story task per person per post");
});

test("group rolls out along friendships; all-six is an event with one full frame", () => {
  const g = planCollab({ codes: ["ALE", "SIE", "VES"], event: "rooftop dinner" }, ALL);
  assert.equal(g.timeOfDay, "night");
  assert.deepEqual(g.order, ["SIE", "VES", "ALE"]);
  assert.equal(g.reel.owner, "VES");
  const sienna = g.posts.find((x) => x.owner === "SIE" && x.format === "carousel")!;
  assert.ok(!sienna.mentions.includes("ALE"), "Sienna doesn't @ someone she doesn't know");
  assert.ok(sienna.tags.includes("ALE"), "but tags her because she's in the photo");
  const e = planCollab({ codes: Object.keys(NAMES), event: "birthday weekend", location: "Miami" }, ALL);
  assert.equal(e.kind, "event");
  assert.equal(e.shots.filter((s) => s.people.length === 6).length, 1);
  assert.deepEqual(rolloutOrder(Object.keys(NAMES), "SIE"), ["SIE", "VES", "ZOE", "ALE", "SKY", "MIL"]);
  for (const s of e.shots) assert.match(s.prompt, /No nudity/);
  assert.equal(timeOfDay("ski trip"), "day");
});
