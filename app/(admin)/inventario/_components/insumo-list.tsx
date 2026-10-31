"use client";

import * as React from "react";
import Link from "next/link";
import type { Ingrediente } from "@/lib/types";
import { filaInsumo, filtrarInsumos, ordenarFilas, zonasConConteo, type FilaInsumo } from "@/lib/inventario/existencias";
import type { ZonaAcabando } from "@/lib/inventario/acabando";
import { presentacion } from "@/lib/inventario/acabando";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

type Extra = "todos" | "negativo" | "poco" | "sin-costo";

const NIVEL_TONE = { verde: "ok", amarillo: "brand", rojo: "late" } as const;
const NIVEL_TXT = { verde: "Hay", amarillo: "Poco", rojo: "Se acabó" } as const;

/**
 * Searchable list of insumos (search first), grouped by the zones the
 * tablet walks, each with stock in pieces, level and «Corregir».
 */
export function InsumoList({ ingredientes, categoriaDe, onCorregir }: { ingredientes: Ingrediente[]; categoriaDe: (id: string | null) => string; onCorregir: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const [zona, setZona] = React.useState<ZonaAcabando | "todas">("todas");
  const [extra, setExtra] = React.useState<Extra>("todos");

  const filas = React.useMemo(() => ingredientes.map((i) => filaInsumo({ ...i, stock_critico: i.stock_critico ?? 0 })), [ingredientes]);
  const zonas = React.useMemo(() => zonasConConteo(filas), [filas]);
  const visibles = React.useMemo(() => {
    const base = filtrarInsumos(filas, { q, zona, categoria: categoriaDe });
    const porExtra = q
      ? base
      : base.filter((f) => (extra === "negativo" ? f.negativo : extra === "poco" ? f.nivel !== "verde" : extra === "sin-costo" ? Number(f.item.cost_cop) <= 0 : true));
    return ordenarFilas(porExtra);
  }, [filas, q, zona, extra, categoriaDe]);

  // Group by zone when showing every zone without a search.
  const grupos = React.useMemo(() => {
    if (q || zona !== "todas") return [{ zona: null as ZonaAcabando | null, filas: visibles }];
    const m = new Map<ZonaAcabando, FilaInsumo<Ingrediente>[]>();
    for (const f of visibles) m.set(f.zona, [...(m.get(f.zona) ?? []), f]);
    return zonas.filter((z) => m.has(z.zona)).map((z) => ({ zona: z.zona as ZonaAcabando | null, filas: m.get(z.zona)! }));
  }, [visibles, zonas, q, zona]);

  const n = {
    negativo: filas.filter((f) => f.negativo).length,
    poco: filas.filter((f) => f.nivel !== "verde").length,
    sinCosto: filas.filter((f) => Number(f.item.cost_cop) <= 0).length,
  };

  return (
    <section aria-labelledby="lista-h" className="flex flex-col gap-3">
      <h2 id="lista-h" className="ui-h2 m-0">
        Insumos <span className="ui-num text-muted font-semibold text-[17px]">· {ingredientes.length}</span>
      </h2>
      <SearchField value={q} onChange={setQ} placeholder="Buscar insumo o categoría" label="Buscar insumo" />

      <div className="ui-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
        <div role="group" aria-label="Zona" className="flex gap-2 w-max">
          <Chip pressed={zona === "todas"} onClick={() => setZona("todas")}>
            Todas
          </Chip>
          {zonas.map((z) => (
            <Chip key={z.zona} pressed={zona === z.zona} onClick={() => setZona(z.zona)}>
              {z.zona} <span className="ui-num opacity-70">{z.n}</span>
            </Chip>
          ))}
        </div>
      </div>
      <div className="ui-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
        <div role="group" aria-label="Mostrar" className="inline-flex bg-surface-2 rounded-btn p-1 gap-1 w-max">
          {(
            [
              ["todos", "Todos", null],
              ["negativo", "En negativo", n.negativo],
              ["poco", "Poco o nada", n.poco],
              ["sin-costo", "Sin costo", n.sinCosto],
            ] as const
          ).map(([v, label, count]) => (
            <button
              key={v}
              type="button"
              aria-pressed={extra === v}
              onClick={() => setExtra(v)}
              className={cn(
                "h-10 min-h-10 px-3.5 rounded-[9px] border-0 text-sm font-semibold cursor-pointer whitespace-nowrap",
                extra === v ? "bg-surface text-text shadow-[var(--shadow-1)]" : "bg-transparent text-muted hover:text-text",
              )}
            >
              {label}
              {count != null ? <span className="ui-num"> · {count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState title={q ? `Nada con «${q}»` : "Nada en esta vista"} text={q ? "Prueba otra palabra o crea el insumo." : "Cambia la zona o el filtro."} />
      ) : (
        <div className="flex flex-col gap-4" data-testid="insumos-lista">
          {grupos.map((g) => (
            <div key={g.zona ?? "all"} className="flex flex-col gap-2">
              {g.zona ? (
                <h3 className="ui-label m-0 px-1">
                  {g.zona} · {g.filas.length}
                </h3>
              ) : null}
              <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
                {g.filas.map((f) => (
                  <li key={f.item.id} className="flex items-center gap-3 pr-3 sm:pr-4 border-b border-line last:border-b-0 hover:bg-surface-2/60">
                    <Link href={`/inventario/${f.item.id}`} className="flex-1 min-w-0 flex items-center gap-3 min-h-[76px] pl-4 sm:pl-5 py-2 text-text no-underline">
                      <span className="flex-1 min-w-0">
                        <span className="ui-title block truncate">{f.item.name}</span>
                        <span className="ui-sub block truncate">
                          {presentacion(f.item)}
                          {g.zona ? "" : ` · ${f.zona}`}
                          {Number(f.item.cost_cop) <= 0 ? " · sin costo" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right flex flex-col items-end gap-1">
                        <span className={cn("ui-title ui-num", f.negativo && "text-late")}>{f.stock}</span>
                        <Pill tone={NIVEL_TONE[f.nivel]}>{f.negativo ? "Negativo" : NIVEL_TXT[f.nivel]}</Pill>
                      </span>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => onCorregir(f.item.id)} aria-label={`Corregir ${f.item.name}`}>
                      Corregir
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
