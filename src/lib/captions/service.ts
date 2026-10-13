// Server side of the caption writer: AI when a text model is configured, templates otherwise (never blocks).
import type { Repo } from "@/lib/db/repo";
import type { TalentCode } from "@/lib/domain/types";
import { defaultRouter } from "@/lib/llm/router";
import { captionPrompt, cleanCaptions, templateCaptions, type CaptionContext } from "./writer";

export interface CaptionOptions { options: string[]; source: "ai" | "templates"; note?: string }

export async function writeCaptions(repo: Repo, code: TalentCode, ctx: CaptionContext, seed = 0, avoid: string[] = []): Promise<CaptionOptions> {
  const router = defaultRouter();
  if (router.candidates("CAPTION_WRITER", "caption.write").some((c) => c.provider !== "mock" && router.providers[c.provider].configured())) {
    const { system, prompt } = captionPrompt(code, ctx, avoid);
    const r = await router.run("CAPTION_WRITER", "caption.write", { system, prompt, json: true, maxOutputTokens: 400, temperature: 0.9 });
    for (const a of r.attempts) await repo.insert("llmCalls", { runId: null, taskId: null, agentId: "CAPTION_WRITER", provider: a.provider, model: a.model, status: a.status, error: a.error, startedAt: a.startedAt, finishedAt: a.finishedAt, latencyMs: a.latencyMs, inputTokens: a.usage?.inputTokens ?? null, outputTokens: a.usage?.outputTokens ?? null, totalTokens: a.usage?.totalTokens ?? null, costUsd: a.costUsd, fallbackFrom: a.fallbackFrom }).catch(() => undefined);
    if (r.result) {
      try { const opts = cleanCaptions((JSON.parse(r.result.text.replace(/^```(json)?|```$/g, "")) as { captions?: unknown[] }).captions ?? []).slice(0, 3); if (opts.length) return { options: opts, source: "ai" }; } catch { /* fall through */ }
    }
    return { options: templateCaptions(code, ctx, 3, seed), source: "templates", note: "The AI model didn't answer usefully, so these are from her voice templates." };
  }
  return { options: templateCaptions(code, ctx, 3, seed), source: "templates" };
}
