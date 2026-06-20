import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { UNITS, type InvoiceItem } from "./invoice-types";

/**
 * Invoice → inventory extraction. Sends a purchase-invoice photo to Claude
 * (vision + structured outputs) and gets back a typed list of line items, each
 * already classified as a pack or a single unit so the inventario "comprado por
 * paquete" flow can derive the per-unit cost.
 *
 * Uses the official Anthropic SDK with claude-opus-4-8 and `output_config.format`
 * (JSON schema) so the model is constrained to valid JSON; we re-validate with
 * zod here before trusting anything. Shared types/constants live in
 * ./invoice-types so client components can import them without this module.
 */

export type { InvoiceItem, Unit } from "./invoice-types";
export { UNITS } from "./invoice-types";

const ItemSchema = z.object({
  rawText: z.string().default(""),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).default(""),
  unit: z.enum(UNITS).catch("und"),
  isPack: z.boolean().catch(false),
  packQty: z.coerce.number().positive().nullable().catch(null),
  lineCost: z.coerce.number().int().min(0).catch(0),
  note: z.string().max(200).default(""),
});
const ResultSchema = z.object({ items: z.array(ItemSchema) });

// JSON schema for the model's structured output. Structured outputs require
// additionalProperties:false + every key in `required`; null is expressed via a
// union type rather than a numeric constraint (which isn't supported).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rawText: { type: "string", description: "El texto del renglón tal cual aparece" },
          name: { type: "string", description: "Nombre limpio y legible del insumo (marca + presentación si ayuda)" },
          category: { type: "string", description: "Categoría sugerida en español" },
          unit: { type: "string", enum: [...UNITS] },
          isPack: { type: "boolean" },
          packQty: { type: ["number", "null"] },
          lineCost: { type: "number", description: "Valor total pagado por la línea, entero en COP sin separadores" },
          note: { type: "string" },
        },
        required: ["rawText", "name", "category", "unit", "isPack", "packQty", "lineCost", "note"],
      },
    },
  },
  required: ["items"],
} as const;

const SYSTEM = `Eres un asistente que extrae los renglones de una factura de compra colombiana para cargarlos al inventario de un restaurante.

Devuelve SOLO los productos comprados. Ignora encabezados, datos del cliente, impuestos, descuentos y totales.

Para cada renglón:
- rawText: el texto del detalle tal cual.
- name: nombre limpio y legible del insumo (incluye marca y presentación cuando ayude).
- category: categoría sugerida en español (p. ej. Lácteos, Licores, Esencias, Bebidas, Empaques, Insumos).
- unit: la unidad en la que la cocina CONSUME el producto. Usa "und" por defecto para envases/unidades sueltas; usa "kg" o "L" solo si el producto se mide por peso o volumen. Únicamente: kg, g, L, ml, und, porción, loncha, bola, caja, bulto.
- isPack: true si el PRECIO de la línea cubre más de una unidad de consumo (six pack, paquete x N, bolsa de N kg, etc.). false si es una sola unidad.
- packQty: si isPack, cuántas unidades de consumo trae el paquete (6 para un six pack, 3 para una bolsa de 3 kg). null si no es paquete.
- lineCost: el valor total pagado por esa línea, como entero en pesos colombianos sin separadores (ej. 22650).
- note: nota breve opcional (vacía si no aplica).

Pistas de la factura colombiana:
- "SIXP", "SIX", "six pack" = paquete de 6 (isPack true, packQty 6).
- "x50 U", "x 50" = 50 unidades (isPack true, packQty 50).
- "3 KL", "3 KG", "3 KILOS" = 3 kilogramos (unit "kg", isPack true, packQty 3).
- "60 ML", "PET 60 ML" en un solo frasco = una unidad (isPack false, unit "und").
- Los montos usan punto o coma como separador de miles; conviértelos a enteros (22.650 -> 22650).`;

export class MissingApiKeyError extends Error {
  constructor() {
    super("Falta ANTHROPIC_API_KEY en el entorno.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Extract invoice line items from a base64-encoded image.
 * @throws MissingApiKeyError when the API key isn't configured.
 */
export async function extractInvoiceItems(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<InvoiceItem[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      // Constrain output to the schema; keep effort low — this is mechanical
      // extraction, not deep reasoning.
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      effort: "low",
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Extrae los renglones de productos de esta factura." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo no pudo procesar esta imagen.");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("No se obtuvo respuesta del modelo.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La respuesta del modelo no fue un JSON válido (¿factura muy larga?).");
  }

  const result = ResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("La respuesta del modelo no tuvo el formato esperado.");
  }
  // Keep only rows that have a usable name and price.
  return result.data.items.filter((it) => it.name && it.lineCost >= 0);
}
