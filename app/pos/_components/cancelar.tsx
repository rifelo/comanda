"use client";

/**
 * Cancelar.dc.html — over Pedidos. Why the order is cancelled (one reason is
 * required, the detail is optional), a red warning when money was already
 * taken (it must be handed back), and the way out for the usual case: just
 * fixing the order with Editar, which keeps its number and its payments.
 */
import * as React from "react";
import { CANCEL_REASONS, type CancelReason, type PayMethodId, type PosOrder } from "@/lib/pos/types";
import { folioTag } from "@/lib/pos/pending";
import { cancelPending, editPending, posStore } from "../pos-store";
import { IconClose, methodWord, money, orderName, paidOf } from "./ordenes";

/** Escape closes the overlay on top, not the page under it (the root listens on window, bubbling). */
export function useEscape(onEscape: () => void) {
  const ref = React.useRef(onEscape);
  React.useEffect(() => { ref.current = onEscape; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** «2 × Cappuccino, 1 × Pastel de pollo». */
const itemsLine = (o: PosOrder) => o.items.map((it) => `${it.qty} × ${it.name}`).join(", ");

/** «efectivo» · «efectivo y transferencia». */
function paidWith(o: PosOrder): string {
  const methods = [...new Set(o.pagos.map((p) => p.method))] as PayMethodId[];
  if (!methods.length) return methodWord(o.paymentMethod);
  const words = methods.map((m) => methodWord(m));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} y ${words[words.length - 1]}` : words[0];
}

export function CancelarOverlay({ o, onClose }: { o: PosOrder; onClose: () => void }) {
  const [reason, setReason] = React.useState<CancelReason | null>(null);
  const [detail, setDetail] = React.useState("");
  useEscape(onClose);
  const name = orderName(o);
  const paid = paidOf(o);
  const how = paidWith(o);
  const canEdit = o.status === "pendiente" && !o.local;

  const confirm = () => {
    if (!reason) return;
    const d = detail.trim();
    onClose();
    void cancelPending(o.id, d ? `${reason}: ${d}` : reason);
  };
  const edit = () => {
    const s = posStore.get();
    if (s.order.length && !s.pending && !window.confirm("Se perderá el pedido actual. ¿Continuar?")) return;
    onClose();
    editPending(o);
  };

  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="cx" style={{ maxWidth: 680, maxHeight: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="grow">
            <h2 id="cx" className="h1">Cancelar el pedido {folioTag(o.folio)}</h2>
            <span className="muted" style={{ fontSize: 15 }}>{[name, itemsLine(o), money(o.total)].filter(Boolean).join(" · ")}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose /></button>
        </div>

        {paid > 0 && (
          <div role="alert" style={{ background: "var(--late-soft)", color: "var(--late)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 600 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18.5v.5" /></svg>
            <span className="grow">
              Ya se pagaron {money(paid)}{how ? ` en ${how}` : ""}. Al cancelar, devuélvele ese dinero {name ? `a ${name}` : "al cliente"}.
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">¿Por qué se cancela?</span>
          <div className="chips" role="group" aria-label="Motivo">
            {CANCEL_REASONS.map((r) => (
              <button key={r} type="button" className="chip reason" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Detalle (opcional)</span>
          <input className="field" type="text" value={detail} maxLength={140} onChange={(e) => setDetail(e.target.value)} placeholder="Ej.: pidió latte, no cappuccino" style={{ height: 48 }} />
        </label>

        {canEdit && (
          <div className="cx-edit" style={{ background: "var(--surface-2)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span className="grow" style={{ fontSize: 15 }}><b>¿Solo hay que corregirlo?</b> <span className="muted">Editar conserva el número y lo pagado.</span></span>
            <button type="button" className="btn ghost sm" onClick={edit}>Editar en vez de cancelar</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn ghost lg" onClick={onClose} style={{ flex: 1 }}>Volver</button>
          <button type="button" className="btn danger lg" onClick={confirm} disabled={!reason} style={{ flex: 1 }}>Cancelar pedido</button>
        </div>
      </section>
    </div>
  );
}
