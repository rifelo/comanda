import "server-only";
import { z } from "zod";
import { groqChat } from "./groq";
import { pickCategoria, sanitizeFrase, type FraseCategoria } from "@/lib/pos/frase";

/**
 * "Frase del día" for the cup label: one short line in Colombian Spanish —
 * funny, motivational, or a wink at today's news in Colombia — always tied
 * to coffee, with one or two emoji. Runs on Groq's free tier
 * (openai/gpt-oss-120b): JSON-schema output for the creative categories,
 * the built-in browser search for the news one (plain text there — the
 * search tool and strict JSON can't be combined — then sanitised).
 */

export interface FraseResult {
  texto: string;
  categoria: FraseCategoria;
}

const ResultSchema = z.object({ texto: z.string().trim().min(4).max(220) });

const JSON_SCHEMA = {
  name: "frase",
  schema: {
    type: "object",
    properties: { texto: { type: "string" } },
    required: ["texto"],
    additionalProperties: false,
  },
};

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
    "Usa la búsqueda web para encontrar UNA noticia positiva o curiosa publicada hoy o ayer en Colombia (deporte, cultura, clima, ciencia, algo alegre; evita política, crimen y tragedias). Escribe una frase que la mencione con humor o ánimo y la conecte con tomarse un café. Si no encuentras nada apto, escribe una frase graciosa sobre café. Responde SOLO con la frase, sin citas ni fuentes.",
};

export async function generarFraseCafe(input: {
  orgName: string;
  categoria?: FraseCategoria;
}): Promise<FraseResult> {
  const categoria = input.categoria ?? pickCategoria();
  const hoy = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const user = `${CATEGORY_PROMPT[categoria]}\nCafetería: ${input.orgName}. Hoy es ${hoy}. Semilla de variedad: ${Math.floor(Math.random() * 1_000_000)}.`;

  if (categoria === "noticia") {
    const r = await groqChat({ system: SYSTEM, user, webSearch: true, maxTokens: 2048 });
    const texto = sanitizeFrase(r.text);
    if (texto.length < 4) throw new Error("La IA no devolvió una frase válida.");
    return { texto, categoria };
  }

  const r = await groqChat({ system: SYSTEM, user, jsonSchema: JSON_SCHEMA });
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.text);
  } catch {
    throw new Error("La IA respondió en un formato inesperado.");
  }
  const ok = ResultSchema.safeParse(parsed);
  if (!ok.success) throw new Error("La IA no devolvió una frase válida.");
  return { texto: sanitizeFrase(ok.data.texto), categoria };
}
