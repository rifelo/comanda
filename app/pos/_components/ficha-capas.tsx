"use client";

/**
 * Ficha técnica por capas (productos.capas, 0087) inside the recipe overlay:
 * one row per active layer in its fixed number (Vaso 1 … Cierre 8), its
 * operations, the 12 oz amounts, the 16 oz column and the verifiable note.
 * Grouped layers («Licuar») sit in one box under the group's operation.
 * Sizes live in pos.css (.fc-*), never inline.
 */
import type { BloqueVista, CapaVista } from "@/lib/recetas/capas";
import { money } from "./ticket";

function Fila({ c, con16 }: { c: CapaVista; con16: boolean }) {
  return (
    <div className={`fc-row${con16 ? " con16" : ""}`}>
      <span className="fc-n num">{c.n}</span>
      <div className="fc-capa">
        <b>{c.label}</b>
        {c.ops.length > 0 && <span className="fc-ops">{c.ops.join(" + ")}</span>}
      </div>
      <ul className={`fc-lin${con16 ? " con16" : ""}`}>
        {c.lineas.map((l, i) => (
          <li key={i}>
            <span className="fc-t">
              <span>{l.texto}{l.sustituible && <span className="muted"> (sustituible)</span>}</span>
              {l.t12 && <b className="num">{l.t12}</b>}
            </span>
            {con16 && <span className={`fc-16 num${l.t16 ? "" : " igual"}`}>{l.t16 || "igual"}</span>}
          </li>
        ))}
      </ul>
      <span className="fc-nota">{c.nota ?? ""}</span>
    </div>
  );
}

export function FichaCapasPos({ bloques, visual, price, price16 }: { bloques: BloqueVista[]; visual: string | null; price: number; price16: number | null }) {
  const con16 = bloques.some((b) => (b.tipo === "capa" ? [b.capa] : b.capas).some((c) => c.lineas.some((l) => l.t16)));
  return (
    <div className="fc">
      {(visual || price16 != null) && (
        <div className="fc-top">
          {visual && <p className="fc-visual"><span className="label">Cómo se ve</span> {visual}</p>}
          {price16 != null && (
            <span className="fc-precios num">12 oz {money(price)} · 16 oz {money(price16)}</span>
          )}
        </div>
      )}
      <div className={`fc-row fc-head${con16 ? " con16" : ""}`} aria-hidden>
        <span>#</span>
        <span>Capa</span>
        <span>{con16 ? "12 oz" : "Insumos"}</span>
        {con16 && <span>16 oz</span>}
        <span>Nota</span>
      </div>
      {bloques.map((b, i) =>
        b.tipo === "capa" ? (
          <Fila key={i} c={b.capa} con16={con16} />
        ) : (
          <div key={i} className="fc-grupo">
            <div className="fc-grupo-h"><b>{b.op}</b>{b.nota && <span> · {b.nota}</span>}</div>
            {b.capas.map((c) => <Fila key={c.key} c={c} con16={con16} />)}
          </div>
        ),
      )}
    </div>
  );
}
