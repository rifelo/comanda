"use client";

import * as React from "react";
import { MonitorSmartphone } from "lucide-react";
import type { ProductoFicha } from "@/lib/db/recetas";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader } from "@/components/ui/top-bar";
import { DatosForm } from "./datos-form";
import { FavoriteToggle } from "./favorite-toggle";
import { MargenPill, pesos, Thumb } from "./bits";
import { ModificadoresTab } from "./modificadores-tab";
import { PreparacionEditor } from "./preparacion-editor";
import { RecetaEditor } from "./receta-editor";

export type Tab = "datos" | "receta" | "preparacion" | "modificadores";

/**
 * /productos/[id] — the product's ficha: Datos · Receta · Preparación ·
 * Modificadores. The tab is local state (seeded from ?tab=) so switching is
 * instant; every save refreshes the server data underneath.
 */
export function Ficha({ ficha, tabInicial }: { ficha: ProductoFicha; tabInicial: Tab }) {
  const [tab, setTab] = React.useState<Tab>(tabInicial);
  const p = ficha.producto;
  const aplicados = ficha.grupos.filter((g) => g.aplicado).length;

  return (
    <div className="mx-auto w-full max-w-[880px] pb-28 desk:pb-10">
      <PageHeader
        back="/productos"
        title={p.name}
        sub={`${p.category_label ?? "Sin categoría"} · ${p.sku} · ${ficha.vendidas30} vendidos en 30 días`}
        actions={
          <>
            <FavoriteToggle productoId={p.id} initial={p.is_favorite} name={p.name} />
            {/* TODO(P4→P2): /pos reads ?buscar=<sku> to open the terminal filtered on this product. */}
            <a href={`/pos?buscar=${encodeURIComponent(p.sku)}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
              <MonitorSmartphone size={18} aria-hidden /> Ver en POS
            </a>
          </>
        }
      />

      <div className="px-4 sm:px-7 flex flex-col gap-5">
        <div className="flex items-center gap-4 bg-surface border border-line rounded-card p-4">
          <Thumb src={p.image_url} name={p.name} size={64} />
          <dl className="flex-1 grid grid-cols-3 gap-2 m-0">
            <div>
              <dt className="ui-label">Precio</dt>
              <dd className="m-0 ui-title ui-num">{pesos(p.price_cop)}</dd>
            </div>
            <div>
              <dt className="ui-label">Costo</dt>
              <dd className="m-0 ui-title ui-num">{pesos(p.cost_cop)}</dd>
            </div>
            <div>
              <dt className="ui-label">Margen</dt>
              <dd className="m-0">
                <MargenPill margen={p.margin_pct} price={p.price_cop} />
              </dd>
            </div>
          </dl>
        </div>

        <Segmented<Tab>
          block
          size="sm"
          label="Sección"
          value={tab}
          onChange={setTab}
          options={[
            { value: "datos", label: "Datos" },
            { value: "receta", label: "Receta", count: ficha.lineas.length },
            { value: "preparacion", label: "Preparación" },
            { value: "modificadores", label: aplicados ? `Modif. · ${aplicados}` : "Modif." },
          ]}
        />

        {tab === "datos" ? <DatosForm ficha={ficha} tieneReceta={ficha.lineas.length > 0} /> : null}
        {tab === "receta" ? <RecetaEditor ficha={ficha} /> : null}
        {tab === "preparacion" ? <PreparacionEditor productoId={p.id} initial={p.preparacion} /> : null}
        {tab === "modificadores" ? <ModificadoresTab ficha={ficha} /> : null}
      </div>
    </div>
  );
}
