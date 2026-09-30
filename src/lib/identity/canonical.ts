// CANONICAL IDENTITY RECORDS — versioned, structured, the single authority for what makes each creator who she is.
// Source data: talent/roster.ts (descriptive facts) + LOCKS below (enforceable rules). Productions and assets reference
// the version used (e.g. "SIE-IDENTITY-v1.0") and never copy these facts. A stored snapshot is immutable once used:
// changing any fact requires bumping IDENTITY_VERSION.
import { createHash } from "node:crypto";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { REFERENCE_TYPES, authorityFor, type QaSeverity, type ReferenceAuthority, type ReferenceType, type TalentCode } from "@/lib/domain/types";

export const IDENTITY_VERSION = "v1.0";
export const identityId = (code: TalentCode, version = IDENTITY_VERSION) => `${code}-IDENTITY-${version}`;

export interface QaRule { label: string; /** Regex source, tested case-insensitively. */ pattern: string }

/** An enforceable identity rule. HARD locks are permanent markers; SOFT locks are signature traits. */
export interface IdentityLock {
  id: string;
  label: string;
  description: string;
  severity: Exclude<QaSeverity, "PASS">; // what a violation means: HARD_FAIL or REVIEW
  promptRequired?: QaRule[]; // the generation prompt must state these
  promptForbidden?: QaRule[]; // the generation prompt must never state these
  visualCheck: string; // what an inspector (vision model or human) must verify in the image
}

export interface CanonicalIdentity {
  id: string; code: TalentCode; version: string; name: string; age: number;
  core: { hair: string; eyes: string; skin: string; face: string; body: string; height: string; jewelry: string };
  hardLocks: IdentityLock[]; // HARD_FAIL on violation
  softLocks: IdentityLock[]; // REVIEW on violation
  creativeVariables: string[]; // may change per production — never a reason to reject
  negativeConstraints: string[];
  visualLanguage: { palette: string[]; lighting: string[]; environments: string[]; expression: string };
  personalityVoice: { personality: string[]; tone: string; style: string; sample: string };
  contentUniverse: { markets: string[]; role: string; lifestyle: string[] };
  qaRules: { hardFail: string[]; review: string[] };
  providerBlock: string; // compact text block placed in every provider prompt
  referenceHierarchy: { type: ReferenceType; authority: ReferenceAuthority; rank: number }[];
}

const hl = (id: string, label: string, description: string, visualCheck: string, promptRequired?: QaRule[], promptForbidden?: QaRule[]): IdentityLock =>
  ({ id, label, description, severity: "HARD_FAIL", visualCheck, promptRequired, promptForbidden });
const sl = (id: string, label: string, description: string, visualCheck: string, promptRequired?: QaRule[], promptForbidden?: QaRule[]): IdentityLock =>
  ({ id, label, description, severity: "REVIEW", visualCheck, promptRequired, promptForbidden });

const GENERIC_NEG = ["plastic skin", "extra fingers", "distorted hands", "text overlays", "watermarks", "nudity", "lingerie", "real brand logos", "real people"];
const COMMON_HARD_FAIL = ["wrong creator / different face", "major face drift", "wrong canonical eye color", "wrong permanent marker", "major hair identity violation", "obvious age inconsistency (must read as an adult)", "severe anatomy failure"];
const COMMON_REVIEW = ["signature jewelry missing", "freckles weaker than expected", "unusual but plausible hairstyle", "minor proportion inconsistency", "expression unusual for the creator", "aesthetic approaching another creator"];

