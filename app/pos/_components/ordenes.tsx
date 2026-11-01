"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Chip, Chips, Sheet } from "@/components/ui";
import { posMoney, CANCEL_REASONS, type CancelReason, type PosOrder, type OrdersTab } from "@/lib/pos/types";
import { mergePreview } from "@/lib/pos/combinar";
import { usePos, queuedOrders, LOCAL_ORDER, dropOutbox, chargePendingSplit, startMerge, cancelMerge, toggleMergeSel, setMergeTarget, setMergeConfirming, confirmMerge, orderShares, closeOrdenes, setOrdenesTab, marcarEntregada, setOrdenesDay, refreshOrdenes, selectOrden, printLabelFor, editPending, chargePending, cancelPending, PAY_METHODS } from "../pos-store";
import { timeAgo, bogotaDay, shiftDay, dayLabel, bogotaTime } from "@/lib/pos/pending";
import { usePrinter, relaysLabels } from "@/lib/printer/serial";
import { C, F, H, Overlay } from "./theme";
import { ORDER_TYPES } from "./ticket";

// ════════════════════════════════════════════════════════════════
// Pedidos — Square-style cards: open queue + per-day history
// ════════════════════════════════════════════════════════════════
export const ORDER_TABS: { id: OrdersTab; label: string }[] = [
  { id: "pendiente", label: "Pendientes" },
  { id: "completada", label: "Completados" },
  { id: "cancelada", label: "Canceladas" },
  { id: "todas", label: "Todas" },
];
export const STATUS_UI: Record<PosOrder["status"], { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: C.amber },
  pagada: { label: "Pagada", color: C.green },
  cancelada: { label: "Cancelada", color: C.muted },
};
/** Human label for a payment method, including the "mixto" summary. */
export const methodLabel = (m: string | null | undefined): string =>
  m === "mixto" ? "Mixto" : PAY_METHODS.find((x) => x.id === m)?.label ?? (m ?? "");

