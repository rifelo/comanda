import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MissingApiKeyError } from "./pos-assistant";
import { pickCategoria, sanitizeFrase, type FraseCategoria } from "@/lib/pos/frase";

/**
 * "Frase del día" for the cup label: one short line in Colombian Spanish —
 * funny, motivational, or a wink at today's news in Colombia — always tied
 * to coffee, with one or two emoji. claude-opus-5 with low effort (a short
 * creative line, latency matters at the register); the news category adds
 * one web search so the nod is actually about today.
 */

export interface FraseResult {
  texto: string;
  categoria: FraseCategoria;
}

const ResultSchema = z.object({ texto: z.string().trim().min(4).max(220) });

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    texto: {
      type: "string",
      description: "La frase final, lista para imprimir: máximo 120 caracteres, con 1 o 2 emojis.",
    },
  },
  required: ["texto"],
} as const;

const SYSTEM = `Escribes frases cortas para pegar en el vaso de café de una cafetería en Colombia. Cada frase se imprime en una etiqueta pequeña y el cliente la lee con su bebida.

Reglas:
- Una sola frase, máximo 120 caracteres, en español de Colombia, sin comillas.
- Siempre relacionada con el café o con el momento de tomarse un café (tinto, espresso, latte, cafeína, madrugar, la pausa, el aroma…).
- Incluye 1 o 2 emojis que aporten (☕ 🌞 😴 🔥 ✨ 🚀 …), nunca más de 2.
- Nada ofensivo, político-partidista, sexual ni sobre religión. Nada de marcas ajenas.
- Varía el estilo de una frase a otra: que no se parezca a una frase anterior.

Ejemplos del tono gracioso (juegos de palabras, ironía ligera):
· No tengo insomnio, tengo un espresso doble en las venas ☕😅
· Comer chocolate encoge la ropa; el café solo encoge el mal genio ☕
· Un día sin café es, ya sabes, de noche 😴☕
· Ojos que no ven… cafecito que se enfría 👀☕

Ejemplos del tono motivador:
· Cada sorbo es un paso; hoy vas a llegar lejos ☕🚀
· No necesitas verlo todo claro, solo el primer café ☕✨
· El esfuerzo es invisible, pero brilla como este espresso 🔥☕`;

const CATEGORY_PROMPT: Record<FraseCategoria, string> = {
  gracioso:
    "Escribe una frase GRACIOSA sobre café: juego de palabras o ironía ligera, tipo humor de camiseta.",
  motivador:
    "Escribe una frase MOTIVADORA sobre café y el día que empieza: cálida, corta, sin cursilería.",
  noticia:
    "Busca en la web UNA noticia positiva o curiosa de HOY en Colombia (deporte, cultura, clima, ciencia, algo alegre; evita política, crimen y tragedias). Escribe una frase que la mencione con humor o ánimo y la conecte con el café. Si no encuentras nada apto, escribe una frase graciosa sobre café.",
};

export async function generarFraseCafe(input: {
  orgName: string;
  categoria?: FraseCategoria;
}): Promise<FraseResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();
  const client = new Anthropic();
  const categoria = input.categoria ?? pickCategoria();

  const hoy = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const userText = `${CATEGORY_PROMPT[categoria]}\nCafetería: ${input.orgName}. Hoy es ${hoy}. Semilla de variedad: ${Math.floor(Math.random() * 1_000_000)}.`;

  // Same call shape as lib/ai/pos-assistant.ts (proven in production):
  // non-beta messages.create + structured output. Refusals are surfaced as
  // an error instead of a server-side fallback chain.
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    tools:
      categoria === "noticia"
        ? [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: 2,
              user_location: { type: "approximate", country: "CO", timezone: "America/Bogota" },
            },
          ]
        : undefined,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo no quiso escribir esa frase. Intenta de nuevo.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La IA respondió en un formato inesperado.");
  }
  const ok = ResultSchema.safeParse(parsed);
  if (!ok.success) throw new Error("La IA no devolvió una frase válida.");
  return { texto: sanitizeFrase(ok.data.texto), categoria };
}
