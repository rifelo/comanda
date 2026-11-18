/**
 * How the WhatsApp agent improves with the owner's approval: the day's
 * numbers, the prompt version every reply is tagged with, and the transcript
 * the nightly review reads. Pure, so it is tested; the I/O lives in
 * lib/whatsapp/revision.ts.
 */

/** Bumped by hand when the base instructions in lib/ai/whatsapp-agent.ts change. */
export const PROMPT_BASE = "2026-11-18a";

export type Leccion = { id: string; texto: string };

/** Base version plus the set of approved lessons, e.g. «2026-11-16·L3-a1f0». */
export function versionPrompt(aprobadas: Leccion[]): string {
  if (!aprobadas.length) return `${PROMPT_BASE}·L0`;
  const ids = aprobadas.map((l) => l.id).sort().join(",");
  let h = 0;
  for (let i = 0; i < ids.length; i++) h = (h * 31 + ids.charCodeAt(i)) >>> 0;
  return `${PROMPT_BASE}·L${aprobadas.length}-${h.toString(16).slice(-4).padStart(4, "0")}`;
}

/** The approved lessons as the agent reads them (empty when there are none). */
export function seccionLecciones(aprobadas: Leccion[]): string {
  if (!aprobadas.length) return "";
  return `# Lo que hemos aprendido de conversaciones reales (aprobado por el dueño; síguelo)\n${aprobadas.map((l) => `- ${l.texto}`).join("\n")}\n\n`;
}

export type MensajeDia = {
  conversacionId: string;
  autor: "cliente" | "agente" | "equipo";
  texto: string;
  at: Date;
  ordenId: string | null;
  fallido: boolean;
  promptVersion: string | null;
};
export type ConversacionDia = {
  id: string;
  nombre: string | null;
  traspasoAt: Date | null;
  traspasoMotivo: string | null;
};

export interface MetricasDia {
  conversaciones: number;
  conPedido: number;
  traspasos: number;
  /** Conversations where the team wrote after the agent had answered. */
  intervenciones: number;
  /** Customers who wrote and got no answer at all (agent off, paused, or failed). */
  sinRespuesta: number;
  respuestas: number;
  fallidas: number;
  versiones: string[];
}

const mismoDia = (d: Date | null, desde: Date, hasta: Date) => !!d && d >= desde && d < hasta;

/** The day's numbers, from that day's messages. `desde`/`hasta` bound the day. */
export function metricasDia(mensajes: MensajeDia[], convs: ConversacionDia[], desde: Date, hasta: Date): MetricasDia {
  const porConv = agrupar(mensajes);
  let conPedido = 0;
  let intervenciones = 0;
  let sinRespuesta = 0;
  for (const ms of porConv.values()) {
    if (!ms.some((m) => m.autor === "cliente")) continue;
    if (ms.some((m) => m.ordenId)) conPedido++;
    const primerAgente = ms.findIndex((m) => m.autor === "agente");
    if (primerAgente >= 0 && ms.slice(primerAgente).some((m) => m.autor === "equipo")) intervenciones++;
    if (!ms.some((m) => m.autor !== "cliente")) sinRespuesta++;
  }
  const respuestas = mensajes.filter((m) => m.autor === "agente");
  return {
    conversaciones: [...porConv.values()].filter((ms) => ms.some((m) => m.autor === "cliente")).length,
    conPedido,
    traspasos: convs.filter((c) => mismoDia(c.traspasoAt, desde, hasta)).length,
    intervenciones,
    sinRespuesta,
    respuestas: respuestas.length,
    fallidas: respuestas.filter((m) => m.fallido).length,
    versiones: [...new Set(respuestas.map((m) => m.promptVersion).filter((v): v is string => !!v))].sort(),
  };
}

function agrupar(mensajes: MensajeDia[]): Map<string, MensajeDia[]> {
  const porConv = new Map<string, MensajeDia[]>();
  for (const m of [...mensajes].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    porConv.set(m.conversacionId, [...(porConv.get(m.conversacionId) ?? []), m]);
  }
  return porConv;
}

const hora = (d: Date) => {
  const b = new Date(d.getTime() - 5 * 3600_000);
  return `${String(b.getUTCHours()).padStart(2, "0")}:${String(b.getUTCMinutes()).padStart(2, "0")}`;
};
const QUIEN = { cliente: "Cliente", agente: "Agente", equipo: "Equipo (persona)" } as const;

/**
 * The day's conversations as the reviewer reads them: each with its outcome
 * (order, handover and why, team stepped in) and the messages, the longest
 * ones trimmed so one chat can't crowd out the rest.
 */
export function transcripcion(mensajes: MensajeDia[], convs: ConversacionDia[], maxPorConv = 40): string {
  const info = new Map(convs.map((c) => [c.id, c]));
  const bloques: string[] = [];
  let n = 0;
  for (const [id, ms] of agrupar(mensajes)) {
    if (!ms.some((m) => m.autor === "cliente")) continue;
    const c = info.get(id);
    const resultado = [
      ms.some((m) => m.ordenId) ? "terminó en pedido" : "sin pedido",
      c?.traspasoMotivo ? `pasada a una persona («${c.traspasoMotivo}»)` : null,
      ms.some((m, i) => m.autor === "equipo" && ms.slice(0, i).some((x) => x.autor === "agente")) ? "el equipo intervino" : null,
      ms.some((m) => m.fallido) ? "hubo mensajes no entregados" : null,
    ]
      .filter(Boolean)
      .join("; ");
    const lineas = ms.slice(-maxPorConv).map((m) => `${hora(m.at)} ${QUIEN[m.autor]}: ${m.texto.replace(/\s+/g, " ").slice(0, 400)}`);
    bloques.push(`## Conversación ${++n}${c?.nombre ? ` · ${c.nombre}` : ""} · ${resultado}\n${lineas.join("\n")}`);
  }
  return bloques.join("\n\n");
}
