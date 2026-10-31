"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CorregirSheet } from "../_components/corregir-sheet";
import { InsumoSheet } from "../_components/insumo-sheet";

/** «Corregir» and «Editar» on the insumo's page (the sheets are the list's). */
export function InsumoAcciones({ item, categorias, recetaHref }: { item: Ingrediente; categorias: IngredienteCategoria[]; recetaHref: string | null }) {
  const [abierto, setAbierto] = React.useState<"corregir" | "editar" | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<Pencil size={18} aria-hidden />} onClick={() => setAbierto("editar")}>
        Editar
      </Button>
      <Button size="sm" onClick={() => setAbierto("corregir")} data-testid="insumo-corregir">
        Corregir
      </Button>
      {abierto === "corregir" ? <CorregirSheet item={item} onClose={() => setAbierto(null)} recetaHref={recetaHref} /> : null}
      {abierto === "editar" ? <InsumoSheet editing={item} categorias={categorias} onClose={() => setAbierto(null)} /> : null}
    </>
  );
}
