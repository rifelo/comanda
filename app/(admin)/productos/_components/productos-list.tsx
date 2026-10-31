"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Tags } from "lucide-react";
import type { ProductoListRow, ProductosView } from "@/lib/db/productos";
import type { CostosPendientes } from "@/lib/db/costos-pendientes";
import { MARGEN_MIN } from "@/lib/cost";
import { normalizar } from "@/lib/inventario/acabando";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { PageHeader } from "@/components/ui/top-bar";
import { MargenPill, pesos, Thumb } from "./bits";
import { CategoriasSheet } from "./categorias-sheet";
import { CostosPanel } from "./costos-panel";
import { FavoriteToggle } from "./favorite-toggle";
import { NuevoProductoSheet } from "./nuevo-producto-sheet";

export type Filtro = "todos" | "recetas" | "sin-receta" | "revisar" | "favoritos";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "recetas", label: "Con receta" },
  { value: "sin-receta", label: "Sin receta" },
  { value: "revisar", label: `Bajo ${MARGEN_MIN} %` },
  { value: "favoritos", label: "★ Favoritos" },
];

function pasa(p: ProductoListRow, f: Filtro): boolean {
  if (f === "recetas") return p.lineas > 0;
  if (f === "sin-receta") return p.lineas === 0;
  if (f === "revisar") return p.price_cop <= 0 || (p.lineas > 0 && p.margin_pct < MARGEN_MIN);
  if (f === "favoritos") return p.is_favorite;
  return true;
}

/**
 * /productos — one searchable list replacing Catálogo + Recetas: price,
 * recipe cost, margin against the 55 % rule, the recipe's stock state and ★.
 * Search first; categories as a sideways-scrolling chip row.
 */
