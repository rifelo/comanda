import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ejecutar, reglasAgente, TOOLS, type Herramientas, type Respuesta } from "./whatsapp-agent";

/**
 * The WhatsApp agent as a Claude Console agent (Managed Agents). The agent —
 * model, fixed rules and the four tools — lives in the Console, versioned
 * (scripts/agente-whatsapp syncs it). Each WhatsApp conversation is one
 * session there: it keeps its own history, tool calls included, so we only
 * send what is new. The day's data (local, menu, lessons, client file) goes in
 * as a system message when the session starts; the tools still run here.
 *
 * Env: WHATSAPP_AGENT_ID, WHATSAPP_AGENT_ENV_ID (from the sync script).
 */
export const NOMBRE_AGENTE = "PA'YO · WhatsApp";
export const MODELO_AGENTE = "claude-haiku-5-5";
/** How long one reply may take before we give up on the session. */
const LIMITE_MS = 90_000;

/** System prompt of the Console agent: the fixed rules plus how context arrives. */
export function sistemaAgente(nombreLocal: string): string {
  return `${reglasAgente(nombreLocal)}

# Cómo te llega el contexto
Al empezar cada conversación recibes un mensaje de sistema con los datos del local, el menú del día (con producto_id y grupo_id para crear_pedido), las lecciones aprobadas por el dueño y la ficha del cliente. Con cada mensaje del cliente puede llegar otro con la hora en Yopal o lo que escribió una persona del equipo. Síguelos; nunca los menciones al cliente.`;
}

/** The four tools as Console custom tools (we validate inputs ourselves). */
export function herramientasAgente() {
  return TOOLS.map((t) => ({
    type: "custom" as const,
    name: t.name,
    description: t.description ?? "",
    input_schema: t.input_schema as { type: "object"; properties?: Record<string, unknown>; required?: string[] },
  }));
}

export type EntradaConsola = {
  /** Session to continue, or null to start one. */
  sesionId: string | null;
  /** Day data + client file, sent only when a session starts. */
  contextoInicial: string;
  /** Turn context: the hour, and what the team wrote since the last reply. */
  contextoTurno: string;
  /** What the customer wrote since the last reply. */
  textoCliente: string;
  titulo: string;
  herramientas: Herramientas;
};

export type RespuestaConsola = Respuesta & { sesionId: string };

const texto = (t: string) => ({ type: "text" as const, text: t });

export async function responderConConsola(e: EntradaConsola): Promise<RespuestaConsola> {
  const agentId = process.env.WHATSAPP_AGENT_ID;
  const envId = process.env.WHATSAPP_AGENT_ENV_ID;
  if (!agentId || !envId) throw new Error("Faltan WHATSAPP_AGENT_ID / WHATSAPP_AGENT_ENV_ID.");
  const client = new Anthropic();
  const nueva = !e.sesionId;
  const sesionId = e.sesionId ?? (await client.beta.sessions.create({ agent: agentId, environment_id: envId, title: e.titulo })).id;

  let humano = false;
  let reaccion: string | null = null;
  const marcas = { humano: () => (humano = true), reaccion: (x: string) => (reaccion = x) };
  const partes: string[] = [];

  const sistema = [nueva ? e.contextoInicial : null, e.contextoTurno].filter((x): x is string => !!x?.trim());
  const abort = new AbortController();
  const reloj = setTimeout(() => abort.abort(), LIMITE_MS);
  try {
    // Stream first, then send: events that happen before the stream opens
    // would otherwise arrive late, in one batch.
    const stream = await client.beta.sessions.events.stream(sesionId, {}, { signal: abort.signal });
    await client.beta.sessions.events.send(sesionId, {
      // The API wants the system message last; it applies to this turn and the next ones.
      events: [
        { type: "user.message" as const, content: [texto(e.textoCliente)] },
        ...(sistema.length ? [{ type: "system.message" as const, content: sistema.map(texto) }] : []),
      ],
    });
    for await (const ev of stream) {
      if (ev.type === "agent.message") {
        for (const b of ev.content) if (b.type === "text" && b.text.trim()) partes.push(b.text.trim());
      } else if (ev.type === "agent.custom_tool_use") {
        const uso = { type: "tool_use", id: ev.id, name: ev.name, input: ev.input } as Anthropic.Beta.BetaToolUseBlock;
        const r = await ejecutar(uso, e.herramientas, marcas);
        await client.beta.sessions.events.send(sesionId, {
          events: [{ type: "user.custom_tool_result", custom_tool_use_id: ev.id, content: [texto(r.content)], is_error: r.is_error ?? false }],
        });
      } else if (ev.type === "session.status_idle") {
        if (ev.stop_reason.type !== "requires_action") break;
      } else if (ev.type === "session.status_terminated") {
        break;
      } else if (ev.type === "session.error") {
        console.error("[whatsapp consola] session.error:", JSON.stringify(ev).slice(0, 500));
      }
    }
  } finally {
    clearTimeout(reloj);
  }
  return { texto: partes.join("\n\n"), humano, reaccion, sesionId };
}
