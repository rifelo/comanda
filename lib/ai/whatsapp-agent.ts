import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { posMoney, type PosCatalog } from "@/lib/pos/types";
import type { PedidoAgente } from "@/lib/whatsapp/pedido";

/**
 * Sales agent behind the business WhatsApp. It answers about the menu, builds
 * the order with the customer and, once they confirm, hands it over through
 * the `crear_pedido` tool; the caller validates it against the catalog and
 * saves it as a pending order in the register. Anything it shouldn't handle
 * (complaints, payments, special requests) goes to a person via
 * `pasar_a_humano`.
 *
 * Mirrors lib/ai/pos-assistant.ts: official Anthropic SDK, ids checked by the
 * caller. History is rebuilt from the stored text each turn (no tool or
 * thinking blocks carried across turns), so nothing earlier is ever edited.
 */
const MODEL = "claude-opus-5-5";
const MAX_VUELTAS = 5;

export interface LocalInfo {
  nombre: string;
  direccion: string | null;
  horario: string | null;
  domicilios: string | null;
  instagram: string | null;
}

export type Turno = { autor: "cliente" | "agente" | "equipo"; texto: string };

export type Herramientas = {
  /** Validates and saves; returns what the agent should tell the customer, or the problem. */
  crearPedido: (p: PedidoAgente) => Promise<{ ok: true; folio: string; total: number } | { ok: false; error: string }>;
  pasarAHumano: (motivo: string) => Promise<void>;
};

export interface Respuesta {
  texto: string;
  /** True when the conversation was handed to the team (the agent stays quiet after). */
  humano: boolean;
}

const PedidoInput = z.object({
  tipo: z.enum(["llevar", "domicilio"]),
  nombre: z.string(),
  direccion: z.string().nullable(),
  nota: z.string().nullable(),
  lineas: z.array(z.object({
    producto_id: z.string(),
    cantidad: z.number().int(),
    opciones: z.array(z.object({ grupo_id: z.string(), opcion: z.string() })),
  })),
});
const HumanoInput = z.object({ motivo: z.string() });

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "crear_pedido",
    description:
      "Envía el pedido al punto de venta como orden pendiente para que el equipo lo prepare. Úsala solo cuando el cliente ya confirmó el resumen (productos, opciones y total) y tienes su nombre y, si es domicilio, la dirección. Devuelve el número de pedido o el problema que hay que resolver con el cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["llevar", "domicilio"] },
        nombre: { type: "string", description: "Nombre de quien recibe o recoge el pedido." },
        direccion: { type: ["string", "null"], description: "Dirección completa con barrio o referencias; null si es para llevar." },
        nota: { type: ["string", "null"], description: "Indicaciones del cliente (sin azúcar, hora de recogida…), o null." },
        lineas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producto_id: { type: "string", description: "id exacto del menú." },
              cantidad: { type: "integer" },
              opciones: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    grupo_id: { type: "string", description: "id del grupo de opciones del producto." },
                    opcion: { type: "string", description: "Nombre exacto de la opción." },
                  },
                  required: ["grupo_id", "opcion"],
                  additionalProperties: false,
                },
              },
            },
            required: ["producto_id", "cantidad", "opciones"],
            additionalProperties: false,
          },
        },
      },
      required: ["tipo", "nombre", "direccion", "nota", "lineas"],
      additionalProperties: false,
    },
  },
  {
    name: "pasar_a_humano",
    description:
      "Pasa la conversación a una persona del equipo. Úsala si el cliente lo pide, tiene una queja o un problema con un pedido o un pago, pide algo que no está en el menú o que no puedes resolver. Después de usarla, despídete diciendo que alguien del equipo le responde pronto.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Resumen corto para el equipo." } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

/** The menu as the agent reads it: ids, prices, options, what is sold out. */
export function menuParaAgente(catalog: PosCatalog): string {
  const out: string[] = [];
  for (const cat of catalog.cats) {
    const items = catalog.menu.filter((p) => p.catId === cat.id);
    if (!items.length) continue;
    out.push(`## ${cat.label}`);
    for (const p of items) {
      const opts = p.mods
        .map((gid) => catalog.modGroups[gid])
        .filter((g) => g && g.options.length)
        .map((g) => `${g.name} [grupo_id ${g.id}${g.required ? ", obligatorio" : ""}${g.type === "multi" ? ", varias" : ""}]: ${g.options.map((o) => (o.delta ? `${o.name} (+${posMoney(o.delta)})` : o.name)).join(" / ")}`);
      out.push(
        `- ${p.sub ? `${p.sub} · ` : ""}${p.name} — ${posMoney(p.price)}${p.stock === "sin" ? " — AGOTADO HOY" : ""} [producto_id ${p.id}]` +
          (p.desc ? `\n  ${p.desc}` : "") +
          (opts.length ? `\n  Opciones: ${opts.join("; ")}` : ""),
      );
    }
  }
  return out.join("\n");
}

