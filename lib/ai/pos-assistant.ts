import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PosCatalog, PosSuggest, PosAct, PosCatalogFilter } from "@/lib/pos/types";
import { POS_SUGGEST_KINDS } from "@/lib/pos/types";

/**
 * Live POS assistant. Given the running conversation (from the cashier's
 * microphone via browser speech-to-text), the current cart, and the org's live
 * catalog, asks Claude for up to a few concrete suggestions — each optionally
 * carrying an action (add item, make it a combo, apply modifiers, flag an
 * allergy, …) that the cashier can apply with one tap.
 *
 * Mirrors lib/ai/invoice.ts: official Anthropic SDK, claude-opus-4-8, JSON
 * schema structured output, re-validated with zod. All ids the model emits are
 * checked against the catalog by the caller before being trusted.
 */

export class MissingApiKeyError extends Error {
  constructor() {
    super("Falta ANTHROPIC_API_KEY en el entorno.");
    this.name = "MissingApiKeyError";
  }
}

export interface PosAssistantInput {
  catalog: PosCatalog;
  transcript: { who: string; text: string }[];
  cart: { name: string; qty: number; mods: string[] }[];
  orderType: string;
  sinGluten: boolean;
}

// Normalized act shape the model emits (a flat, fixed-key object — structured
// outputs can't express discriminated unions or arbitrary-key maps). The caller
// translates this into a typed PosAct and validates ids.
const ActSchema = z.object({
  type: z.enum(["add", "combo", "swapCombo", "mods", "flag", "loyalty", "none"]),
  id: z.string().nullable(),
  removeId: z.string().nullable(),
  comboId: z.string().nullable(),
  modsJson: z.string().nullable(),
  flagValue: z.string().nullable(),
});
const SuggestSchema = z.object({
  kind: z.enum(POS_SUGGEST_KINDS as [string, ...string[]]),
  title: z.string().trim().min(1).max(120),
  detail: z.string().max(240).default(""),
  say: z.string().max(240).default(""),
  actionLabel: z.string().max(80).default(""),
  focusCatId: z.string().nullable(),
  focusHighlightId: z.string().nullable(),
  act: ActSchema,
});
const FilterSchema = z.object({
  active: z.boolean(),
  label: z.string().max(60).default(""),
  productIds: z.array(z.string()).default([]),
});
const ResultSchema = z.object({
  suggestions: z.array(SuggestSchema),
  filter: FilterSchema,
});

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      description: "Hasta 3 sugerencias, las más útiles primero. Vacío si no hay nada que sugerir.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: [...POS_SUGGEST_KINDS] },
          title: { type: "string", description: "Titular corto para el cajero" },
          detail: { type: "string", description: "Una frase de contexto (puede ir vacía)" },
          say: { type: "string", description: "Frase opcional para decir en voz alta al cliente" },
          actionLabel: { type: "string", description: "Texto del botón de acción (vacío si no hay acción)" },
          focusCatId: { type: ["string", "null"], description: "id de categoría a abrir, o null" },
          focusHighlightId: { type: ["string", "null"], description: "id de producto/combo a resaltar, o null" },
          act: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: ["add", "combo", "swapCombo", "mods", "flag", "loyalty", "none"],
                description: "Tipo de acción; 'none' si la sugerencia es solo informativa",
              },
              id: { type: ["string", "null"], description: "id de producto (add/mods) o combo (combo)" },
              removeId: { type: ["string", "null"], description: "id del producto a reemplazar (swapCombo)" },
              comboId: { type: ["string", "null"], description: "id del combo destino (swapCombo)" },
              modsJson: {
                type: ["string", "null"],
                description:
                  'JSON con {"<id_de_grupo>": "<opción>" | ["<opción>",...]} para act.type=mods; null si no aplica',
              },
              flagValue: { type: ["string", "null"], description: "Etiqueta para act.type=flag (ej. 'Sin gluten')" },
            },
            required: ["type", "id", "removeId", "comboId", "modsJson", "flagValue"],
          },
        },
        required: [
          "kind",
          "title",
          "detail",
          "say",
          "actionLabel",
          "focusCatId",
          "focusHighlightId",
          "act",
        ],
      },
    },
    filter: {
      type: "object",
      additionalProperties: false,
      description:
        "Filtra el catálogo del cajero a lo que pidió el cliente. Úsalo cuando el cliente exprese un requisito o preferencia que reduzca el menú.",
      properties: {
        active: { type: "boolean", description: "true para filtrar el catálogo; false si no aplica" },
        label: { type: "string", description: "Descripción corta del filtro, ej. 'Bebidas frías', 'Sin gluten'" },
        productIds: {
          type: "array",
          description: "ids del catálogo que cumplen el requisito del cliente",
          items: { type: "string" },
        },
      },
      required: ["active", "label", "productIds"],
    },
  },
  required: ["suggestions", "filter"],
} as const;