const LOCKS: Record<TalentCode, { hard: IdentityLock[]; soft: IdentityLock[]; creative: string[] }> = {
  SIE: {
    hard: [
      hl("SIE-EYES-MATCH", "matching eyes", "Both eyes match: light green-gray. No heterochromia.", "Both eyes are the same light green-gray; reject any mismatched eye color.", [{ label: "matching eyes", pattern: "match(ing)? (light )?green-?gray" }], [{ label: "heterochromia", pattern: "heterochromia|one (blue|green)" }]),
      hl("SIE-HAIR", "long dark chocolate-brown waves", "Long dark chocolate-brown messy waves, center part.", "Hair is long, dark chocolate-brown, wavy, center-parted; reject short/blunt/blonde/red hair.", [{ label: "long dark chocolate-brown hair", pattern: "long dark chocolate-brown" }], [{ label: "blunt bob", pattern: "blunt bob" }]),
    ],
    soft: [
      sl("SIE-GOLD-HOOPS", "gold hoops", "Small gold hoops and thin gold necklace are her jewelry language.", "Small gold hoop earrings and a thin gold necklace are visible where the crop allows.", [{ label: "gold hoops", pattern: "gold hoops" }], [{ label: "silver jewelry", pattern: "silver" }]),
      sl("SIE-FRECKLES", "freckles", "Freckles across nose/cheeks, warm tan skin.", "Freckles are visible and not retouched away.", [{ label: "freckles", pattern: "freckles" }]),
    ],
    creative: ["outfit", "pose", "location within Miami/travel universe", "time of day", "activity"],
  },
  ALE: {
    hard: [
      hl("ALE-BOB", "blunt bob", "Sleek jet-black blunt bob at collarbone length. Never long flowing waves.", "Hair is a jet-black blunt bob ending near the collarbone; reject long or wavy hair.", [{ label: "blunt bob", pattern: "blunt bob" }], [{ label: "long waves", pattern: "long (flowing )?waves|long hair" }]),
      hl("ALE-NO-FRECKLES", "no freckles", "Pale olive skin with NO freckles.", "Skin is clear with no freckles.", [{ label: "no freckles", pattern: "no freckles" }], [{ label: "freckles", pattern: "(?<!no )freckles" }]),
      hl("ALE-EYES", "dark brown eyes", "Dark brown eyes, sharp winged liner, strong straight brows.", "Eyes are dark brown with sharp winged liner.", [{ label: "dark brown eyes", pattern: "dark brown eyes" }]),
    ],
    soft: [
      sl("ALE-PEARLS", "pearl studs", "Pearl studs and a gold signet ring; never hoops.", "Pearl stud earrings visible; no hoop earrings.", [{ label: "pearl studs", pattern: "pearl studs" }], [{ label: "hoops", pattern: "hoops" }]),
      sl("ALE-EXPRESSION", "controlled expression", "Controlled, rarely/never a broad smile; looks away or through the camera.", "Expression is composed, not a broad smile or laugh.", undefined, [{ label: "broad smile", pattern: "broad smile|big grin|laughing" }]),
    ],
    creative: ["outfit", "city (New York / Paris / Milan)", "pose", "lighting style within night flash / candlelight / film grain"],
  },
  MIL: {
    hard: [
      hl("MIL-HAIR", "honey-brown balayage", "Messy honey-brown balayage. NEVER red hair.", "Hair is honey-brown balayage; reject red/auburn/ginger.", [{ label: "honey-brown balayage", pattern: "honey-brown balayage" }], [{ label: "red hair", pattern: "red hair|auburn|ginger" }]),
      hl("MIL-EYES", "hazel eyes", "Hazel eyes.", "Eyes are hazel.", [{ label: "hazel eyes", pattern: "hazel" }]),
      hl("MIL-ADULT", "clearly an adult", "Always clearly an adult woman aged 22; never schoolgirl-coded.", "Reads unmistakably as an adult woman; nothing school-coded or youthful-child-like.", [{ label: "adult", pattern: "adult" }], [{ label: "schoolgirl", pattern: "school ?girl|school uniform|\\bteen" }]),
    ],
    soft: [
      sl("MIL-FRECKLES", "prominent freckles", "Prominent freckles, soft rounder face, petite.", "Prominent freckles visible.", [{ label: "freckles", pattern: "freckles" }]),
      sl("MIL-HOOPS", "small gold hoops", "Small gold hoops.", "Small gold hoop earrings visible where the crop allows.", [{ label: "gold hoops", pattern: "gold hoops" }]),
    ],
    creative: ["outfit", "expression (laughing, winking, goofy)", "location within Nashville universe", "photo-dump framing"],
  },
  VES: {
    hard: [
      hl("VES-HETERO", "heterochromia orientation", "Front-facing, as viewed by the viewer: image-LEFT eye = emerald green, image-RIGHT eye = icy blue-gray. Anatomically her LEFT eye is icy blue-gray, her RIGHT eye is emerald green. Never reversed.",
        "In a front-facing image the eye on the LEFT side of the image is GREEN and the eye on the RIGHT side of the image is ICY BLUE-GRAY. If reversed, mirrored, or matching: HARD FAIL.",
        [{ label: "heterochromia", pattern: "heterochromia" }, { label: "eye orientation", pattern: "image-left eye emerald green,? image-right eye icy blue-gray" }],
        [{ label: "reversed eyes", pattern: "image-left eye icy|image-right eye emerald|(?<!image-)left eye (is )?(emerald|green)|(?<!image-)right eye (is )?(icy|blue)" }]),
      hl("VES-SCAR", "scar through left eyebrow", "Faint scar through her LEFT eyebrow (permanent marker).", "A faint scar crosses HER left eyebrow (image-right in a front-facing shot); absent or on the wrong brow = HARD FAIL.", [{ label: "left eyebrow scar", pattern: "scar through (her )?left eyebrow" }]),
      hl("VES-HAIR", "near-black wolf cut", "Near-black shaggy wolf-cut inspired hair with curtain bangs.", "Hair is near-black, shaggy wolf cut with curtain bangs.", [{ label: "wolf cut", pattern: "wolf cut" }]),
    ],
    soft: [
      sl("VES-SILVER", "silver jewelry only", "Silver jewelry only; never gold.", "Any visible jewelry is silver.", [{ label: "silver", pattern: "silver" }], [{ label: "gold jewelry", pattern: "gold" }]),
      sl("VES-FRECKLES", "light freckles", "Light freckles, olive skin.", "Light freckles visible.", [{ label: "freckles", pattern: "freckles" }]),
    ],
    creative: ["outfit (black leather, chrome)", "location within LA nightlife", "pose", "cool-night lighting variants"],
  },
  ZOE: {
    hard: [
      hl("ZOE-EYES", "brown eyes", "Brown eyes.", "Eyes are brown.", [{ label: "brown eyes", pattern: "brown eyes" }]),
      hl("ZOE-NOSTRIL", "left nostril stud", "Small GOLD stud in HER LEFT nostril (image-right in a front-facing shot).", "A small gold stud is in her left nostril (image-right when facing camera); missing or in the right nostril = HARD FAIL.", [{ label: "left nostril stud", pattern: "gold stud in (the )?left nostril" }], [{ label: "right nostril", pattern: "right nostril" }]),
      hl("ZOE-HAIR", "dark natural curls", "Dark natural curls, often a high puff.", "Hair is dark natural curls (often a high puff); reject straight hair.", [{ label: "natural curls", pattern: "natural curls" }]),
    ],
    soft: [
      sl("ZOE-NECKLACES", "layered thin gold necklaces", "Layered thin gold necklaces.", "Layered thin gold necklaces visible where the crop allows.", [{ label: "layered necklaces", pattern: "layered thin gold necklaces" }], [{ label: "silver", pattern: "silver" }]),
    ],
    creative: ["outfit", "hair state (puff vs down curls)", "location within LA wellness/daylight universe", "activity"],
  },
  SKY: {
    hard: [
      hl("SKY-MARK", "beauty mark on left cheek", "Beauty mark on HER LEFT cheek (permanent marker).", "A beauty mark sits on her left cheek (image-right when facing camera); absent or wrong side = HARD FAIL.", [{ label: "beauty mark", pattern: "beauty mark on (her )?left cheek" }]),
      hl("SKY-HAIR", "sun-bleached blonde", "Sun-bleached blonde hair with darker natural roots.", "Hair is sun-bleached blonde with darker roots; reject dark hair.", [{ label: "blonde hair", pattern: "blonde" }], [{ label: "dark hair", pattern: "black hair|dark brown hair" }]),
      hl("SKY-EYES", "green-hazel eyes", "Green-hazel eyes.", "Eyes are green-hazel.", [{ label: "green-hazel eyes", pattern: "green-hazel eyes" }]),
    ],
    soft: [
      sl("SKY-SHELL", "shell necklace", "Tiny shell necklace; no Sienna-style gold hoops.", "A tiny shell necklace is visible; no gold hoops.", [{ label: "shell necklace", pattern: "shell necklace" }], [{ label: "hoops", pattern: "hoops" }]),
      sl("SKY-FRECKLES", "heavy freckles", "Heavy freckles, sun-kissed nose, minimal makeup.", "Heavy freckles visible; minimal makeup.", [{ label: "freckles", pattern: "freckles" }]),
    ],
    creative: ["outfit", "surf/beach location within Encinitas/San Diego", "time of day", "activity"],
  },
};