export function PedidosPage() {
  const s = usePos();
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(() => { tick(); if (document.visibilityState === "visible") void refreshOrdenes(); }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const today = bogotaDay();
  // The pending queue has no day; the history tabs do.
  const isPend = s.ordenesTab === "pendiente";
  // Orders still in this register's queue (offline) are listed first, next to the server's.
  const queued = queuedOrders(s).filter(
    // A queued order isn't delivered yet, so it is never «completada».
    (o) => (s.ordenesTab === "todas" || (isPend ? true : s.ordenesTab === "cancelada" && o.status === "cancelada")) && (isPend || bogotaDay(Date.parse(o.createdAt)) === s.ordenesDay),
  );
  const list = [...queued, ...s.ordenes];
  // Cards in the queue not yet checked green.
  const sinEntregar = isPend ? list.filter((o) => !o.local && o.status !== "cancelada" && !o.entregadaAt).length : 0;
  const sel = s.ordenSel ? list.find((o) => o.id === s.ordenSel) ?? null : null;
  const total = list.filter((o) => o.status === "pagada").reduce((n, o) => n + o.total, 0);

  return (
    <Overlay align="fill">
      <div role="region" aria-label="Pedidos" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {/* One row; on a narrow screen the tabs and the day drop to a second one (POS_CSS). */}
        <div className="pos-hdr pos-ord-hdr">
          <button type="button" onClick={closeOrdenes} className="pos-hbtn"><ArrowLeft size={20} aria-hidden /> Volver</button>
          <span style={{ ...H, fontSize: 22 }}>Pedidos</span>
          <span aria-hidden className="pos-ord-break" />
          <div role="tablist" className="pos-ord-tabs pos-scroll" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 12, background: C.paperDk, overflowX: "auto" }}>
            {ORDER_TABS.map((t) => {
              const on = s.ordenesTab === t.id;
              const n = t.id === "pendiente"
                ? s.pendientes.length + s.outbox.length
                : 0;
              return (
                <button key={t.id} role="tab" aria-selected={on} onClick={() => setOrdenesTab(t.id)} style={{ height: 40, padding: "0 14px", borderRadius: 9, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: "none", background: on ? C.paperLt : "transparent", color: on ? C.ink : C.muted, boxShadow: on ? "var(--shadow-1)" : "none", fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {t.label}
                  {n > 0 && <span className="pos-badge">{n}</span>}
                </button>
              );
            })}
          </div>
          {!isPend && (
            <div className="pos-ord-day">
              <button onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, -1))} aria-label="Día anterior" style={dayBtn}>◀</button>
              <span style={{ fontSize: 14, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{dayLabel(s.ordenesDay, today)}</span>
              <button onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, 1))} disabled={s.ordenesDay >= today} aria-label="Día siguiente" style={{ ...dayBtn, opacity: s.ordenesDay >= today ? 0.35 : 1 }}>▶</button>
              {s.ordenesDay !== today && <button onClick={() => setOrdenesDay(today)} style={{ ...dayBtn, width: "auto", padding: "0 10px", fontSize: 13 }}>Hoy</button>}
            </div>
          )}
          {isPend && s.merge.on && (
            <span className="pos-ord-hint" style={{ fontSize: 13, color: C.ink }}>Elige dos o más pedidos para combinarlos.</span>
          )}
          <div className="pos-ord-right" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>
            {isPend && !s.merge.on && s.ordenes.filter((o) => o.status === "pendiente").length >= 2 && (
              <button type="button" onClick={startMerge} className="pos-hbtn">Combinar</button>
            )}
            {isPend && s.merge.on && (
              <button onClick={cancelMerge} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            )}
            {isPend && sinEntregar > 0 && <span style={{ color: C.amber, fontWeight: 700 }}><span className="cmd-num">{sinEntregar}</span> por entregar</span>}
            {!isPend && total > 0 && <span>Ventas <span className="cmd-num" style={{ color: C.ink }}>{posMoney(total)}</span></span>}
            <span className="cmd-num">{list.length} pedido{list.length === 1 ? "" : "s"}</span>
            <button onClick={() => void refreshOrdenes()} aria-label="Actualizar" title="Actualizar" style={dayBtn}>{s.ordenesLoading ? "…" : "↻"}</button>
          </div>
        </div>

        <div className="pos-ord-body">
          <div className="pos-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
            {s.ordenesError && <div role="alert" style={{ color: C.red, fontSize: 14, marginBottom: 12 }}>{s.ordenesError}</div>}
            {!list.length && !s.ordenesError && (
              <div style={{ padding: "64px 24px", textAlign: "center", color: C.muted, fontSize: 15, lineHeight: 1.7 }}>
                {s.ordenesLoading ? "Cargando…" : isPend ? <>Todo completado ✓<br />Aquí queda cada pedido hasta que esté pagado y entregado.</> : "Sin pedidos ese día."}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, paddingBottom: s.merge.on ? 90 : 0 }}>
              {list.map((o) => (
                <OrdenCard key={o.id} o={o} inQueue={isPend} selected={s.merge.on ? s.merge.sel.includes(o.id) : o.id === s.ordenSel} merging={s.merge.on} isTarget={s.merge.on && s.merge.target === o.id} />
              ))}
            </div>
          </div>
          {sel && !s.merge.on && <OrdenDetail o={sel} />}
        </div>
        {isPend && s.merge.on && <MergeBar />}
        {isPend && s.merge.on && s.merge.confirming && <MergeConfirm />}
      </div>
    </Overlay>
  );
}

/** Sticky footer while combining: how many are picked, which one receives them, and Continuar. */
export function MergeBar() {
  const s = usePos();
  const picked = s.ordenes.filter((o) => s.merge.sel.includes(o.id));
  const target = picked.find((o) => o.id === s.merge.target) ?? null;
  const ready = picked.length >= 2 && !!target;
  return (
    <div role="region" aria-label="Combinar pedidos" style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px", background: C.paperLt, borderTop: `1px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>
        {picked.length < 2
          ? `${picked.length} de 2 pedidos elegidos`
          : <>Combinar {picked.length} pedidos en <span className="cmd-num">{target?.folio}</span></>}
      </span>
      {picked.length >= 2 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted }}>
          Destino:
          {picked.map((o) => (
            <button key={o.id} onClick={() => setMergeTarget(o.id)} aria-pressed={o.id === s.merge.target} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: `1.5px solid ${o.id === s.merge.target ? C.ink : C.rule}`, background: o.id === s.merge.target ? C.ink : "transparent", color: o.id === s.merge.target ? C.paperLt : C.ink2, fontFamily: F.mono, fontSize: 13, cursor: "pointer" }} className="cmd-num">{o.folio}</button>
          ))}
        </span>
      )}
      {s.merge.error && <span role="alert" style={{ fontSize: 14, color: C.red }}>{s.merge.error}</span>}
      <button className="cmd-btn" onClick={() => setMergeConfirming(true)} disabled={!ready} style={{ marginLeft: "auto", height: 48, padding: "0 20px", fontSize: 15, opacity: ready ? 1 : 0.45 }}>Continuar</button>
    </div>
  );
}