function instrucciones(local: LocalInfo, menu: string): string {
  return `Eres quien atiende el WhatsApp de ${local.nombre}, un café en Yopal (Casanare, Colombia). Hablas con clientes: respondes dudas del menú, recomiendas y tomas pedidos para llevar o a domicilio.

Cómo escribes: en español de Colombia, cálido y breve, como en un chat (mensajes cortos, sin markdown con # ni tablas; puedes usar *negrita* de WhatsApp y algún emoji ☕ sin exagerar). Tutea. Nunca digas que eres una IA salvo que te lo pregunten directamente; si lo preguntan, dilo con naturalidad.

Lo que sabes del local:
- Dirección: ${local.direccion ?? "no la tienes; si la piden, pasa a humano"}
- Horario: ${local.horario ?? "no lo tienes; si lo piden, pasa a humano"}
- Domicilios: ${local.domicilios ?? "se hacen en Yopal; el costo del domicilio lo confirma el equipo al despachar"}
- Menú completo con fotos: cafepayo.com${local.instagram ? `\n- Instagram: @${local.instagram}` : ""}
- El pago se hace al recoger o al recibir el domicilio (efectivo, tarjeta o transferencia). Tú no cobras ni envías datos de pago.

Para tomar un pedido:
1. Arma el pedido con el cliente usando solo productos y opciones del menú de abajo, con sus precios exactos. Si un producto tiene opciones obligatorias, pregúntalas. No ofrezcas lo que está AGOTADO HOY.
2. Pregunta si es para llevar o a domicilio, el nombre y, si es domicilio, la dirección con barrio o referencias.
3. Envía un resumen con cada producto, sus opciones, el total de los productos (sin el domicilio) y pide confirmación.
4. Solo cuando confirme, usa crear_pedido. Si devuelve un problema, resuélvelo con el cliente. Si sale bien, dale el número de pedido y dile que el equipo lo está preparando (para llevar: unos 10 minutos; domicilio: el equipo le confirma el costo y el tiempo).

No inventes productos, precios, promociones ni tiempos distintos a estos. Si no sabes algo o el cliente necesita a una persona, usa pasar_a_humano.

# Menú (precios en pesos colombianos)
${menu}`;
}

const client = () => new Anthropic();

/** Rebuild the chat for the model: alternating turns, starting with the customer. */
export function historialComoMensajes(turnos: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of turnos) {
    const role = t.autor === "cliente" ? "user" : "assistant";
    const texto = t.autor === "equipo" ? `[Respondió una persona del equipo] ${t.texto}` : t.texto;
    if (!msgs.length && role === "assistant") continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${texto}`;
    else msgs.push({ role, content: texto });
  }
  return msgs;
}

export async function responderWhatsapp(input: {
  catalog: PosCatalog;
  local: LocalInfo;
  turnos: Turno[];
  ahora: string;
  herramientas: Herramientas;
}): Promise<Respuesta> {
  const messages = historialComoMensajes(input.turnos);
  if (!messages.length || messages[messages.length - 1].role !== "user") return { texto: "", humano: false };
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: instrucciones(input.local, menuParaAgente(input.catalog)), cache_control: { type: "ephemeral" } },
    { type: "text", text: `Fecha y hora en Yopal ahora: ${input.ahora}.` },
  ];
  let humano = false;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await client().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      output_config: { effort: "low" },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") {
      await input.herramientas.pasarAHumano("El asistente no pudo responder este mensaje.");
      return { texto: "Déjame pasarte con alguien del equipo, ya te responden 🙌", humano: true };
    }
    const texto = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const usos = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !usos.length) return { texto, humano };

    messages.push({ role: "assistant", content: res.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const uso of usos) {
      resultados.push({ type: "tool_result", tool_use_id: uso.id, ...(await ejecutar(uso, input.herramientas, () => (humano = true))) });
    }
    messages.push({ role: "user", content: resultados });
  }
  await input.herramientas.pasarAHumano("La conversación se alargó sin cerrar el pedido.");
  return { texto: "Te paso con alguien del equipo para terminar, ya te responden 🙌", humano: true };
}

async function ejecutar(
  uso: Anthropic.Beta.BetaToolUseBlock,
  h: Herramientas,
  marcarHumano: () => void,
): Promise<{ content: string; is_error?: boolean }> {
  if (uso.name === "crear_pedido") {
    const p = PedidoInput.safeParse(uso.input);
    if (!p.success) return { content: "Datos del pedido incompletos; revisa y vuelve a intentarlo.", is_error: true };
    const r = await h.crearPedido({
      tipo: p.data.tipo,
      nombre: p.data.nombre,
      direccion: p.data.direccion,
      nota: p.data.nota,
      lineas: p.data.lineas.map((l) => ({
        productoId: l.producto_id,
        cantidad: l.cantidad,
        opciones: l.opciones.map((o) => ({ grupoId: o.grupo_id, opcion: o.opcion })),
      })),
    });
    return r.ok
      ? { content: `Pedido creado: número ${r.folio}, total de productos ${posMoney(r.total)}.` }
      : { content: r.error, is_error: true };
  }
  if (uso.name === "pasar_a_humano") {
    const p = HumanoInput.safeParse(uso.input);
    await h.pasarAHumano(p.success ? p.data.motivo : "Sin motivo");
    marcarHumano();
    return { content: "Listo, el equipo ya fue avisado." };
  }
  return { content: `Herramienta desconocida: ${uso.name}`, is_error: true };
}