const HIERARCHY = REFERENCE_TYPES.map((t) => ({ type: t, authority: authorityFor(t), rank: t === "MASTER_FACE" ? 100 : 80 }));

export function buildCanonicalIdentity(code: TalentCode, version = IDENTITY_VERSION): CanonicalIdentity {
  const t = ROSTER_BY_CODE[code];
  const l = LOCKS[code];
  const block = `${t.first}, a ${t.age}-year-old adult woman. ${t.identity.signature.join("; ")}. ${t.identity.body}. Expression: ${t.visual.expression}.`;
  return {
    id: identityId(code, version), code, version, name: t.name, age: t.age,
    core: { hair: t.identity.hair, eyes: t.identity.eyes, skin: t.identity.skin, face: t.identity.face, body: t.identity.body, height: t.identity.height, jewelry: t.identity.jewelry },
    hardLocks: l.hard, softLocks: l.soft, creativeVariables: l.creative,
    negativeConstraints: [...GENERIC_NEG, ...[...l.hard, ...l.soft].flatMap((x) => (x.promptForbidden ?? []).map((f) => f.label))],
    visualLanguage: t.visual, personalityVoice: { personality: t.personality, tone: t.voice.tone, style: t.voice.style, sample: t.voice.sample },
    contentUniverse: { markets: t.markets, role: t.role, lifestyle: t.visual.lifestyle },
    qaRules: { hardFail: [...COMMON_HARD_FAIL, ...l.hard.map((x) => x.description)], review: [...COMMON_REVIEW, ...l.soft.map((x) => x.description)] },
    providerBlock: block,
    referenceHierarchy: HIERARCHY,
  };
}

/** Stable content hash: detects facts changing without a version bump. */
export function identityHash(ci: CanonicalIdentity): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(ci))).digest("hex");
}
export const allLocks = (ci: CanonicalIdentity): IdentityLock[] => [...ci.hardLocks, ...ci.softLocks];