export function ProductosList({ view, costos, filtroInicial }: { view: ProductosView; costos: CostosPendientes; filtroInicial: Filtro }) {
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<string>("todas");
  const [filtro, setFiltro] = React.useState<Filtro>(filtroInicial);
  const [nuevo, setNuevo] = React.useState(false);
  const [cats, setCats] = React.useState(false);

  const lista = React.useMemo(() => {
    const nq = normalizar(q);
    return view.productos.filter((p) => {
      if (nq) return normalizar(p.name).includes(nq) || normalizar(p.sku).includes(nq) || normalizar(p.category_label ?? "").includes(nq);
      if (cat !== "todas" && (cat === "sin" ? p.category_id !== null : p.root_category_id !== cat)) return false;
      return pasa(p, filtro);
    });
  }, [view.productos, q, cat, filtro]);

  const sinCategoria = view.productos.filter((p) => !p.category_id).length;

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-28 desk:pb-10">
      <PageHeader
        title="Productos"
        sub={`${view.productos.length} productos · ${view.productos.filter((p) => p.lineas > 0).length} con receta`}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Tags size={18} aria-hidden />} onClick={() => setCats(true)}>
              Categorías
            </Button>
            <Button size="sm" icon={<Plus size={18} aria-hidden />} onClick={() => setNuevo(true)} className="hidden sm:inline-flex">
              Nuevo producto
            </Button>
          </>
        }
      />

      <div className="px-4 sm:px-7 flex flex-col gap-4">
        <SearchField value={q} onChange={setQ} placeholder="Buscar producto o SKU" label="Buscar producto" />

        <div className="ui-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <div role="group" aria-label="Categoría" className="flex gap-2 w-max">
            <Chip pressed={cat === "todas"} onClick={() => setCat("todas")}>
              Todas
            </Chip>
            {view.categorias.map((c) => (
              <Chip key={c.id} pressed={cat === c.id} onClick={() => setCat(c.id)}>
                {c.label} <span className="ui-num opacity-70">{c.count}</span>
              </Chip>
            ))}
            {sinCategoria ? (
              <Chip pressed={cat === "sin"} onClick={() => setCat("sin")}>
                Sin categoría <span className="ui-num opacity-70">{sinCategoria}</span>
              </Chip>
            ) : null}
          </div>
        </div>

        <div className="ui-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <div role="group" aria-label="Mostrar" className="inline-flex bg-surface-2 rounded-btn p-1 gap-1 w-max">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filtro === f.value}
                onClick={() => setFiltro(f.value)}
                className={
                  "h-10 min-h-10 px-3.5 rounded-[9px] border-0 text-sm font-semibold cursor-pointer whitespace-nowrap " +
                  (filtro === f.value ? "bg-surface text-text shadow-[var(--shadow-1)]" : "bg-transparent text-muted hover:text-text")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <CostosPanel c={costos} />

        {lista.length === 0 ? (
          <EmptyState
            title={q ? `Nada con «${q}»` : "No hay productos aquí"}
            text={q ? "Prueba con otra palabra o el SKU." : "Cambia el filtro o crea uno nuevo."}
            action={
              <Button size="sm" onClick={() => setNuevo(true)}>
                Nuevo producto
              </Button>
            }
          />
        ) : (
          <div className="bg-surface border border-line rounded-card overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_110px_110px_90px_44px] gap-3 px-5 py-2.5 border-b border-line ui-label">
              <span>Producto</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Margen</span>
              <span className="sr-only">Favorito</span>
            </div>
            <ul className="m-0 p-0 list-none" data-testid="productos-lista">
              {lista.map((p) => (
                <ProductoFila key={p.id} p={p} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Phone: the primary action sits above the tab bar. */}
      <div className="sm:hidden fixed left-4 right-4 bottom-[calc(var(--h-tabs)+env(safe-area-inset-bottom)+12px)] z-20">
        <Button block icon={<Plus size={20} aria-hidden />} onClick={() => setNuevo(true)}>
          Nuevo producto
        </Button>
      </div>

      {nuevo ? <NuevoProductoSheet open onClose={() => setNuevo(false)} hojas={view.hojas} productos={view.productos} /> : null}
      {cats ? <CategoriasSheet open onClose={() => setCats(false)} todas={view.todas} /> : null}
    </div>
  );
}

function ProductoFila({ p }: { p: ProductoListRow }) {
  const meta = [p.category_label ?? "Sin categoría", p.sku].join(" · ");
  return (
    <li className="flex items-center gap-2 border-b border-line last:border-b-0 hover:bg-surface-2/60">
      <Link
        href={`/productos/${p.id}`}
        className="flex-1 min-w-0 flex items-center gap-3 min-h-[76px] pl-4 sm:pl-5 py-2.5 text-text no-underline md:grid md:grid-cols-[minmax(0,1fr)_110px_110px_90px] md:gap-3"
      >
        <span className="flex-1 min-w-0 flex items-center gap-3">
          <Thumb src={p.image_url} name={p.name} />
          <span className="min-w-0">
            <span className="ui-title block truncate">{p.name}</span>
            <span className="ui-sub block truncate">{meta}</span>
            <span className="flex flex-wrap gap-1.5 mt-1 empty:hidden">
              {p.lineas === 0 ? <Pill>Sin receta</Pill> : null}
              {p.stock === "sin" ? (
                <Pill tone="late" className="max-w-full truncate">
                  Sin stock: {p.falta}
                </Pill>
              ) : p.stock === "bajo" ? (
                <Pill tone="brand" className="max-w-full truncate">
                  Poco: {p.falta}
                </Pill>
              ) : null}
            </span>
          </span>
        </span>
        {/* Phone: price + margin stacked on the right. */}
        <span className="md:hidden shrink-0 text-right flex flex-col items-end gap-1">
          <span className="ui-title ui-num">{pesos(p.price_cop)}</span>
          {p.lineas > 0 || p.price_cop <= 0 ? <MargenPill margen={p.margin_pct} price={p.price_cop} /> : null}
        </span>
        <span className="hidden md:block text-right ui-title ui-num">{pesos(p.price_cop)}</span>
        <span className="hidden md:block text-right ui-num text-muted">{p.lineas > 0 ? pesos(p.cost_cop) : "—"}</span>
        <span className="hidden md:flex justify-end">{p.lineas > 0 || p.price_cop <= 0 ? <MargenPill margen={p.margin_pct} price={p.price_cop} /> : <span className="text-muted">—</span>}</span>
      </Link>
      <span className="pr-2 sm:pr-3">
        <FavoriteToggle productoId={p.id} initial={p.is_favorite} name={p.name} />
      </span>
    </li>
  );
}
