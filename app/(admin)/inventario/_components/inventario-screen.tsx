"use client";

import * as React from "react";
import { FolderTree, Plus } from "lucide-react";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import type { FaltanteReporte } from "@/lib/inventario/faltantes-db";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader } from "@/components/ui/top-bar";
import { CategoriasInsumoSheet } from "./categorias-insumo-sheet";
import { CorregirSheet } from "./corregir-sheet";
import { FaltantesClient } from "./faltantes-client";
import { InsumoList } from "./insumo-list";
import { InsumoSheet } from "./insumo-sheet";
import { PorRevisar, type PorRevisarData } from "./por-revisar";

/**
 * /inventario — «Por revisar» on top, then the searchable list with
 * «Corregir» on every row (docs/redesign/PLAN.md §6.3). Replaces the 2.683-line
 * inventario-client: the category tree, the bulk count mode and the stats
 * strip are gone (counts happen on the tablet; the owner approves them here).
 */
export function InventarioScreen({
  ingredientes,
  categorias,
  porRevisar,
  recetaPorInsumo,
  faltantes,
  vistaInicial,
}: {
  ingredientes: Ingrediente[];
  categorias: IngredienteCategoria[];
  porRevisar: PorRevisarData;
  /** Best-selling product using each insumo (for «Error de receta»). */
  recetaPorInsumo: Record<string, string>;
  /** «Se acaba»: what the team flagged on the tablet (ex /inventario/faltantes). */
  faltantes: { abiertos: FaltanteReporte[]; recientes: FaltanteReporte[]; tz: string };
  vistaInicial: "existencias" | "acabando";
}) {
  const [vista, setVista] = React.useState(vistaInicial);
  const [corregir, setCorregir] = React.useState<string | null>(null);
  const [editar, setEditar] = React.useState<string | "nuevo" | null>(null);
  const [cats, setCats] = React.useState(false);

  const byId = React.useMemo(() => new Map(ingredientes.map((i) => [i.id, i])), [ingredientes]);
  const catLabel = React.useMemo(() => new Map(categorias.map((c) => [c.id, c.label])), [categorias]);
  const categoriaDe = React.useCallback((id: string | null) => (id ? (catLabel.get(id) ?? "") : ""), [catLabel]);
  const conteoCat = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of ingredientes) if (i.category_id) m[i.category_id] = (m[i.category_id] ?? 0) + 1;
    return m;
  }, [ingredientes]);

  const item = corregir ? byId.get(corregir) : undefined;
  const editing = editar && editar !== "nuevo" ? (byId.get(editar) ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-28 desk:pb-10">
      <PageHeader
        title="Inventario"
        sub={`${ingredientes.length} insumos`}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<FolderTree size={18} aria-hidden />} onClick={() => setCats(true)}>
              Categorías
            </Button>
            <Button size="sm" icon={<Plus size={18} aria-hidden />} onClick={() => setEditar("nuevo")} className="hidden sm:inline-flex">
              Nuevo insumo
            </Button>
          </>
        }
      />
      <div className="px-4 sm:px-7 flex flex-col gap-8">
        <Segmented
          label="Vista"
          value={vista}
          onChange={setVista}
          options={[
            { value: "existencias", label: "Existencias" },
            { value: "acabando", label: "Se acaba", count: faltantes.abiertos.length || undefined },
          ]}
        />
        {vista === "existencias" ? (
          <>
            <PorRevisar d={porRevisar} onCorregir={setCorregir} onEditar={setEditar} />
            <InsumoList ingredientes={ingredientes} categoriaDe={categoriaDe} onCorregir={setCorregir} />
          </>
        ) : (
          <FaltantesClient abiertos={faltantes.abiertos} recientes={faltantes.recientes} ingredientes={ingredientes} categorias={categorias} tz={faltantes.tz} />
        )}
      </div>

      {vista === "existencias" ? (
        <div className="sm:hidden fixed left-4 right-4 bottom-[calc(var(--h-tabs)+env(safe-area-inset-bottom)+12px)] z-20">
          <Button block icon={<Plus size={20} aria-hidden />} onClick={() => setEditar("nuevo")}>
            Nuevo insumo
          </Button>
        </div>
      ) : null}

      {item ? (
        <CorregirSheet
          key={item.id}
          item={item}
          onClose={() => setCorregir(null)}
          recetaHref={recetaPorInsumo[item.id] ? `/productos/${recetaPorInsumo[item.id]}?tab=receta` : null}
        />
      ) : null}
      {editar ? <InsumoSheet key={editar} editing={editing} categorias={categorias} onClose={() => setEditar(null)} /> : null}
      {cats ? <CategoriasInsumoSheet categorias={categorias} conteo={conteoCat} onClose={() => setCats(false)} /> : null}
    </div>
  );
}