const SYSTEM = `Eres el asistente de IA de un Punto de Venta (POS) para un restaurante en Colombia. Escuchas la conversación entre el cajero y el cliente (transcrita por voz) y ayudas al cajero a atender mejor y completar el pedido.

Tu trabajo: a partir de lo último que se dijo, el pedido actual y el catálogo, propones HASTA 3 sugerencias concretas y accionables. Si no hay nada relevante que sugerir, devuelve una lista vacía.

Reglas:
- Habla en español de Colombia, cálido y breve. "say" es opcional: úsalo solo cuando una frase ayude al cajero a responderle al cliente.
- USA EXCLUSIVAMENTE los ids exactos del catálogo que te paso. Nunca inventes ids. Si un producto no está en el catálogo, no lo sugieras.
- Para act.type:
  · "add": agregar un producto. Pon su id en "id".
  · "combo": agregar un combo. Pon el id del combo en "id".
  · "swapCombo": convertir un producto ya pedido en un combo. "removeId" = id del producto en el pedido, "comboId" = id del combo.
  · "mods": personalizar un producto del pedido. "id" = id del producto, "modsJson" = JSON {"<id_grupo>": "<opción>"} para grupos de una sola opción, o {"<id_grupo>": ["<opción1>","<opción2>"]} para varias. Usa los ids de grupo y los NOMBRES de opción EXACTOS del catálogo.
  · "flag": marcar una nota del pedido (ej. "Sin gluten"). Pon el texto en "flagValue".
  · "loyalty": registrar fidelidad.
  · "none": sugerencia solo informativa, sin botón.
- Cuando el cliente pide algo agotado (stock "sin"), no lo agregues: sugiere un reemplazo disponible (kind "agotado").
- Cuando detectes oportunidad de combo que le ahorre al cliente, propón swapCombo (kind "combo").
- Si el cliente menciona alergia/celiaquía, marca el pedido (kind "alergia", act flag) y luego evita recomendar productos que la violen (kind "atencion").
- focusCatId/focusHighlightId son opcionales: úsalos para abrir una categoría o resaltar un producto en la pantalla del cajero. null si no aplica.
- "actionLabel" describe el botón (ej. "Agregar Limonada de coco"). Déjalo vacío si act.type es "none".
- filter: filtra el catálogo del cajero a lo que pidió el cliente. Pon active=true SOLO cuando el cliente exprese un requisito o preferencia que reduzca el menú (ej. "algo frío", "sin gluten", "vegetariano", "una hamburguesa", "algo dulce", "sin carne"). Entonces label = una etiqueta corta del filtro y productIds = TODOS los ids del catálogo que cumplen (no solo uno). Si el cliente no expresó un criterio que filtre, active=false, label vacío y productIds vacío. El filtro es independiente de las sugerencias: puedes filtrar el catálogo y además sugerir productos.`;

