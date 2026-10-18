/**
 * Suggestions from the team, section by section: an item of the list that
 * belongs in this section, or something that is there and the list doesn't
 * have. Pure helpers — no I/O; unit-tested in sugerencias.test.ts. Writes:
 * app/turno/inventario/sugerir (tablet) and app/(admin)/inventario/sugerencias.
 */
import { ZONAS } from "./niveles";
import { mismoNombre, parecidos } from "./propuestas";

export type Zona = (typeof ZONAS)[number];
export type TipoSugerencia = "ubicacion" | "nuevo";

export interface ItemZona {
  id: string;
  name: string;
  ubicacion: string | null;
}

/**
 * What typing a name in a section turns into: an item of the list with the
 * same name (it already is here → nothing to do; elsewhere → «va en esta
 * sección»), else the closest items to pick from before proposing it as new.
 */
export function clasificar(nombre: string, zona: Zona, items: ReadonlyArray<ItemZona>): { igual: ItemZona | null; yaAqui: boolean; parecidos: ItemZona[] } {
  const igual = items.find((i) => mismoNombre(i.name, nombre)) ?? null;
  return {
    igual,
    yaAqui: !!igual && igual.ubicacion === zona,
    parecidos: igual ? [] : parecidos(nombre, items, 6),
  };
}

/** Why the suggestion can't be sent, or null. */
export function errorSugerencia(input: { zona: string | null; tipo: TipoSugerencia; ingredienteId?: string | null; nombre?: string | null }): string | null {
  if (!input.zona || !(ZONAS as readonly string[]).includes(input.zona)) return "Elige la sección.";
  if (input.tipo === "ubicacion" && !input.ingredienteId) return "Elige el ítem.";
  if (input.tipo === "nuevo" && (input.nombre ?? "").trim().length < 2) return "Escribe qué falta en la lista.";
  return null;
}

/** Same open suggestion already on the owner's list (same section and item, or same name). */
export function yaSugerida(
  s: { zona: string; tipo: TipoSugerencia; ingredienteId?: string | null; nombre?: string | null },
  abiertas: ReadonlyArray<{ zona: string; tipo: string; ingrediente_id: string | null; nombre: string | null }>,
): boolean {
  return abiertas.some((a) => a.zona === s.zona && a.tipo === s.tipo && (s.tipo === "ubicacion" ? a.ingrediente_id === s.ingredienteId : !!a.nombre && mismoNombre(a.nombre, s.nombre ?? "")));
}
