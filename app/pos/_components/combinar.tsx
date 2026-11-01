"use client";

/**
 * Combinar.dc.html — over Pedidos. Pick two or more open orders; they fold
 * into the oldest number (lines, people and payments move; labels already
 * printed are not printed again). Only unpaid orders can be combined — the
 * database function (combinar_ordenes) takes pendiente orders only — so paid
 * ones and orders still in this register's queue are shown, disabled, with why.
 */
import * as React from "react";
import type { PosOrder } from "@/lib/pos/types";
import { folioTag } from "@/lib/pos/pending";
import { mergePreview } from "@/lib/pos/combinar";
import { usePos, queuedOrders, cancelMerge, confirmMerge, toggleCombinar } from "../pos-store";
import { IconClose, money, orderName, owed } from "./ordenes";
import { useEscape } from "./cancelar";

/** «2 × Cappuccino, Pastel de pollo». */
const itemsShort = (o: PosOrder) => o.items.map((it) => (it.qty > 1 ? `${it.qty} × ${it.name}` : it.name)).join(", ");

function stateOf(o: PosOrder): string {
  if (o.local) return "Aún no llega al servidor";
  if (o.status === "pagada") return "Pagado";
  if (o.porVerificar === "transferencia" && !o.paid) return "Transferencia por verificar";
  if (o.paid > 0) return `Falta por cobrar ${money(owed(o))}`;
  return "Sin pagar";
}

export function CombinarOverlay() {
  const s = usePos();
  useEscape(() => { if (!s.merge.busy) cancelMerge(); });
  const rows = [...queuedOrders(s), ...s.pendientes];
  const can = (o: PosOrder) => !o.local && o.status === "pendiente";
  const picked = s.pendientes.filter((o) => s.merge.sel.includes(o.id) && can(o));
  const target = picked.find((o) => o.id === s.merge.target) ?? null;
  const sources = picked.filter((o) => o.id !== target?.id);
  const pv = target ? mergePreview(target, sources) : null;
  const porVerificar = picked.filter((o) => o.porVerificar === "transferencia").reduce((n, o) => n + owed(o), 0);
  const ready = picked.length >= 2 && !!target && !s.merge.busy;
  const disabledWhy = rows.some((o) => !can(o));

  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget && !s.merge.busy) cancelMerge(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="cb" style={{ maxWidth: 720, maxHeight: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="grow">
            <h2 id="cb" className="h1">Combinar pedidos</h2>
            <span className="muted" style={{ fontSize: 15 }}>Elige dos o más pedidos abiertos. Quedan en el número más antiguo.</span>
          </div>
          <button type="button" className="icon-btn" onClick={cancelMerge} aria-label="Cerrar" disabled={s.merge.busy}><IconClose /></button>
        </div>

        <div role="group" aria-label="Pedidos abiertos" className="scroll" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flexShrink: 1 }}>
          {!rows.length && <p className="muted" style={{ fontSize: 15 }}>No hay pedidos abiertos.</p>}
          {rows.map((o) => {
            const on = can(o) && s.merge.sel.includes(o.id);
            const name = orderName(o);
            return (
              <button
                key={o.id}
                type="button"
                className="opt"
                role="checkbox"
                aria-checked={on}
                aria-disabled={!can(o)}
                disabled={!can(o) || s.merge.busy}
                onClick={() => toggleCombinar(o.id)}
                style={{ minHeight: 68, flexShrink: 0, ...(can(o) ? {} : { opacity: 0.55, cursor: "not-allowed" }) }}
              >
                <span className="box">{on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                <span className="grow">
                  <span style={{ display: "block" }}>{folioTag(o.folio)} · {name || "Sin nombre"}</span>
                  <span className="muted" style={{ display: "block", fontSize: 14, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemsShort(o)} · {stateOf(o)}</span>
                </span>
                <span className="num">{money(o.total)}</span>
              </button>
            );
          })}
        </div>
        {disabledWhy && <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>Los pedidos ya pagados, o que aún no llegan al servidor, no se pueden combinar.</p>}

        {target && pv && picked.length >= 2 && (
          <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <span className="grow" style={{ fontSize: 15 }}>
              <b>Quedará {folioTag(target.folio)} · {pv.people.length > 1 ? pv.people.join(", ") : orderName(target) || pv.people[0] || "Sin nombre"}</b>
              <span className="muted" style={{ display: "block", marginTop: 2 }}>
                {[
                  `${pv.items} ${pv.items === 1 ? "ítem" : "ítems"}`,
                  pv.paid > 0 ? `${money(pv.paid)} ya pagados` : null,
                  porVerificar > 0 ? `${money(porVerificar)} por verificar` : null,
                  "las etiquetas ya impresas no se repiten",
                ].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="amount" style={{ fontSize: 28 }}>{money(pv.total)}</span>
          </div>
        )}
        {s.merge.error && <div role="alert" style={{ color: "var(--late)", fontSize: 15, fontWeight: 600 }}>{s.merge.error}</div>}

        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          <button type="button" className="btn ghost lg" onClick={cancelMerge} disabled={s.merge.busy} style={{ flex: 1 }}>Volver</button>
          <button type="button" className="btn lg" onClick={() => void confirmMerge()} disabled={!ready} style={{ flex: 2 }}>
            {s.merge.busy ? "Combinando…" : target && picked.length >= 2 ? `Combinar en ${folioTag(target.folio)}` : "Elige dos o más"}
          </button>
        </div>
      </section>
    </div>
  );
}
