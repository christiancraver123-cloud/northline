// Higgsfield video adapter — ARCHITECTURE STUB. The real API contract is not wired yet (needs credentials + docs).
// Reels stay in "video stage pending" until this is implemented; the Reel brief/prompt is already produced.
import { ProviderError, type VideoProvider } from "./types";

export function higgsfieldVideo(_apiKey: string): VideoProvider {
  const notReady = () => { throw new ProviderError("higgsfield", "adapter not implemented yet (see TODO.md P15)", false); };
  return { name: "higgsfield", submit: async () => notReady(), poll: async () => notReady() };
}