function compactCatalog(catalog: PosCatalog): string {
  const modGroups = Object.values(catalog.modGroups).map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    options: g.options.map((o) => o.name),
  }));
  const products = catalog.menu.map((p) => ({
    id: p.id,
    name: p.name,
    cat: catalog.catLabel[p.catId] ?? p.catId,
    price: p.price,
    stock: p.stock,
    fav: p.fav,
    mods: p.mods,
  }));
  const combos = catalog.combos.map((c) => ({
    id: c.id,
    name: c.name,
    price: c.price,
    saving: c.saving,
    items: c.items,
  }));
  return JSON.stringify({ products, combos, modGroups });
}

function normalizeAct(a: z.infer<typeof ActSchema>): PosAct | undefined {
  switch (a.type) {
    case "add":
      return a.id ? { type: "add", id: a.id } : undefined;
    case "combo":
      return a.id ? { type: "combo", id: a.id } : undefined;
    case "swapCombo":
      return a.removeId && a.comboId
        ? { type: "swapCombo", removeId: a.removeId, comboId: a.comboId }
        : undefined;
    case "mods": {
      if (!a.id || !a.modsJson) return undefined;
      try {
        const set = JSON.parse(a.modsJson) as Record<string, string | string[]>;
        return { type: "mods", id: a.id, set };
      } catch {
        return undefined;
      }
    }
    case "flag":
      return { type: "flag", value: a.flagValue ?? undefined };
    case "loyalty":
      return { type: "loyalty" };
    default:
      return undefined;
  }
}

export interface PosAssistantOutput {
  suggestions: PosSuggest[];
  /** Catalog filter the customer's words imply, or null. Caller validates ids. */
  filter: PosCatalogFilter | null;
}

/**
 * Ask Claude for POS suggestions + an optional catalog filter. Returns raw
 * data; the caller validates that every id exists in the catalog.
 * @throws MissingApiKeyError when the API key isn't configured.
 */
export async function suggestPosActions(
  input: PosAssistantInput,
): Promise<PosAssistantOutput> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const transcriptText = input.transcript
    .slice(-14)
    .map((t) => `${t.who}: ${t.text}`)
    .join("\n");
  const cartText = input.cart.length
    ? input.cart
        .map(
          (l) =>
            `- ${l.qty}× ${l.name}${l.mods.length ? ` (${l.mods.join(", ")})` : ""}`,
        )
        .join("\n")
    : "(vacío)";

  const userText = `CATÁLOGO (JSON):
${compactCatalog(input.catalog)}

PEDIDO ACTUAL:
${cartText}
Tipo de pedido: ${input.orderType}
Marcado sin gluten: ${input.sinGluten ? "sí" : "no"}

CONVERSACIÓN (lo más reciente al final):
${transcriptText || "(aún nada)"}

Sugiere las próximas acciones útiles para el cajero.`;

  const client = new Anthropic();
  // Haiku 4.5 — fastest model, for near-real-time suggestions as the customer
  // speaks. Supports structured outputs (output_config.format) but NOT the
  // `effort` parameter (it 400s on Haiku), so effort is intentionally omitted.
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    system: SYSTEM,
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo no pudo procesar la conversación.");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) return { suggestions: [], filter: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { suggestions: [], filter: null };
  }
  const result = ResultSchema.safeParse(parsed);
  if (!result.success) return { suggestions: [], filter: null };

  const f = result.data.filter;
  const filter: PosCatalogFilter | null =
    f.active && f.productIds.length ? { label: f.label, ids: f.productIds } : null;

  const suggestions = result.data.suggestions.map((s) => {
    const act = normalizeAct(s.act);
    const suggest: PosSuggest = {
      kind: s.kind as PosSuggest["kind"],
      title: s.title,
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.say ? { say: s.say } : {}),
      ...(s.actionLabel ? { actionLabel: s.actionLabel } : {}),
      ...(act ? { act } : {}),
      ...(s.focusCatId || s.focusHighlightId
        ? {
            focus: {
              ...(s.focusCatId ? { catId: s.focusCatId } : {}),
              highlightId: s.focusHighlightId,
            },
          }
        : {}),
    };
    return suggest;
  });

  return { suggestions, filter };
}
