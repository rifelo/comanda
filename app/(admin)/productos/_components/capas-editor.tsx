"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, toast } from "@/components/ui/feedback";
import { TextArea } from "@/components/ui/field";
import type { ProductoFicha } from "@/lib/db/recetas";
import {
  armarFicha,
  CAPAS,
  cuadreReceta,
  fmtCant,
  nombreCorto,
  OPERACIONES,
  parseFichaCapas,
  validarFichaCapas,
  type CapaDef,
  type CapaItem,
  type CapaKey,
  type FichaCapas,
  type GrupoDef,
  type Operacion,
} from "@/lib/recetas/capas";
import { guardarCapas } from "../receta-actions";

const inputCls = "h-11 rounded-btn border border-line bg-surface px-3 text-[15px] min-w-0";

/**
 * Ficha técnica por capas (0087): the 8 layers in their fixed order, each
 * with its items (recipe ingredient + amount for this layer, or free text with
 * its 16 oz version), operations and a verifiable note; consecutive layers can
 * be grouped under one operation («Licuar»). Explicit save; the POS shows it
 * on long-press and the text steps are regenerated from it.
 */
export function CapasEditor({ ficha }: { ficha: ProductoFicha }) {
  const router = useRouter();
  const p = ficha.producto;
  const ctx = ficha.ctxCapas;
  const inicial = React.useMemo(() => parseFichaCapas(p.capas) ?? { capas: [], grupos: [] }, [p.capas]);
  const [f, setF] = React.useState<FichaCapas>(inicial);
  const [visual, setVisual] = React.useState(p.referencia_visual);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(inicial) || visual.trim() !== p.referencia_visual.trim();

  const ings = React.useMemo(() => new Map(Object.entries(ctx.ings)), [ctx.ings]);
  const enReceta = Object.keys(ctx.receta);
  const otros = Object.keys(ctx.ings).filter((id) => !(id in ctx.receta)).sort((a, b) => ctx.ings[a].name.localeCompare(ctx.ings[b].name, "es"));
  const descuadres = cuadreReceta(f, new Map(Object.entries(ctx.receta)));
  const sinCapa = enReceta.filter((id) => !f.capas.some((c) => c.items.some((it) => it.ing === id)));
  const invalido = f.capas.length ? validarFichaCapas(f) : null;

  const capaDe = (k: CapaKey) => f.capas.find((c) => c.capa === k);
  const setCapa = (k: CapaKey, fn: (c: CapaDef) => CapaDef | null) =>
    setF((prev) => {
      const actual = prev.capas.find((c) => c.capa === k) ?? { capa: k, ops: [], items: [] };
      const nueva = fn(actual);
      const resto = prev.capas.filter((c) => c.capa !== k);
      const capas = nueva ? [...resto, nueva] : resto;
      capas.sort((a, b) => CAPAS.findIndex((x) => x.key === a.capa) - CAPAS.findIndex((x) => x.key === b.capa));
      return { ...prev, capas };
    });
  const setItem = (k: CapaKey, i: number, patch: Partial<CapaItem> | null) =>
    setCapa(k, (c) => ({ ...c, items: patch === null ? c.items.filter((_, j) => j !== i) : c.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const setGrupo = (i: number, patch: Partial<GrupoDef> | null) =>
    setF((prev) => ({ ...prev, grupos: patch === null ? prev.grupos.filter((_, j) => j !== i) : prev.grupos.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));

  async function save(clear = false) {
    setSaving(true);
    setError(null);
    const r = await guardarCapas({ producto_id: p.id, capas: clear || !f.capas.length ? null : f, referencia_visual: visual });
    setSaving(false);
    if ("error" in r) return setError(r.error);
    toast(clear ? "Ficha quitada" : r.descuadres ? "Ficha guardada · revisa las cantidades contra la receta" : "Ficha guardada", r.descuadres ? "brand" : "ok");
    router.refresh();
  }

  const vista = f.capas.length && !invalido ? armarFicha(f, ings, ctx.tam16, new Set(ctx.sustituibles)) : [];

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="late" onClose={() => setError(null)}>{error}</Banner> : null}
      <p className="m-0 ui-sub">
        Todas las bebidas siguen el mismo orden. Activa solo las capas que lleva esta bebida; el número de la capa se mantiene.
        {ctx.tam16 ? " La columna de 16 oz sale de la opción «16 oz»." : " Este producto no tiene la opción «16 oz»."}
      </p>

      <TextArea id="visual" label="Cómo se ve (referencia visual)" value={visual} onChange={(e) => setVisual(e.target.value)} rows={2} maxLength={300}
        placeholder="Vaso PET transparente, leche fría abajo, hielo en cubos, capa marmoleada de Milo, cold foam arriba, tapa plana y pitillo negro" />

      {CAPAS.map((def) => {
        const c = capaDe(def.key);
        return (
          <section key={def.key} className={`rounded-card border ${c ? "border-strong bg-surface" : "border-line bg-transparent"} p-4 flex flex-col gap-3`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="size-5" checked={!!c} onChange={(e) => setCapa(def.key, () => (e.target.checked ? { capa: def.key, ops: [], items: [] } : null))} />
              <span className="size-7 shrink-0 rounded-full bg-strong text-on-strong text-sm font-bold flex items-center justify-center ui-num">{def.n}</span>
              <span className="ui-title">{def.label}</span>
              {!c ? <span className="ui-sub">no aplica</span> : null}
            </label>
            {c ? (
              <>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Operaciones de ${def.label}`}>
                  {OPERACIONES.map((o) => {
                    const on = c.ops.includes(o.key);
                    return (
                      <button key={o.key} type="button" aria-pressed={on}
                        className={`h-9 px-3 rounded-full border text-sm font-semibold ${on ? "bg-strong text-on-strong border-strong" : "border-line"}`}
                        onClick={() => setCapa(def.key, (x) => ({ ...x, ops: on ? x.ops.filter((y) => y !== o.key) : [...x.ops, o.key as Operacion] }))}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {c.items.map((it, i) =>
                  it.ing !== undefined ? (
                    <div key={i} className="flex gap-2 items-center">
                      <select className={`${inputCls} flex-1`} value={it.ing} onChange={(e) => setItem(def.key, i, { ing: e.target.value })} aria-label="Insumo">
                        <option value="">Elige un insumo…</option>
                        <optgroup label="En la receta">
                          {enReceta.map((id) => <option key={id} value={id}>{nombreCorto(ctx.ings[id]?.name ?? id)} · receta {fmtCant(ctx.receta[id], ctx.ings[id]?.unit ?? "")}</option>)}
                        </optgroup>
                        <optgroup label="Otros insumos">
                          {otros.map((id) => <option key={id} value={id}>{ctx.ings[id].name}</option>)}
                        </optgroup>
                      </select>
                      <input className={`${inputCls} w-24 ui-num`} inputMode="decimal" aria-label="Cantidad 12 oz" value={it.qty ?? ""}
                        onChange={(e) => setItem(def.key, i, { qty: Number(e.target.value.replace(",", ".")) || undefined })} />
                      <span className="ui-sub w-12">{it.ing ? ctx.ings[it.ing]?.unit : ""}</span>
                      <button type="button" className="size-11 flex items-center justify-center" aria-label="Quitar línea" onClick={() => setItem(def.key, i, null)}><Trash2 size={18} /></button>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-2 items-center">
                      <input className={`${inputCls} flex-1`} placeholder="Agua caliente 30 ml" aria-label="Texto 12 oz" value={it.texto ?? ""} onChange={(e) => setItem(def.key, i, { texto: e.target.value })} />
                      <input className={`${inputCls} w-36`} placeholder="16 oz: 40 ml" aria-label="Texto 16 oz" value={it.texto16 ?? ""} onChange={(e) => setItem(def.key, i, { texto16: e.target.value || undefined })} />
                      <button type="button" className="size-11 flex items-center justify-center" aria-label="Quitar línea" onClick={() => setItem(def.key, i, null)}><Trash2 size={18} /></button>
                    </div>
                  ),
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => setCapa(def.key, (x) => ({ ...x, items: [...x.items, { ing: "", qty: undefined }] }))}><Plus size={16} aria-hidden /> Insumo</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCapa(def.key, (x) => ({ ...x, items: [...x.items, { texto: "" }] }))}><Plus size={16} aria-hidden /> Texto</Button>
                </div>
                <input className={inputCls} placeholder="Nota verificable (ej.: cubos enteros; 20–30 s hasta pico suave)" aria-label={`Nota de ${def.label}`} maxLength={300}
                  value={c.nota ?? ""} onChange={(e) => setCapa(def.key, (x) => ({ ...x, nota: e.target.value || undefined }))} />
              </>
            ) : null}
          </section>
        );
      })}

      <section className="rounded-card border border-line p-4 flex flex-col gap-3">
        <span className="ui-title">Operación en conjunto</span>
        <p className="m-0 ui-sub">Agrupa capas seguidas bajo una sola operación, por ejemplo «Licuar» de Base dulce a Carga.</p>
        {f.grupos.map((g, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <select className={inputCls} value={g.op} aria-label="Operación" onChange={(e) => setGrupo(i, { op: e.target.value as Operacion })}>
              {OPERACIONES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span className="ui-sub">de</span>
            <select className={inputCls} value={g.desde} aria-label="Desde" onChange={(e) => setGrupo(i, { desde: e.target.value as CapaKey })}>
              {CAPAS.map((c) => <option key={c.key} value={c.key}>{c.n}. {c.label}</option>)}
            </select>
            <span className="ui-sub">a</span>
            <select className={inputCls} value={g.hasta} aria-label="Hasta" onChange={(e) => setGrupo(i, { hasta: e.target.value as CapaKey })}>
              {CAPAS.map((c) => <option key={c.key} value={c.key}>{c.n}. {c.label}</option>)}
            </select>
            <input className={`${inputCls} flex-1`} placeholder="40 s, hasta que no queden trozos" aria-label="Nota del grupo" value={g.nota ?? ""} onChange={(e) => setGrupo(i, { nota: e.target.value || undefined })} />
            <button type="button" className="size-11 flex items-center justify-center" aria-label="Quitar grupo" onClick={() => setGrupo(i, null)}><Trash2 size={18} /></button>
          </div>
        ))}
        <div>
          <Button size="sm" variant="ghost" onClick={() => setF((prev) => ({ ...prev, grupos: [...prev.grupos, { desde: "base", hasta: "carga", op: "licuar" }] }))}><Plus size={16} aria-hidden /> Agrupar capas</Button>
        </div>
      </section>

      {invalido ? <Banner tone="brand">{invalido}</Banner> : null}
      {descuadres.length || (f.capas.length && sinCapa.length) ? (
        <Banner tone="brand">
          <div className="flex flex-col gap-1">
            <b>La ficha no cuadra con la receta</b>
            {descuadres.map((d) => (
              <span key={d.ing}>{nombreCorto(ctx.ings[d.ing]?.name ?? "Insumo")}: {fmtCant(d.enCapas, ctx.ings[d.ing]?.unit ?? "")} en las capas, {fmtCant(d.enReceta, ctx.ings[d.ing]?.unit ?? "")} en la receta</span>
            ))}
            {sinCapa.map((id) => <span key={id}>{nombreCorto(ctx.ings[id]?.name ?? id)} está en la receta pero en ninguna capa</span>)}
          </div>
        </Banner>
      ) : null}

      {vista.length ? (
        <div className="rounded-card border border-line p-4 flex flex-col gap-2" aria-label="Vista previa">
          <span className="ui-label">Vista previa (así la ve el barista)</span>
          {vista.map((b, i) => {
            const capas = b.tipo === "capa" ? [b.capa] : b.capas;
            return (
              <div key={i} className={b.tipo === "grupo" ? "border-2 border-line rounded-btn p-2" : ""}>
                {b.tipo === "grupo" ? <b className="block mb-1">{b.op}{b.nota ? ` · ${b.nota}` : ""}</b> : null}
                {capas.map((c) => (
                  <div key={c.key} className="flex gap-3 py-1 text-[15px]">
                    <span className="ui-num font-bold w-5">{c.n}</span>
                    <span className="w-32 shrink-0"><b>{c.label}</b>{c.ops.length ? <span className="ui-sub"> · {c.ops.join(" + ")}</span> : null}</span>
                    <span className="flex-1">{c.lineas.map((l) => `${l.texto}${l.t12 ? ` ${l.t12}` : ""}${l.t16 ? ` (16 oz: ${l.t16})` : ""}`).join(" + ")}{c.nota ? <span className="ui-sub"> — {c.nota}</span> : null}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="sticky bottom-3 z-10 flex gap-2">
        {inicial.capas.length ? <Button variant="ghost" onClick={() => save(true)} loading={saving}>Quitar ficha</Button> : null}
        <Button block onClick={() => save()} disabled={!dirty || !!invalido} loading={saving}>
          {dirty ? "Guardar ficha" : "Sin cambios"}
        </Button>
      </div>
    </div>
  );
}
