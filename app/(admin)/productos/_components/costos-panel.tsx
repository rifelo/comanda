"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MARGEN_MIN, totalPendientes, type CostosPendientes } from "@/lib/db/costos-pendientes";
import { CountBadge } from "@/components/ui/pill";
import { cantidad, pesos } from "./bits";

/**
 * «Costos por revisar» on /productos: the reasons a margin can't be trusted
 * yet (ingredients without cost, products at price 0 or under 55 %, products
 * without recipe). Collapsed to one line; each item links to where it's fixed.
 */
export function CostosPanel({ c }: { c: CostosPendientes }) {
  const n = totalPendientes(c) - c.negativos.length;
  const [open, setOpen] = React.useState(false);
  if (n === 0 && c.sinReceta.length === 0) {
    return <p className="ui-sub m-0">Costos al día: ningún insumo sin costo ni producto bajo {MARGEN_MIN} %.</p>;
  }
  const parts = [
    c.bajoMargen.length ? `${c.bajoMargen.length} bajo ${MARGEN_MIN} %` : null,
    c.sinCosto.length ? `${c.sinCosto.length} insumo${c.sinCosto.length === 1 ? "" : "s"} sin costo` : null,
    c.precioCero.length ? `${c.precioCero.length} a precio 0` : null,
    c.sinReceta.length ? `${c.sinReceta.length} sin receta` : null,
  ].filter(Boolean);

  const li = "flex items-center justify-between gap-3 min-h-11 py-1.5 border-b border-line last:border-b-0 text-[15px]";
  const link = "text-text font-semibold no-underline hover:underline min-w-0 truncate";
  return (
    <section aria-labelledby="costos-h" className="bg-surface border border-line rounded-card" data-testid="costos-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 min-h-[64px] px-4 sm:px-5 py-3 bg-transparent border-0 text-left text-text cursor-pointer"
      >
        <span className="flex-1 min-w-0">
          <span id="costos-h" className="ui-title flex items-center gap-2">
            Costos por revisar {n > 0 ? <CountBadge value={n} /> : null}
          </span>
          <span className="ui-sub block mt-0.5 truncate">{parts.join(" · ")}</span>
        </span>
        {open ? <ChevronUp size={20} aria-hidden className="text-muted" /> : <ChevronDown size={20} aria-hidden className="text-muted" />}
      </button>
      {open ? (
        <div className="grid gap-5 px-4 sm:px-5 pb-5 md:grid-cols-2">
          {c.bajoMargen.length ? (
            <div>
              <h3 className="ui-label m-0 mb-1">Bajo {MARGEN_MIN} % de margen</h3>
              <ul className="m-0 p-0 list-none">
                {c.bajoMargen.map((p) => (
                  <li key={p.id} className={li}>
                    <Link href={`/productos/${p.id}?tab=receta`} className={link}>
                      {p.name}
                    </Link>
                    <span className="ui-num text-late whitespace-nowrap">
                      {p.margin_pct} % · {pesos(p.cost_cop)} de {pesos(p.price_cop)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.sinCosto.length ? (
            <div>
              <h3 className="ui-label m-0 mb-1">Insumos sin costo (usados en recetas)</h3>
              <ul className="m-0 p-0 list-none">
                {c.sinCosto.map((i) => (
                  <li key={i.id} className={li}>
                    <Link href={`/inventario/${i.id}`} className={link}>
                      {i.name}
                    </Link>
                    <span className="ui-sub whitespace-nowrap">
                      {i.recetas} receta{i.recetas === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="ui-sub m-0 mt-2">Ponles precio en Inventario: sus recetas se recalculan solas.</p>
            </div>
          ) : null}
          {c.precioCero.length ? (
            <div>
              <h3 className="ui-label m-0 mb-1">A precio 0</h3>
              <ul className="m-0 p-0 list-none">
                {c.precioCero.map((p) => (
                  <li key={p.id} className={li}>
                    <Link href={`/productos/${p.id}`} className={link}>
                      {p.name}
                    </Link>
                    <span className="ui-sub">{p.sku}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.sinReceta.length ? (
            <div>
              <h3 className="ui-label m-0 mb-1">Sin receta (no descuentan inventario)</h3>
              <ul className="m-0 p-0 list-none">
                {c.sinReceta.map((p) => (
                  <li key={p.id} className={li}>
                    <Link href={`/productos/${p.id}?tab=receta`} className={link}>
                      {p.name}
                    </Link>
                    <span className="ui-sub">{p.sku}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.negativos.length ? (
            <p className="ui-sub m-0 md:col-span-2">
              Además hay {cantidad(c.negativos.length)} insumo{c.negativos.length === 1 ? "" : "s"} en negativo:{" "}
              <Link href="/inventario" className="text-text font-semibold">
                corrígelos en Inventario
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
