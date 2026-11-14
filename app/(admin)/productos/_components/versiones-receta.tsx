"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Banner, toast } from "@/components/ui/feedback";
import type { ProductoFicha } from "@/lib/db/recetas";
import { armarFicha, fmtCant, nombreCorto, parseFichaCapas } from "@/lib/recetas/capas";
import { pesos } from "./bits";
import { borrarVersionReceta, crearVersionReceta, usarVersionReceta } from "../receta-actions";

/**
 * Versiones de receta (0088): v1, v2… of this product. The one in use is the
 * live recipe (edited in Receta / Ficha técnica); another one can be looked
 * at and put in use with one tap — recipe, ficha and price switch together.
 */
export function VersionesReceta({ ficha }: { ficha: ProductoFicha }) {
  const router = useRouter();
  const p = ficha.producto;
  const [abierta, setAbierta] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const costoDe = React.useMemo(() => new Map(ficha.ingredientes.map((i) => [i.id, i.cost_cop])), [ficha.ingredientes]);
  const ings = React.useMemo(() => new Map(Object.entries(ficha.ctxCapas.ings)), [ficha.ctxCapas.ings]);

  const enUso = ficha.versionEnUso;
  const versiones = ficha.versiones;
  const siguiente = `v${versiones.length ? versiones.length + 1 : 2}`;

  async function run(fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>, msg: string) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if ("error" in r) return setError(r.error);
    toast(msg, "ok");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 bg-surface border border-line rounded-card p-4">
      {error ? <Banner tone="late" onClose={() => setError(null)}>{error}</Banner> : null}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="ui-label mr-1">Versiones de receta</span>
        {versiones.length === 0 ? <span className="ui-sub">Solo la receta de siempre.</span> : null}
        {versiones.map((v) => {
          const uso = v.id === enUso;
          return (
            <button key={v.id} type="button" aria-pressed={abierta === v.id}
              className={`h-9 px-3 rounded-full border-2 text-sm font-bold ${uso ? "bg-strong text-on-strong border-strong" : "border-line"}`}
              onClick={() => setAbierta(abierta === v.id ? null : v.id)}>
              {v.nombre}{uso ? " · en uso" : ""}
            </button>
          );
        })}
        <span className="grow" />
        <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => crearVersionReceta({ producto_id: p.id, nombre: siguiente }), `Versión ${siguiente} creada`)}>
          Nueva versión ({siguiente})
        </Button>
      </div>

      {versiones.filter((v) => v.id === abierta).map((v) => {
        const uso = v.id === enUso;
        const costo = Math.round(v.items.reduce((s, i) => s + i.qty * (costoDe.get(i.ingrediente_id) ?? 0), 0));
        const precio = v.price_cop ?? p.price_cop;
        const margen = precio > 0 ? Math.round(((precio - costo) / precio) * 100) : 0;
        const capas = parseFichaCapas(v.capas);
        const vista = capas ? armarFicha(capas, ings, ficha.ctxCapas.tam16, new Set(ficha.ctxCapas.sustituibles)) : [];
        return (
          <div key={v.id} className="flex flex-col gap-3 border-t border-line pt-3">
            {uso ? (
              <p className="m-0 ui-sub">Es la receta en uso: se edita en las pestañas Receta y Ficha técnica.</p>
            ) : (
              <>
                <div className="flex gap-6 flex-wrap">
                  <span><span className="ui-label">Precio</span> <b className="ui-num">{pesos(precio)}</b></span>
                  <span><span className="ui-label">Costo</span> <b className="ui-num">{pesos(costo)}</b></span>
                  <span><span className="ui-label">Margen</span> <b className="ui-num">{margen} %</b></span>
                </div>
                {v.nota ? <p className="m-0 ui-sub">{v.nota}</p> : null}
                <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-[15px]">
                  {v.items.map((i, n) => (
                    <li key={n} className="flex justify-between gap-3">
                      <span>{nombreCorto(ficha.ctxCapas.ings[i.ingrediente_id]?.name ?? "Insumo archivado")}{i.note ? <span className="ui-sub"> · {i.note}</span> : null}</span>
                      <b className="ui-num">{fmtCant(i.qty, ficha.ctxCapas.ings[i.ingrediente_id]?.unit ?? i.unit ?? "")}</b>
                    </li>
                  ))}
                </ul>
                {vista.length ? (
                  <div className="flex flex-col gap-1 text-[14px]">
                    <span className="ui-label">Ficha técnica</span>
                    {vista.flatMap((b) => (b.tipo === "capa" ? [b.capa] : b.capas)).map((c) => (
                      <div key={c.key} className="flex gap-2">
                        <b className="ui-num w-4">{c.n}</b>
                        <span className="w-28 shrink-0"><b>{c.label}</b>{c.ops.length ? <span className="ui-sub"> · {c.ops.join(" + ")}</span> : null}</span>
                        <span className="flex-1">{c.lineas.map((l) => `${l.texto}${l.t12 ? ` ${l.t12}` : ""}`).join(" + ")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2 flex-wrap">
                  <Button loading={busy} onClick={() => run(() => usarVersionReceta({ producto_id: p.id, version_id: v.id }), `Ahora se usa la receta ${v.nombre}`)}>
                    Usar la receta {v.nombre}
                  </Button>
                  <Button variant="ghost" loading={busy} onClick={() => { if (window.confirm(`¿Borrar la versión ${v.nombre}?`)) void run(() => borrarVersionReceta({ producto_id: p.id, version_id: v.id }), `Versión ${v.nombre} borrada`); }}>
                    Borrar
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
