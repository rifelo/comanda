import "server-only";

/**
 * Minimal Groq chat client (OpenAI-compatible endpoint, plain fetch — same
 * approach as transcribe.ts). Free tier, no card: the project's GROQ_API_KEY
 * already powers the voice dictation. Used for cheap text tasks such as the
 * cup phrase; models available to this key as of 2026-09: openai/gpt-oss-120b,
 * openai/gpt-oss-20b, qwen/qwen3.8-27b, groq/compound(-mini).
 *
 * Free-tier gotchas seen on the bench:
 *  · groq/compound* pull whole search results into the context and hit
 *    "request_too_large" on the free TPM; gpt-oss-120b + the built-in
 *    `browser_search` tool stays ~5K tokens per request and works.
 *  · The model doesn't know today's date — always say it in the prompt.
 *  · With browser_search the text carries citation markers like 【1†L9-L13】;
 *    callers strip them (see sanitizeFrase).
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";

export class MissingGroqKeyError extends Error {
  constructor() {
    super("Falta GROQ_API_KEY en el entorno.");
    this.name = "MissingGroqKeyError";
  }
}
export class GroqRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Límite gratuito de Groq alcanzado. Intenta en un momento.");
    this.name = "GroqRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface GroqChatInput {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  /** gpt-oss reasoning depth; "low" keeps short creative tasks snappy. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Strict JSON schema for the reply (not combinable with webSearch). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Let the model call Groq's built-in browser search. */
  webSearch?: boolean;
  maxTokens?: number;
}

export interface GroqChatResult {
  text: string;
  /** Names of built-in tools the model actually ran (e.g. "browser_search"). */
  executedTools: string[];
  totalTokens: number | null;
}

export async function groqChat(input: GroqChatInput): Promise<GroqChatResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new MissingGroqKeyError();

  const body: Record<string, unknown> = {
    model: input.model ?? GROQ_TEXT_MODEL,
    temperature: input.temperature ?? 1,
    reasoning_effort: input.reasoningEffort ?? "low",
    max_completion_tokens: input.maxTokens ?? 1024,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
  if (input.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: input.jsonSchema.name, schema: input.jsonSchema.schema },
    };
  }
  if (input.webSearch) body.tools = [{ type: "browser_search" }];

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after") ?? "10");
    throw new GroqRateLimitError((Number.isFinite(ra) ? ra : 10) * 1000);
  }
  const data = (await res.json().catch(() => null)) as
    | {
        error?: { message?: string; code?: string };
        choices?: { message?: { content?: string | null; executed_tools?: { type?: string }[] } }[];
        usage?: { total_tokens?: number };
      }
    | null;
  if (!res.ok || !data) {
    const msg = data?.error?.message ?? `Groq respondió ${res.status}.`;
    throw new Error(msg);
  }
  const msg = data.choices?.[0]?.message;
  return {
    text: (msg?.content ?? "").trim(),
    executedTools: (msg?.executed_tools ?? []).map((t) => t.type ?? "").filter(Boolean),
    totalTokens: data.usage?.total_tokens ?? null,
  };
}
