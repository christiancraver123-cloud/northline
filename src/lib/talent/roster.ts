// CANONICAL TALENT ROSTER — the single source of truth for creator identity.
// Names are canonical: never rename a creator because an old generated reference sheet renders different text.
// Identity > outfit > pose > location > lighting > composition > styling.
import type { LaunchStatus, TalentCode } from "@/lib/domain/types";

export interface Talent {
  code: TalentCode;
  name: string;
  first: string;
  age: number;
  markets: string[];
  role: string;
  launchStatus: LaunchStatus;
  color: string; // hex, UI accent
  personality: string[];
  identity: {
    hair: string;
    eyes: string;
    skin: string;
    face: string;
    body: string;
    height: string;
    jewelry: string;
    signature: string[]; // identity-critical markers, listed verbatim into every prompt
  };
  criticalRules: string[]; // human-readable, shown in UI
  visual: { palette: string[]; lighting: string[]; environments: string[]; lifestyle: string[]; expression: string };
  voice: { tone: string; style: string; sample: string };
}

export const ROSTER: Talent[] = [
  {
    code: "SIE", name: "Sienna Veyra", first: "Sienna", age: 23, markets: ["Miami", "Travel"], role: "Anchor / pilot creator",
    launchStatus: "active", color: "#ff9a52",
    personality: ["confident", "playful", "down-to-earth", "slightly sarcastic", "slightly mysterious", "social", "spontaneous", "fitness/wellness-oriented", "naturally flirtatious without becoming explicit"],
    identity: {
      hair: "long dark chocolate-brown hair, messy tousled waves, center part",
      eyes: "BOTH eyes matching light green-gray",
      skin: "warm tan skin with freckles",
      face: "confident sultry half-smirk",
      body: "curvy hourglass proportions, average height",
      height: "average",
      jewelry: "small gold hoops and a thin gold necklace",
      signature: ["both eyes matching light green-gray", "freckles", "long dark chocolate-brown messy waves, center part", "small gold hoops", "thin gold necklace"],
    },
    criticalRules: ["NO heterochromia — both eyes must match (light green-gray)", "Gold hoops + thin gold necklace are her jewelry language"],
    visual: {
      palette: ["cream", "chocolate brown", "deep red", "golden-hour tones"],
      lighting: ["golden hour", "warm sunset glow", "soft rooftop dusk"],
      environments: ["Miami beach", "Brickell rooftop", "boutique hotel", "Pilates studio", "coffee shop", "Miami restaurant terrace", "nightlife lounge"],
      lifestyle: ["fitness", "Pilates", "coffee", "travel", "hotels", "nightlife", "restaurants"],
      expression: "confident half-smirk",
    },
    voice: { tone: "playful, a little sarcastic, warm", style: "short, casual, lowercase-leaning, one wink-y line", sample: "caught in 4k golden hour. not sorry." },
  },
  {
    code: "ALE", name: "Alessia Varenne", first: "Alessia", age: 25, markets: ["New York", "Paris", "Milan"], role: "Editorial fashion creator",
    launchStatus: "setup", color: "#c9cde6",
    personality: ["controlled", "intelligent", "dry humor", "independent", "slightly intimidating", "fashion-oriented", "cultured", "reserved"],
    identity: {
      hair: "sleek jet-black blunt bob, collarbone length, never long flowing waves",
      eyes: "dark brown eyes with sharp winged liner and strong straight brows",
      skin: "pale olive skin, NO freckles",
      face: "angular jaw, matte red lip where appropriate",
      body: "tall (about 5'9\"), long-limbed, slender with soft curves",
      height: "5'9\"",
      jewelry: "pearl studs and a gold signet ring, never hoops",
      signature: ["sleek jet-black blunt bob at collarbone length", "no freckles", "dark brown eyes, sharp winged liner", "pearl studs", "gold signet ring"],
    },
    criticalRules: ["Blunt bob only — NEVER long flowing waves", "NO freckles", "Pearl studs + gold signet ring; NEVER hoops", "Rarely/never a broad smile"],
    visual: {
      palette: ["black", "white", "oxblood"],
      lighting: ["night flash", "candlelight", "film grain editorial"],
      environments: ["Paris street after rain", "boutique hotel lobby", "gallery", "wine bar", "elevator", "NYC late-night street", "Milan atelier"],
      lifestyle: ["fashion", "architecture", "galleries", "wine bars", "books", "rainy streets"],
      expression: "controlled, looking away or through the camera",
    },
    voice: { tone: "dry, minimal, deadpan", style: "one short sentence, no exclamation marks", sample: "Reservation under a different name." },
  },
  {
    code: "MIL", name: "Mila Calloway", first: "Mila", age: 22, markets: ["Nashville"], role: "Relatable, expressive creator",
    launchStatus: "setup", color: "#f2c35c",
    personality: ["relatable", "outgoing", "competitive", "sweet", "funny", "social", "casual"],
    identity: {
      hair: "messy honey-brown balayage, never red hair",
      eyes: "hazel eyes",
      skin: "prominent freckles",
      face: "soft rounder face, expressive",
      body: "petite (about 5'3\"), soft natural curves; clearly an adult woman aged 22",
      height: "5'3\"",
      jewelry: "small gold hoops; straw cowboy hat sometimes",
      signature: ["messy honey-brown balayage (not red)", "hazel eyes", "prominent freckles", "soft rounder face", "petite adult woman", "small gold hoops"],
    },
    criticalRules: ["Honey-brown balayage — NEVER red hair", "Always clearly an adult, age 22 — never schoolgirl-coded", "Most expressive: laughs, winks, goofy faces, photo dumps"],
    visual: {
      palette: ["denim blue", "warm amber", "cream", "neon bar glow"],
      lighting: ["direct phone flash", "warm bar light", "stadium lights", "lake sun"],
      environments: ["Nashville honky-tonk", "football tailgate", "lake day", "concert crowd", "road-trip passenger seat", "dive bar"],
      lifestyle: ["concerts", "football weekends", "lake days", "dogs", "country music", "casual cooking"],
      expression: "laughing, winking, goofy",
    },
    voice: { tone: "bubbly, funny, self-deprecating", style: "chatty, exclamation points, emoji-friendly", sample: "photo dump because my camera roll is a crime scene 😂" },
  },
  {
    code: "VES", name: "Vesper Laurent", first: "Vesper", age: 25, markets: ["Los Angeles"], role: "Nightlife / cinematic creator (from Montreal)",
    launchStatus: "setup", color: "#39d0b4",
    personality: ["intense", "self-assured", "observant", "mischievous", "adventurous", "independent"],
    identity: {
      hair: "near-black shaggy wolf-cut inspired hair with curtain bangs",
      eyes: "HETEROCHROMIA — in a front-facing image as viewed by the viewer: LEFT side of image = emerald green eye, RIGHT side of image = icy blue-gray eye (anatomically her left eye is icy blue-gray, her right eye is emerald green)",
      skin: "olive skin, light freckles, faint scar through LEFT eyebrow",
      face: "intense, mischievous",
      body: "athletic physique, strong shoulders, about 5'8\"",
      height: "5'8\"",
      jewelry: "SILVER only",
      signature: ["heterochromia: image-left eye emerald green, image-right eye icy blue-gray", "near-black wolf cut with curtain bangs", "faint scar through left eyebrow", "light freckles", "silver jewelry only"],
    },
    criticalRules: [
      "Heterochromia: viewer-left (image-left) = GREEN, viewer-right = ICY BLUE-GRAY. Anatomically her LEFT eye is blue-gray, RIGHT is green. DO NOT REVERSE.",
      "SILVER jewelry only — never gold",
      "Faint scar through LEFT eyebrow",
    ],
    visual: {
      palette: ["cool blue night", "black leather", "chrome", "silver"],
      lighting: ["direct flash", "cool blue night", "neon reflections"],
      environments: ["LA rooftop", "hotel valet entrance", "cinematic LA street at night", "chrome-lit lounge", "parking structure"],
      lifestyle: ["nightlife", "black leather", "chrome", "rooftops", "hotels", "adventure"],
      expression: "intense, slightly mischievous",
    },
    voice: { tone: "cool, teasing, confident", style: "short and cryptic, occasional dry one-liner", sample: "you weren't invited. you came anyway." },
  },
  {
    code: "ZOE", name: "Zoe Avell", first: "Zoe", age: 23, markets: ["Los Angeles"], role: "Wellness / daylight lifestyle creator",
    launchStatus: "setup", color: "#ff7fb0",
    personality: ["warm", "confident", "playful", "ambitious", "wellness-focused", "social", "approachable"],
    identity: {
      hair: "dark natural curls, often in a high puff",
      eyes: "brown eyes",
      skin: "warm medium-brown skin, light freckles",
      face: "warm, approachable, small gold stud in the LEFT nostril",
      body: "athletic feminine Pilates-toned build, about 5'6\"",
      height: "5'6\"",
      jewelry: "layered thin gold necklaces",
      signature: ["dark natural curls, often a high puff", "brown eyes", "small gold stud in LEFT nostril", "layered thin gold necklaces", "light freckles"],
    },
    criticalRules: ["Small GOLD stud in the LEFT nostril — always", "BROWN eyes", "Layered thin gold necklaces"],
    visual: {
      palette: ["sage", "blush", "white", "warm daylight"],
      lighting: ["bright clean daylight", "soft window light", "sunset walk"],
      environments: ["Pilates studio", "matcha café", "West Hollywood street", "poolside", "beach", "rooftop dinner", "boutique shopping"],
      lifestyle: ["matcha", "Pilates", "beaches", "poolside", "shopping", "restaurants", "sunset walks"],
      expression: "warm, open smile",
    },
    voice: { tone: "warm, encouraging, upbeat", style: "friendly, wellness-flavored, light emoji", sample: "matcha first, everything else second ✨" },
  },
  {
    code: "SKY", name: "Skye Halston", first: "Skye", age: 24, markets: ["Encinitas", "San Diego"], role: "Coastal / surf creator",
    launchStatus: "setup", color: "#7cc4ff",
    personality: ["bubbly", "spontaneous", "adventurous", "coastal", "active", "social"],
    identity: {
      hair: "sun-bleached blonde hair with darker natural roots, often salty and wet-textured",
      eyes: "green-hazel eyes",
      skin: "heavy freckles, sun-kissed or sunburnt nose, beauty mark on LEFT cheek",
      face: "minimal/no makeup, squinting or grinning into sunlight",
      body: "athletic slim surfer physique, about 5'6\"",
      height: "5'6\"",
      jewelry: "tiny shell necklace (no Sienna-style gold hoops)",
      signature: ["sun-bleached blonde with darker roots", "green-hazel eyes", "heavy freckles", "beauty mark on left cheek", "tiny shell necklace"],
    },
    criticalRules: ["Beauty mark on LEFT cheek", "Tiny shell necklace — NO gold hoops", "Minimal/no makeup"],
    visual: {
      palette: ["ocean blue", "sand", "sun-faded white", "coral"],
      lighting: ["bright midday sun", "dawn", "salty golden afternoon"],
      environments: ["Encinitas surf break", "beach parking lot", "coastal café", "tide pools", "San Diego boardwalk"],
      lifestyle: ["ocean", "surf", "sand", "dawn sessions", "coastal cafés"],
      expression: "squinting and grinning into the sun",
    },
    voice: { tone: "bubbly, spontaneous, sunny", style: "upbeat, short, ocean references", sample: "dawn patrol > everything 🌊" },
  },
];

export const ROSTER_BY_CODE: Record<TalentCode, Talent> = Object.fromEntries(ROSTER.map((t) => [t.code, t])) as Record<TalentCode, Talent>;

export function getTalent(code: string): Talent | undefined {
  return ROSTER_BY_CODE[code as TalentCode];
}

/** Creator relationship map (conceptual default pairings; any collaboration is allowed). */
export const DEFAULT_PAIRINGS: [TalentCode, TalentCode][] = [["SIE", "ZOE"], ["VES", "SKY"], ["ALE", "MIL"]];
