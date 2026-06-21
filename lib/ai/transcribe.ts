import "server-only";

/**
 * Speech-to-text for the POS mic, via Groq's Whisper endpoint
 * (whisper-large-v3-turbo, OpenAI-compatible audio/transcriptions API).
 *
 * We use this instead of the browser's Web Speech API because the latter
 * depends on Google's speech backend, which is blocked on some networks/
 * browsers (returns a "network" error). Groq runs server-side with our key, so
 * it works regardless of the client's network. Plain fetch + FormData — no SDK.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export class MissingSttKeyError extends Error {
  constructor() {
    super("Falta GROQ_API_KEY en el entorno.");
    this.name = "MissingSttKeyError";
  }
}

/** Groq returned 429 — free-tier rate limit hit. Carries a backoff hint. */
export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Límite de transcripción de Groq alcanzado.");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Transcribe one short audio segment (Spanish). Returns the recognized text
 * (possibly empty for silence).
 * @throws MissingSttKeyError when the API key isn't configured.
 */
export async function transcribeSegment(file: Blob): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new MissingSttKeyError();

  const form = new FormData();
  // Groq infers the format from the filename extension; the browser records
  // webm/opus (Chrome/Firefox) or mp4 (Safari) — name it generically, Groq
  // sniffs the container regardless.
  form.append("file", file, "segment.webm");
  form.append("model", MODEL);
  form.append("language", "es");
  form.append("response_format", "json");
  // Prompt nudges domain vocabulary (a restaurant POS) for better accuracy.
  form.append(
    "prompt",
    "Pedido en un restaurante: hamburguesas, combos, papas, bebidas, salsas, sin gluten.",
  );

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (res.status === 429) {
    // Honor Retry-After (seconds, possibly fractional); default to 6s.
    const ra = res.headers.get("retry-after");
    const secs = ra ? parseFloat(ra) : NaN;
    throw new RateLimitError(Number.isFinite(secs) ? Math.ceil(secs * 1000) : 6000);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq STT ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
