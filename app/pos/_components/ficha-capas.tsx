"use client";

/**
 * The recipe overlay's ficha técnica, laid out like the Claude Design «Ficha
 * técnica · Latte frío»: one row per layer, read from the bottom up (Cierre 8
 * on top, Vaso 1 at the bottom, «Se prepara de abajo hacia arriba»), with the
 * layer's operations, one line per item in 12 oz, the 16 oz column and the
 * verifiable note; blended layers carry a «Licuar» tag.
 *
 * A drink with productos.capas (0087) shows its layers; one without them is
 * laid out from its recipe, the same way the comanda prints it
 * (capasDesdeReceta), with the 16 oz column from the «16 oz» option.
 * Sizes live in pos.css (.fc-*), never inline.
 */
import type { PosMenuItem, PosModGroup } from "@/lib/pos/types";
import { capasDesdeReceta, conOpciones, limpio } from "@/lib/printer/ticket";
import { money } from "./ticket";

export interface FilaFicha {
  n: number;
  capa: string;
  ops: string[];
  /** «Licuar» when the layer is blended together with others. */
  grupo: string | null;
  lineas: { texto: string; t12: string; t16: string; sustituible: boolean }[];
  nota: string | null;
}

const ES_16 = /^16\s*oz$/i;

/** Rows of the ficha for a product, bottom layer first; [] when there is nothing to show. */
export function filasFicha(p: PosMenuItem, modGroups: Readonly<Record<string, PosModGroup>>): FilaFicha[] {
  if (p.capas?.length) {
    return p.capas.flatMap((b) =>
      (b.tipo === "capa" ? [b.capa] : b.capas).map((c) => ({
        n: c.n,
        capa: c.label,
        ops: c.ops,
        grupo: b.tipo === "grupo" ? b.op : null,
        lineas: c.lineas.map((l) => ({ texto: l.texto, t12: l.t12, t16: l.t16.replace(/\s*\(× [\d,]+\)$/, ""), sustituible: l.sustituible })),
        nota: c.nota,
      })),
    );
  }
  if (!p.printsLabel || !p.recipe.length) return [];
  const opts = p.mods.flatMap((gid) => modGroups[gid]?.options ?? []);
  const o16 = opts.find((o) => ES_16.test(o.name.trim()));
  const sustituibles = new Set(
    opts.filter((o) => !ES_16.test(o.name.trim())).flatMap((o) => (o.recipe ?? []).filter((x) => x.reemplaza && x.reemplaza !== x.name).map((x) => limpio(x.reemplaza!))),
  );
  const base = capasDesdeReceta(p.recipe);
  const grande = o16 ? capasDesdeReceta(conOpciones(p.recipe, [{ opcion: o16.name, recipe: o16.recipe ?? [] }])) : null;
  return base.map((c) => {
    const c16 = grande?.find((x) => x.n === c.n);
    return {
      n: c.n,
      capa: c.capa,
      ops: c.ops ? c.ops.split(" + ") : [],
      grupo: c.grupo ? "Licuar" : null,
      lineas: c.lineas.map((l, i) => {
        const g = c16?.lineas[i];
        const texto16 = g ? g.texto.replace(/ · 16 oz$/, "") : "";
        const t16 = !g ? "" : texto16 !== l.texto ? limpio(texto16) : g.cantidad !== l.cantidad ? g.cantidad ?? "" : "";
        return { texto: l.texto, t12: l.cantidad ?? "", t16, sustituible: [...sustituibles].some((s) => l.texto.startsWith(s)) };
      }),
      nota: c.nota ?? null,
    };
  });
}

export function FichaCapasPos({ filas, visual, price, price16 }: { filas: FilaFicha[]; visual: string | null; price: number; price16: number | null }) {
  const con16 = price16 != null || filas.some((f) => f.lineas.some((l) => l.t16));
  const deArriba = [...filas].reverse();
  return (
    <div className="fc">
      {(visual || price16 != null) && (
        <div className="fc-top">
          {visual && <p className="fc-visual"><span className="label">Cómo se ve</span> {visual}</p>}
          {price16 != null && (
            <div className="fc-precios">
              <span className="fc-precio"><span className="label">12 oz</span><b className="num">{money(price)}</b></span>
              <span className="fc-precio"><span className="label">16 oz</span><b className="num">{money(price16)}</b></span>
            </div>
          )}
        </div>
      )}
      <div className="fc-tabla" role="table" aria-label="Capas de preparación, de arriba (cierre) a abajo (vaso)">
        <div className={`fc-row fc-head${con16 ? " con16" : ""}`} role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Capa</span>
          <span role="columnheader">{con16 ? "12 oz" : "Insumos"}</span>
          {con16 && <span role="columnheader">16 oz</span>}
          <span role="columnheader">Nota verificable</span>
        </div>
        {deArriba.map((c) => (
          <div key={c.n} className={`fc-row${con16 ? " con16" : ""}`} role="row">
            <span className="fc-n num" role="cell">{c.n}</span>
            <div className="fc-capa" role="cell">
              <b>{c.capa}</b>
              <span className="fc-chips">
                {c.ops.length > 0 && <span className="fc-op">{c.ops.join(" + ")}</span>}
                {c.grupo && <span className="fc-grupo-tag">{c.grupo}</span>}
              </span>
            </div>
            <ul className="fc-lin" role="cell">
              {c.lineas.map((l, i) => (
                <li key={i}>
                  <span>{l.texto}{l.sustituible && <span className="muted"> (sustituible)</span>}</span>
                  {l.t12 && <b className="num">{l.t12}</b>}
                </li>
              ))}
            </ul>
            {con16 && (
              <ul className="fc-lin fc-16" role="cell">
                {c.lineas.map((l, i) => (
                  <li key={i} className={l.t16 ? "" : "igual"}><span className="num">{l.t16 || "="}</span></li>
                ))}
              </ul>
            )}
            <span className="fc-nota" role="cell">{c.nota ?? ""}</span>
          </div>
        ))}
      </div>
      <p className="fc-pie">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20V4" /><path d="M5 11l7-7 7 7" /></svg>
        Se prepara de abajo hacia arriba: empieza en la capa 1{con16 ? " · «=» en 16 oz: igual que en 12 oz" : ""}
      </p>
    </div>
  );
}