/** What the combined order will be — folios, names, total, what is still owed — then Confirmar. */
export function MergeConfirm() {
  const s = usePos();
  const picked = s.ordenes.filter((o) => s.merge.sel.includes(o.id));
  const target = picked.find((o) => o.id === s.merge.target);
  if (!target) return null;
  const sources = picked.filter((o) => o.id !== target.id);
  const pv = mergePreview(target, sources);
  const close = () => setMergeConfirming(false);
  return (
    <Overlay onClose={close} align="center">
      <div role="dialog" aria-modal aria-label="Confirmar combinación" style={{ width: "min(560px, 94vw)", background: C.paperLt, border: `1px solid ${C.rule}`, borderRadius: 16, boxShadow: "var(--shadow-2)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "88dvh" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 12, color: C.muted }}>Combinar pedidos</div>
          <div style={{ ...H, fontSize: 24, lineHeight: 1.1, marginTop: 2 }}>{pv.sourceFolios.join(" + ")} → <span style={{ color: C.red }}>{pv.targetFolio}</span></div>
          <div style={{ fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>Los productos y pagos de {pv.sourceFolios.join(" y ")} pasan a {pv.targetFolio}, que conserva su número. Los otros quedan como «Combinado». El inventario no cambia.</div>
        </div>
        <div className="pos-scroll" style={{ padding: "12px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
          {[target, ...sources].map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
              <span style={{ minWidth: 0 }}>
                <span className="cmd-num" style={{ fontWeight: 700 }}>{o.folio}</span>
                <span style={{ color: C.muted }}> · {o.customerName || (o.customerNames.length ? o.customerNames.join(" · ") : "sin nombre")}</span>
                <span style={{ display: "block", fontSize: 13, color: C.ink2 }}>{o.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}</span>
              </span>
              <span className="cmd-num" style={{ flexShrink: 0 }}>{posMoney(o.total)}{o.paid > 0 ? <span style={{ display: "block", fontSize: 12, color: C.green }}>pagado {posMoney(o.paid)}</span> : null}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6, fontSize: 14 }}>
            <span style={{ color: C.muted }}>Personas</span>
            <span style={{ textAlign: "right" }}>{pv.people.length ? pv.people.join(" · ") : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
            <span style={{ color: C.muted }}>Ítems</span><span className="cmd-num">{pv.items}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 13, color: C.ink2 }}>TOTAL</span>
            <span className="cmd-num" style={{ ...H, fontSize: 28 }}>{posMoney(pv.total)}</span>
          </div>
          {pv.paid > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ color: C.muted }}>Pagado {posMoney(pv.paid)}</span><span className="cmd-num" style={{ color: C.amber, fontWeight: 700 }}>falta {posMoney(pv.remaining)}</span>
            </div>
          )}
          {s.merge.error && <div role="alert" style={{ fontSize: 14, color: C.red, border: `1px solid ${C.red}`, padding: "8px 10px", borderRadius: 10 }}>{s.merge.error}</div>}
        </div>
        <div style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 20px 16px", display: "flex", gap: 10 }}>
          <button onClick={close} disabled={s.merge.busy} style={{ height: 48, padding: "0 16px", borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 14, cursor: "pointer" }}>Volver</button>
          <button className="cmd-btn brand" onClick={() => void confirmMerge()} disabled={s.merge.busy} style={{ flex: 1, height: 48, fontSize: 15 }}>{s.merge.busy ? "Combinando…" : "Confirmar combinación"}</button>
        </div>
      </div>
    </Overlay>
  );
}

export const dayBtn: React.CSSProperties = { width: "max(36px, var(--pos-x))", height: "max(36px, var(--pos-x))", flexShrink: 0, borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

/** Badge of an order still in this register's queue. */
export const LOCAL_UI = {
  sending: { label: "Enviando…", color: C.muted },
  offline: { label: "Sin enviar", color: C.amber },
  failed: { label: "Error al enviar", color: C.red },
} as const;

export function OrdenCard({ o, selected, inQueue = false, merging = false, isTarget = false }: { o: PosOrder; selected: boolean; inQueue?: boolean; merging?: boolean; isTarget?: boolean }) {
  const completed = o.status === "pagada" && !!o.entregadaAt;
  const st = o.mergedInto ? { label: "Combinado", color: C.muted } : completed && !inQueue ? { label: "Completado", color: C.green } : STATUS_UI[o.status];
  // Only unpaid orders can be combined; a queued one not until the server has it.
  if (merging && (o.local || o.status !== "pendiente")) return null;
  const type = ORDER_TYPES.find((t) => t.id === o.orderType)?.label ?? o.orderType;
  const count = o.items.reduce((n, it) => n + it.qty, 0);
  // The delivery check (a sibling of the card button, never inside it): every
  // live card in the queue — it stays after the tap so a wrong one can be undone
  // — and, in the history, the ones still to deliver.
  const strip = !merging && !o.local && o.status !== "cancelada" && (inQueue || !o.entregadaAt);
  const done = strip && !!o.entregadaAt;
  return (
    <div className="pos-card" style={{ display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden", border: `${done ? 2.5 : 1.5}px solid ${selected ? C.ink : done ? C.green : C.rule}`, boxShadow: selected ? `0 0 0 2px ${C.ink}` : "none", background: done ? "color-mix(in srgb, var(--green) 10%, var(--paper-lt))" : C.paperLt, opacity: o.status === "cancelada" ? 0.6 : 1 }}>
    <button
      onClick={() => (merging ? toggleMergeSel(o.id) : selectOrden(o.id))}
      aria-pressed={selected}
      aria-label={`Pedido ${o.folio}`}
      style={{ flex: 1, textAlign: "left", padding: "12px 14px", cursor: "pointer", border: "none", background: "transparent", color: C.ink, fontFamily: F.mono, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {merging && <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, border: `1px solid ${C.rule}`, background: selected ? C.ink : "transparent", color: C.paperLt, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{selected ? "✓" : ""}</span>}
          <span className="cmd-num" style={{ ...H, fontSize: 24, lineHeight: 1, whiteSpace: "nowrap" }}>{o.folio}</span>
        </span>
        {isTarget
          ? <span style={{ fontSize: 11, fontWeight: 700, color: C.paperLt, background: C.red, padding: "2px 6px", borderRadius: 10 }}>Destino</span>
          : <span style={{ fontSize: 11, fontWeight: 700, color: st.color, border: `1px solid ${st.color}`, padding: "2px 6px", borderRadius: 10 }}>{st.label}{o.mergedIntoFolio ? <span className="cmd-num"> → {o.mergedIntoFolio}</span> : null}</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customerName || "—"}</div>
      <div style={{ fontSize: 13, color: C.muted }}>
        {type} · <span className="cmd-num">{count}</span> ítem{count === 1 ? "" : "s"} · {o.status === "pendiente" ? timeAgo(o.createdAt) : bogotaTime(o.createdAt)}
      </div>
      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {o.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}
      </div>
      <div className="cmd-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{posMoney(o.total)}</div>
      {o.local && (
        <div style={{ fontSize: 12, fontWeight: 700, color: LOCAL_UI[o.local].color }}>{LOCAL_UI[o.local].label} · en esta caja</div>
      )}
      {o.status === "pendiente" && o.paid > 0 && (
        <div style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>Pagado <span className="cmd-num">{posMoney(o.paid)}</span> · falta <span className="cmd-num">{posMoney(o.total - o.paid)}</span></div>
      )}
    </button>
    {strip && <EntregaStrip o={o} />}
    </div>
  );
}

/**
 * The check at the bottom of a pending card: an empty box until the order is
 * handed over, then green with ✓ and the time. Tapping again undoes.
 */
export function EntregaStrip({ o }: { o: PosOrder }) {
  const done = !!o.entregadaAt;
  return (
    <button
      onClick={() => void marcarEntregada(o.id, !done)}
      aria-pressed={done}
      aria-label={done ? `${o.folio} entregado · deshacer` : `Marcar ${o.folio} entregado`}
      style={{ height: "max(44px, var(--pos-x))", width: "100%", border: "none", borderTop: `1.5px solid ${done ? C.green : C.rule}`, background: done ? C.green : "transparent", color: done ? "#fff" : C.ink2, fontFamily: F.mono, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
    >
      <span aria-hidden style={{ width: 22, height: 22, borderRadius: 10, border: `2px solid ${done ? "#fff" : C.ink2}`, background: done ? "#fff" : "transparent", color: C.green, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>{done ? "✓" : ""}</span>
      {done ? <>Entregado <span className="cmd-num" style={{ fontWeight: 500 }}>{bogotaTime(o.entregadaAt!)}</span></> : "Entregado"}
    </button>
  );
}

export function OrdenDetail({ o }: { o: PosOrder }) {
  const s = usePos();
  const p = usePrinter();
  const st = STATUS_UI[o.status];
  const type = ORDER_TYPES.find((t) => t.id === o.orderType)?.label ?? o.orderType;
  const method = o.paymentMethod ? methodLabel(o.paymentMethod) : null;
  const remaining = Math.max(0, o.total - o.paid);
  const shares = orderShares(o);
  const [canceling, setCanceling] = React.useState(false);
  // Loading something into the ticket discards what's there — ask first.
  const guard = () => !s.order.length || !!s.pending || window.confirm("Se perderá el pedido actual. ¿Continuar?");
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, padding: "5px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
      <span style={{ color: C.ink, textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div role="complementary" aria-label={`Detalle ${o.folio}`} className="pos-ord-detail">
      <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="cmd-num" style={{ ...H, fontSize: 34, lineHeight: 1, whiteSpace: "nowrap" }}>{o.folio}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: st.color, border: `1px solid ${st.color}`, padding: "3px 7px", borderRadius: 10 }}>{st.label}</span>
          <button onClick={() => selectOrden(null)} aria-label="Cerrar detalle" style={{ marginLeft: "auto", width: "max(32px, var(--pos-x))", height: "max(32px, var(--pos-x))", border: `1px solid ${C.rule}`, borderRadius: 10, background: "transparent", color: C.ink, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{o.customerName || (o.customerNames.length ? "Mesa" : "Sin nombre")}</div>
        {o.customerNames.length > 0 && (
          <div style={{ fontSize: 13, color: C.ink2, marginTop: 3, lineHeight: 1.5 }}>{o.customerNames.join(" · ")}</div>
        )}
      </div>
      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
        {row("Tipo", type)}
        {row("Enviado", `${bogotaTime(o.createdAt)} · ${timeAgo(o.createdAt)}`)}
        {o.paidAt && row("Pagado", bogotaTime(o.paidAt))}
        {!o.local && o.status !== "cancelada" && row("Entrega", o.entregadaAt ? <span style={{ color: C.green, fontWeight: 700 }}>Entregado · {bogotaTime(o.entregadaAt)}</span> : <span style={{ color: C.amber, fontWeight: 700 }}>Por entregar</span>)}
        {o.pagos.length === 0 && method && row("Pago", method)}
        {o.pagos.map((pg) => (
          <React.Fragment key={pg.id}>
            {row(
              `Pago · ${pg.customer ?? "Mesa"}`,
              <>{methodLabel(pg.method)} · <span className="cmd-num">{posMoney(pg.amount)}</span>{pg.tendered !== null && pg.change > 0 ? <> · cambio <span className="cmd-num" style={{ color: C.green }}>{posMoney(pg.change)}</span></> : null} · {bogotaTime(pg.createdAt)}</>,
            )}
          </React.Fragment>
        ))}
        {o.status === "pendiente" && o.paid > 0 && row("Falta por cobrar", <span className="cmd-num" style={{ color: C.amber, fontWeight: 700 }}>{posMoney(remaining)}</span>)}
        {o.pagos.length === 0 && o.paymentMethod === "efectivo" && o.tendered !== null && row("Recibido / cambio", <><span className="cmd-num">{posMoney(o.tendered)}</span> / <span className="cmd-num" style={{ color: C.green }}>{posMoney(o.change)}</span></>)}
        {o.mergedInto && row("Combinado en", <span className="cmd-num">{o.mergedIntoFolio ?? "otro pedido"}</span>)}
        {o.sinGluten && row("Nota", "Sin gluten")}
        {o.note && row("Nota", o.note)}
        <div style={{ marginTop: 12 }}>
          {o.items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.ruleSoft}`, fontSize: 14 }}>
              <span style={{ color: C.ink2, minWidth: 0 }}>
                <span className="cmd-num" style={{ color: C.muted }}>{it.qty}×</span> {it.name}
                {it.customer && <span style={{ display: "block", fontSize: 11, color: C.red, marginTop: 1 }}>Pa&apos; {it.customer}</span>}
              </span>
              <span className="cmd-num" style={{ color: C.ink, flexShrink: 0 }}>{posMoney(it.unitPrice * it.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
          <span style={{ fontSize: 13, color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num" style={{ ...H, fontSize: 28 }}>{posMoney(o.total)}</span>
        </div>
      </div>
      <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${C.rule}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {!o.local && o.status !== "cancelada" && (o.entregadaAt
          ? <button onClick={() => void marcarEntregada(o.id, false)} style={{ width: "100%", height: 40, border: `1px solid ${C.rule}`, borderRadius: 10, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13, cursor: "pointer" }}>Deshacer entrega</button>
          : <button onClick={() => void marcarEntregada(o.id, true)} style={{ width: "100%", height: 56, border: "none", borderRadius: 12, background: C.green, color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>✓ Marcar entregado</button>)}
        {o.local && (
          <div style={{ fontSize: 13, color: LOCAL_UI[o.local].color, lineHeight: 1.5 }}>
            {o.local === "failed" ? "El servidor rechazó este pedido." : "Guardado en esta caja; se envía solo cuando vuelva el internet."}
            {o.folio.startsWith("L-") && " El número definitivo llega al sincronizar."}
          </div>
        )}
        {o.local && o.status === "pendiente" && (
          <button className="cmd-btn brand" disabled={o.local === "sending"} onClick={() => { if (guard()) chargePending(o); }} style={{ width: "100%", height: 56, fontSize: 17, opacity: o.local === "sending" ? 0.5 : 1 }}>Cobrar {posMoney(o.total)}</button>
        )}
        {o.local && o.local !== "sending" && (
          <button onClick={() => { if (window.confirm(`¿Descartar el pedido ${o.folio}? No quedará registrado.`)) { dropOutbox(o.id.slice(LOCAL_ORDER.length)); selectOrden(null); } }} style={{ width: "100%", height: 40, border: `1px solid ${C.rule}`, borderRadius: 10, background: "transparent", color: C.muted, fontFamily: F.mono, fontSize: 13, cursor: "pointer" }}>Descartar</button>
        )}
        {o.status === "pendiente" && !o.local && (
          <>
            <button className="cmd-btn brand" onClick={() => { if (guard()) chargePending(o); }} style={{ width: "100%", height: 56, fontSize: 17 }}>Cobrar {posMoney(remaining)}</button>
            {shares.length >= 2 && (
              <button className="cmd-btn ghost sm" onClick={() => { if (guard()) chargePendingSplit(o); }} style={{ width: "100%" }}>Dividir por persona</button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cmd-btn ghost sm" onClick={() => { if (guard()) editPending(o); }} style={{ flex: 1 }}>Editar</button>
              <button type="button" onClick={() => setCanceling(true)} aria-label={`Cancelar ${o.folio}`} className="cmd-btn ghost sm" style={{ flex: 1, color: C.red }}>Cancelar</button>
            </div>
          </>
        )}
        {(p.status !== "unsupported" || relaysLabels(p)) && (
          <button onClick={() => printLabelFor(o)} disabled={p.status !== "ready" && !relaysLabels(p)} style={{ width: "100%", height: 40, border: `1px solid ${C.rule}`, borderRadius: 10, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13, cursor: p.status === "ready" || relaysLabels(p) ? "pointer" : "default", opacity: p.status === "ready" || relaysLabels(p) ? 1 : 0.5 }}>
            Reimprimir etiquetas
          </button>
        )}
      </div>
      {canceling && <CancelSheet o={o} onClose={() => setCanceling(false)} />}
    </div>
  );
}

/**
 * «Cancelar» asks why (one chip, then Confirmar): the reason is prepended to
 * the order's notes, so the cancelled 16 % can be read by cause.
 */
export function CancelSheet({ o, onClose }: { o: PosOrder; onClose: () => void }) {
  const [motivo, setMotivo] = React.useState<CancelReason | null>(null);
  return (
    <Sheet
      open
      onClose={onClose}
      title={<>¿Por qué se cancela <span className="cmd-num">{o.folio}</span>?</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button variant="danger" block disabled={!motivo} onClick={() => { if (!motivo) return; onClose(); void cancelPending(o.id, motivo); }}>
            Cancelar pedido
          </Button>
        </>
      }
    >
      <Chips>
        {CANCEL_REASONS.map((r) => (
          <Chip key={r} pressed={motivo === r} onClick={() => setMotivo(r)}>{r}</Chip>
        ))}
      </Chips>
      {o.paid > 0 && (
        <p role="alert" style={{ margin: 0, padding: "12px 14px", borderRadius: 12, background: C.redSoft, color: C.red, fontSize: 15, lineHeight: 1.45 }}>
          Ya tiene <b className="cmd-num">{posMoney(o.paid)}</b> pagados: el reembolso es manual.
        </p>
      )}
    </Sheet>
  );
}
