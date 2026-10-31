"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2, X } from "lucide-react";
import type { ProductoFicha } from "@/lib/db/recetas";
import { lineTotal, MARGEN_MIN, resumenReceta } from "@/lib/cost";
import { opcionesReceta } from "@/lib/inventario/existencias";
import { Button, IconButton } from "@/components/ui/button";
import { Banner, EmptyState, toast } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { addRecetaItem, duplicarReceta, removeRecetaItem, updateRecetaItemQty } from "../receta-actions";
import { cantidad, MargenPill, pesos, Select } from "./bits";
import { pasoDe, QtyInput } from "./qty-input";

type Linea = ProductoFicha["lineas"][number];

/**
 * The recipe, editable in place: quantity per line (saved by itself a moment
 * after the last change), remove, add from a search that shows recent / most
 * used ingredients first, «Duplicar receta de…». Cost and margin are
 * recomputed live from the local quantities (lib/cost `resumenReceta`).
 */
export function RecetaEditor({ ficha }: { ficha: ProductoFicha }) {
  const router = useRouter();
  const { producto } = ficha;
  const [qtys, setQtys] = React.useState<Record<string, number>>(() => Object.fromEntries(ficha.lineas.map((l) => [l.id, l.qty])));
  const [saving, setSaving] = React.useState<Record<string, "saving" | "saved" | "error">>({});
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Lines added/removed on the server (after refresh): keep local edits, add new ids.
  const [prevLineas, setPrevLineas] = React.useState(ficha.lineas);
  if (prevLineas !== ficha.lineas) {
    setPrevLineas(ficha.lineas);
    setQtys((q) => Object.fromEntries(ficha.lineas.map((l) => [l.id, q[l.id] ?? l.qty])));
  }

  React.useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const resumen = resumenReceta(
    ficha.lineas.map((l) => ({ qty: qtys[l.id] ?? l.qty, cost_cop: l.cost_cop })),
    producto.price_cop,
  );

  function cambiar(l: Linea, n: number) {
    setQtys((q) => ({ ...q, [l.id]: n }));
    clearTimeout(timers.current[l.id]);
    timers.current[l.id] = setTimeout(async () => {
      setSaving((s) => ({ ...s, [l.id]: "saving" }));
      const r = await updateRecetaItemQty({ item_id: l.id, qty: n });
      if (r && "error" in r && r.error) {
        setSaving((s) => ({ ...s, [l.id]: "error" }));
        setError(r.error);
        return;
      }
      setSaving((s) => ({ ...s, [l.id]: "saved" }));
      router.refresh();
    }, 700);
  }

  async function quitar(l: Linea) {
    setRemoving(l.id);
    const r = await removeRecetaItem({ item_id: l.id });
    setRemoving(null);
    if (r && "error" in r && r.error) return setError(r.error);
    toast(`${l.name} quitado de la receta`);
    router.refresh();
  }

  const usados = new Set(ficha.lineas.map((l) => l.ingrediente_id));

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Banner tone="late" onClose={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      {ficha.lineas.length === 0 ? (
        <EmptyState
          title="Este producto no tiene receta"
          text="Sin receta no descuenta inventario y su margen es el que se escribió a mano. Añade los insumos o copia la receta de otro producto."
        />
      ) : (
        <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden" data-testid="receta-lineas">
          {ficha.lineas.map((l) => {
            const q = qtys[l.id] ?? l.qty;
            const st = saving[l.id];
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-line last:border-b-0 min-h-[76px]">
                <div className="flex-1 min-w-[160px]">
                  <Link href={`/inventario/${l.ingrediente_id}`} className="ui-title text-text no-underline hover:underline">
                    {l.name}
                  </Link>
                  <div className="ui-sub flex flex-wrap items-center gap-x-2">
                    <span className="ui-num">
                      {pesos(l.cost_cop, { unit: true })} / {l.unit}
                    </span>
                    {l.cost_cop <= 0 ? <Pill tone="late">sin costo</Pill> : null}
                    {l.stock <= 0 ? <Pill tone="late">sin stock</Pill> : null}
                    {st === "saving" ? <span>Guardando…</span> : st === "saved" ? <span className="text-ok">Guardado</span> : st === "error" ? <span className="text-late">No se guardó</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <QtyInput value={q} onChange={(n) => cambiar(l, n)} unit={l.unit} label={`Cantidad de ${l.name}`} />
                  <span className="w-9 ui-sub">{l.unit}</span>
                </div>
                <span className="w-[84px] text-right ui-title ui-num">{pesos(lineTotal(q, l.cost_cop))}</span>
                <IconButton label={`Quitar ${l.name}`} size="sm" onClick={() => quitar(l)} disabled={removing === l.id}>
                  <Trash2 size={18} aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      <AgregarInsumo ficha={ficha} usados={usados} onError={setError} />

      {ficha.otras.length ? <Duplicar ficha={ficha} onError={setError} /> : null}

      {/* Live total: sticky at the bottom of the phone, above the tab bar. */}
      <div className="sticky bottom-3 z-10">
        <div className="bg-surface border border-line rounded-card shadow-[var(--shadow-1)] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1" data-testid="receta-resumen" aria-live="polite">
          <div>
            <div className="ui-label">Costo</div>
            <div className="ui-title ui-num" data-testid="receta-costo">
              {pesos(resumen.costo)}
            </div>
          </div>
          <div>
            <div className="ui-label">Precio</div>
            <div className="ui-title ui-num">{pesos(producto.price_cop)}</div>
          </div>
          <div>
            <div className="ui-label">Margen</div>
            <div data-testid="receta-margen">
              <MargenPill margen={resumen.margen} price={producto.price_cop} />
            </div>
          </div>
          <div>
            <div className="ui-label">Ganas</div>
            <div className="ui-title ui-num">{pesos(resumen.utilidad)}</div>
          </div>
          {!resumen.ok && resumen.costo > 0 ? (
            <p className="ui-sub m-0 basis-full">
              Para llegar a {MARGEN_MIN} %: precio de {pesos(resumen.precioSugerido)} o bajar el costo a {pesos(Math.floor(producto.price_cop * (1 - MARGEN_MIN / 100)))}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgregarInsumo({ ficha, usados, onError }: { ficha: ProductoFicha; usados: Set<string>; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<ProductoFicha["ingredientes"][number] | null>(null);
  const [qty, setQty] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const usos = React.useMemo(() => new Map(Object.entries(ficha.usos)), [ficha.usos]);
  const opciones = opcionesReceta(ficha.ingredientes, { q, excluir: usados, recientes: ficha.recientes, usos, limite: 10 });

  function elegir(o: ProductoFicha["ingredientes"][number]) {
    setSel(o);
    setQty(pasoDe(o.unit) === 5 ? 10 : 1);
  }

  async function add() {
    if (!sel) return;
    onError(null);
    setAdding(true);
    const r = await addRecetaItem({ producto_id: ficha.producto.id, ingrediente_id: sel.id, qty });
    setAdding(false);
    if (r && "error" in r && r.error) return onError(r.error);
    toast(`${sel.name} añadido`, "ok");
    setSel(null);
    setQ("");
    router.refresh();
  }

  return (
    <section aria-labelledby="add-h" className="bg-surface border border-line rounded-card p-4 flex flex-col gap-3">
      <h3 id="add-h" className="ui-title m-0">
        Añadir insumo
      </h3>
      {sel ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="add-insumo-qty">
          <div className="flex-1 min-w-[150px]">
            <div className="ui-title">{sel.name}</div>
            <div className="ui-sub ui-num">
              {pesos(sel.cost_cop, { unit: true })} / {sel.unit} · hay {cantidad(sel.stock)} {sel.unit}
            </div>
          </div>
          <QtyInput value={qty} onChange={setQty} unit={sel.unit} label={`Cantidad de ${sel.name}`} />
          <span className="ui-sub">{sel.unit}</span>
          <div className="flex gap-2 basis-full sm:basis-auto">
            <Button variant="ghost" size="sm" onClick={() => setSel(null)} icon={<X size={18} aria-hidden />}>
              Otro
            </Button>
            <Button size="sm" onClick={add} loading={adding} icon={<Plus size={18} aria-hidden />}>
              Añadir · {pesos(lineTotal(qty, sel.cost_cop))}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <SearchField value={q} onChange={setQ} placeholder="Buscar insumo (leche, vaso, café…)" label="Buscar insumo" />
          <div>
            {!q ? <p className="ui-label m-0 mb-2">Recientes y más usados</p> : null}
            {opciones.length === 0 ? (
              <p className="ui-sub m-0">{q ? `Ningún insumo con «${q}». Créalo en Inventario.` : "Busca un insumo por su nombre."}</p>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="add-insumo-opciones">
                {opciones.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => elegir(o)}
                    className="min-h-11 px-3.5 py-2 rounded-btn border border-line bg-surface text-text text-[15px] font-semibold cursor-pointer hover:bg-surface-2 text-left"
                  >
                    {o.name} <span className="text-muted font-normal">· {o.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Duplicar({ ficha, onError }: { ficha: ProductoFicha; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [origen, setOrigen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function copiar() {
    if (!origen) return;
    onError(null);
    setBusy(true);
    const r = await duplicarReceta({ producto_id: ficha.producto.id, origen_id: origen });
    setBusy(false);
    if ("error" in r) return onError(r.error);
    toast(r.added ? `${r.added} insumo${r.added === 1 ? "" : "s"} copiado${r.added === 1 ? "" : "s"}` : "Ya tenía todos esos insumos", r.added ? "ok" : "neutral");
    setOrigen("");
    router.refresh();
  }
  return (
    <section aria-label="Duplicar receta" className="flex flex-wrap items-end gap-3">
      <Select id="dup-origen" label="Duplicar receta de…" value={origen} onChange={(e) => setOrigen(e.target.value)} className="flex-1 min-w-[220px]">
        <option value="">Elige un producto</option>
        {ficha.otras.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.lineas.length})
          </option>
        ))}
      </Select>
      <Button variant="ghost" onClick={copiar} disabled={!origen} loading={busy} icon={<Copy size={18} aria-hidden />}>
        Copiar insumos
      </Button>
    </section>
  );
}
