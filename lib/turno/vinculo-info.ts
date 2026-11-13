/** Client-safe info about turno tasks tied to other work (template_tasks.vinculo, mig 0084). */

export type Vinculo = "verificar_insumos";

export const VINCULOS: Record<Vinculo, { label: string; href: string; ayuda: string; boton: string }> = {
  verificar_insumos: {
    label: "Verificación de insumos",
    href: "/turno/inventario/verificar",
    ayuda: "Se marca sola al terminar «Verificar insumos» en Inventario. Toca para ir.",
    boton: "Verificar",
  },
};

export function esVinculo(v: unknown): v is Vinculo {
  return typeof v === "string" && v in VINCULOS;
}
