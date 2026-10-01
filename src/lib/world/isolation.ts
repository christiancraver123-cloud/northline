// Production isolation for the POC. /world-dev must 404 in the production deployment. Pure so the rule is unit-tested.
type Env = Record<string, string | undefined>;
/** Allowed in development/test. In production (NODE_ENV=production) it is OFF unless NORTHLINE_WORLD_DEV=on is set explicitly (local `next start` play-testing only;
 *  render.yaml never sets it, and a test asserts that). The simulated world exposes no real data either way. */
export const worldDevAllowed = (env: Env = process.env) => env.NODE_ENV !== "production" || (env.NORTHLINE_WORLD_DEV ?? "").trim().toLowerCase() === "on";
