import { describe, expect, it } from "vitest";
import { metricasDia, PROMPT_BASE, seccionLecciones, transcripcion, versionPrompt, type ConversacionDia, type MensajeDia } from "./aprendizajes";

const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00-05:00`);
const m = (conv: string, autor: MensajeDia["autor"], hhmm: string, texto: string, extra: Partial<MensajeDia> = {}): MensajeDia => ({
  conversacionId: conv,
  autor,
  texto,
  at: at(hhmm),
  ordenId: null,
  fallido: false,
  promptVersion: autor === "agente" ? "v1" : null,
  ...extra,
});
const desde = at("00:00");
const hasta = new Date(desde.getTime() + 86400_000);

describe("versionPrompt / seccionLecciones", () => {
  it("is the base version without lessons", () => {
    expect(versionPrompt([])).toBe(`${PROMPT_BASE}·L0`);
    expect(seccionLecciones([])).toBe("");
  });
  it("changes with the set of lessons, not their order", () => {
    const a = versionPrompt([{ id: "x", texto: "1" }, { id: "y", texto: "2" }]);
    expect(a).toMatch(new RegExp(`^${PROMPT_BASE}·L2-[0-9a-f]{4}$`));
    expect(versionPrompt([{ id: "y", texto: "2" }, { id: "x", texto: "1" }])).toBe(a);
    expect(versionPrompt([{ id: "x", texto: "1" }, { id: "z", texto: "2" }])).not.toBe(a);
  });
  it("lists the lessons for the prompt", () => {
    expect(seccionLecciones([{ id: "x", texto: "Ofrecer jugos en leche si piden algo sin café." }])).toContain("- Ofrecer jugos en leche");
  });
});

describe("metricasDia", () => {
  const mensajes = [
    // 1: ordered
    m("a", "cliente", "07:50", "Hola"),
    m("a", "agente", "07:50", "¡Buenos días!"),
    m("a", "agente", "07:52", "Pedido A-1", { ordenId: "o1" }),
    // 2: team stepped in after the agent
    m("b", "cliente", "09:00", "¿Tienen domicilio a Llano Lindo?"),
    m("b", "agente", "09:00", "Déjame confirmarlo"),
    m("b", "equipo", "09:05", "Sí, $3.000"),
    // 3: nobody answered
    m("c", "cliente", "21:30", "¿Están abiertos?"),
    // 4: a reply that failed
    m("d", "cliente", "10:00", "Hola"),
    m("d", "agente", "10:00", "¡Hola!", { fallido: true, promptVersion: "v2" }),
  ];
  const convs: ConversacionDia[] = [
    { id: "b", nombre: "Ana", traspasoAt: at("09:01"), traspasoMotivo: "Domicilio fuera de zona" },
    { id: "e", nombre: null, traspasoAt: new Date("2026-11-15T12:00:00-05:00"), traspasoMotivo: "ayer" },
  ];
  it("counts the day", () => {
    expect(metricasDia(mensajes, convs, desde, hasta)).toEqual({
      conversaciones: 4,
      conPedido: 1,
      traspasos: 1,
      intervenciones: 1,
      sinRespuesta: 1,
      respuestas: 4,
      fallidas: 1,
      versiones: ["v1", "v2"],
    });
  });
  it("writes the transcript with each outcome", () => {
    const t = transcripcion(mensajes, convs);
    expect(t).toContain("terminó en pedido");
    expect(t).toContain("pasada a una persona («Domicilio fuera de zona»)");
    expect(t).toContain("el equipo intervino");
    expect(t).toContain("hubo mensajes no entregados");
    expect(t).toContain("09:05 Equipo (persona): Sí, $3.000");
    expect(t.match(/## Conversación/g)).toHaveLength(4);
  });
});
