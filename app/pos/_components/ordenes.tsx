"use client";

/**
 * Pedidos.dc.html — /pos/pedidos. Pendientes (unpaid, or paid and not handed
 * over yet), Completados (paid and delivered) and Canceladas (voided or folded
 * into another order, read-only), the last two one day at a time. Each card
 * says who it is for, what it has, how it stands with the money and who
 * prepares it; the round check on the right marks it delivered. «Ver detalle»
 * opens everything stored on the order, drink by drink, with a button to
 * reprint one drink's labels. Cancelar and Combinar open over this page
 * (cancelar.tsx, combinar.tsx).
 */
import * as React from "react";
import { PAY_METHOD_LABEL, type PayMethodSummary, type PosOrder } from "@/lib/pos/types";
import { ageLabel, ageMinutes, bogotaClock, bogotaDay, dayLabel, folioTag, rebuildPeople, shiftDay } from "@/lib/pos/pending";
import { ORDER_TYPE_LABEL, cancelMotivo, modLabels } from "@/lib/pos/detalle";
import {
  usePos,
  posStore,
  queuedOrders,
  LOCAL_ORDER,
  dropOutbox,
  closeOrdenes,
  setOrdenesTab,
  setOrdenesDay,
  refreshOrdenes,
  refreshPendientes,
  marcarEntregada,
  chargePending,
  chargePendingSplit,
  editPending,
  printLabelFor,
  printLineLabelFor,
  printTicketFor,
  startMerge,
  toggleSeLoLlevamos,
  countCompletados,
  PAY_METHODS,
} from "../pos-store";
import { useTicketPrinter } from "@/lib/printer/tickets";
import { CancelarOverlay } from "./cancelar";
import { CombinarOverlay } from "./combinar";
import { DescuentoOverlay } from "./descuento";
import { PremioOverlay } from "./premio";
import { anularDescuento } from "../actions";

/** Human label for a payment method, including the "mixto" summary. */
export const methodLabel = (m: string | null | undefined): string =>
  m === "mixto" ? "Mixto" : PAY_METHODS.find((x) => x.id === m)?.label ?? (m ?? "");

/** "$ 10.000" — the canvas puts a space after the sign. */
export const money = (n: number): string => "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** «efectivo» · «transferencia» · «datáfono» · «mixto», as the cards say it. */
export const methodWord = (m: PayMethodSummary | null | undefined): string => (m ? PAY_METHOD_LABEL[m].toLocaleLowerCase("es") : "");

/** Who an order is for: «Carlos», «Juan, Laura», or "" when nobody was named. */
export function orderName(o: Pick<PosOrder, "customerName" | "customerNames" | "items">): string {
  const people = rebuildPeople(o);
  if (people.length > 1) return people.join(", ");
  return o.customerName.trim() || people[0] || "";
}

/** What is still owed on an order (a paid one owes nothing). */
export const owed = (o: Pick<PosOrder, "status" | "total" | "paid">): number => (o.status === "pagada" ? 0 : Math.max(0, o.total - o.paid));
/** What was already paid (a direct «Cobrar» sale keeps `paid` at 0: the whole total). */
export const paidOf = (o: Pick<PosOrder, "status" | "total" | "paid">): number => (o.status === "pagada" ? Math.max(o.paid, o.total) : o.paid);

// ── icons (stroke currentColor, as the artboards) ───────────────
export const IconBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
);
export const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const IconCheck = ({ size = 22, w = 2.6 }: { size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const IconRefresh = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>
);
const IconMore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
);

/** «9:42» in the top bar, Bogotá time, kept current. */
export function Clock() {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const set = () => setNow(Date.now());
    const first = window.setTimeout(set, 0);
    const id = window.setInterval(set, 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, []);
  return <span className="clock">{now === null ? "" : bogotaClock(now)}</span>;
}

/** «Actualizado hace 12 s», live. */
function Updated({ at }: { at: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (at === null) return null;
  const secs = Math.max(0, Math.round((now - at) / 1000));
  const txt = secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min`;
  return <span className="muted ped-upd" style={{ fontSize: 14 }}>Actualizado hace {txt}</span>;
}

/** Loading a stored order into the ticket replaces what is there — ask only when there is something. */
function guard(): boolean {
  const s = posStore.get();
  return !s.order.length || !!s.pending || window.confirm("Se perderá el pedido actual. ¿Continuar?");
}

const LOCAL_LABEL = { sending: "Enviando…", offline: "Sin enviar · en esta caja", failed: "Error al enviar" } as const;

export function PedidosPage() {
  const s = usePos();
  const today = bogotaDay();
  const isPend = s.ordenesTab === "pendiente";
  const isCanc = s.ordenesTab === "cancelada";
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [descId, setDescId] = React.useState<string | null>(null);
  const [premioId, setPremioId] = React.useState<string | null>(null);
  const [lastAt, setLastAt] = React.useState<number | null>(null);
  const [doneCount, setDoneCount] = React.useState<number | null>(null);
  const [cancCount, setCancCount] = React.useState<number | null>(null);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  // The history tabs of the old screen collapse into these three («todas» is not one).
  React.useEffect(() => {
    if (s.ordenesTab === "todas") setOrdenesTab("pendiente");
  }, [s.ordenesTab]);

  // Poll every 15 s while the page is visible; ages tick with it.
  React.useEffect(() => {
    const run = () => {
      tick();
      if (document.visibilityState !== "visible") return;
      void refreshOrdenes();
      const st = posStore.get();
      if (st.ordenesTab !== "completada") void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
      if (st.ordenesTab !== "cancelada") void countCompletados(bogotaDay(), "cancelada").then((n) => { if (n !== null) setCancCount(n); });
    };
    const id = window.setInterval(run, 15_000);
    void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
    void countCompletados(bogotaDay(), "cancelada").then((n) => { if (n !== null) setCancCount(n); });
    return () => window.clearInterval(id);
  }, []);
  // «Actualizado hace …» counts from the last list that came back.
  React.useEffect(() => {
    let prev = posStore.get().ordenes;
    return posStore.sub(() => {
      const st = posStore.get();
      if (st.ordenes === prev || st.ordenesLoading || st.ordenesError) return;
      prev = st.ordenes;
      setLastAt(Date.now());
    });
  }, []);

  // This register's queued orders (offline / still sending) go first in the queue.
  const queued = isPend ? queuedOrders(s) : [];
  const list = [...queued, ...s.ordenes.filter((o) => (isPend ? true : isCanc ? o.status === "cancelada" : o.status === "pagada" && !!o.entregadaAt))];
  const pendCount = isPend ? list.length : s.pendientes.length + s.outbox.length;
  const compCount = s.ordenesTab === "completada" ? list.length : doneCount;
  const canCount = isCanc ? list.length : cancCount;
  const combinables = s.pendientes.filter((o) => o.status === "pendiente").length;
  const descOrder = descId ? s.ordenes.find((o) => o.id === descId) ?? null : null;
  const premioOrder = premioId ? s.ordenes.find((o) => o.id === premioId) ?? null : null;
  const cancelOrder = cancelId ? [...s.ordenes, ...s.pendientes].find((o) => o.id === cancelId) ?? null : null;
  const error = s.ordenesError ?? s.pendientesError;

  const refresh = () => {
    void refreshOrdenes();
    void refreshPendientes();
    void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
    void countCompletados(bogotaDay(), "cancelada").then((n) => { if (n !== null) setCancCount(n); });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="topbar ped-top">
        <button type="button" className="icon-btn" onClick={closeOrdenes} aria-label="Volver a vender"><IconBack /></button>
        <h1 className="h2">Pedidos</h1>
        <div className="ped-tabs">
          <div className="seg" role="group" aria-label="Estado">
            <button type="button" aria-pressed={isPend} onClick={() => !isPend && setOrdenesTab("pendiente")}>Pendientes · {pendCount}</button>
            <button type="button" aria-pressed={s.ordenesTab === "completada"} onClick={() => s.ordenesTab !== "completada" && setOrdenesTab("completada")}>Completados{compCount !== null ? ` · ${compCount}` : ""}</button>
            <button type="button" aria-pressed={isCanc} onClick={() => !isCanc && setOrdenesTab("cancelada")}>Canceladas{canCount !== null ? ` · ${canCount}` : ""}</button>
          </div>
          {!isPend && (
            <div className="ped-day" role="group" aria-label="Día">
              <button type="button" className="icon-btn" onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, -1))} aria-label="Día anterior"><IconBack /></button>
              <span className="ped-day-l">{dayLabel(s.ordenesDay, today)}</span>
              <button type="button" className="icon-btn" onClick={() => setOrdenesDay(shiftDay(s.ordenesDay, 1))} disabled={s.ordenesDay >= today} aria-label="Día siguiente" style={{ transform: "scaleX(-1)" }}><IconBack /></button>
            </div>
          )}
        </div>
        <span className="grow" />
        <Updated at={lastAt} />
        <button type="button" className="btn ghost sm ped-refresh" onClick={refresh} aria-label="Actualizar" disabled={s.ordenesLoading && !s.ordenes.length}>
          <IconRefresh /><span className="ped-refresh-l">Actualizar</span>
        </button>
        {isPend && (
          <button type="button" className="btn ghost sm" onClick={startMerge} disabled={combinables < 2} title={combinables < 2 ? "Se necesitan dos o más pedidos sin pagar" : undefined}>
            <span>Combinar<span className="ped-hide-ph"> pedidos</span></span>
          </button>
        )}
        <Clock />
      </header>

      {error && <div role="alert" className="ped-alert">{error}</div>}

      {!list.length ? (
        <div className="empty">
          {s.ordenesLoading ? (
            <span style={{ fontSize: 17, fontWeight: 600 }}>Cargando…</span>
          ) : isPend ? (
            <>
              <IconCheck size={44} w={2} />
              <span style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>Todo al día</span>
              <span style={{ fontSize: 14 }}>Aquí queda cada pedido hasta que esté pagado y entregado.</span>
            </>
          ) : (
            <span style={{ fontSize: 17, fontWeight: 600 }}>{isCanc ? "Sin pedidos cancelados este día." : "Sin pedidos completados este día."}</span>
          )}
        </div>
      ) : (
        <div className="orders scroll" aria-label={isPend ? "Pedidos pendientes" : isCanc ? "Pedidos cancelados" : "Pedidos completados"}>
          {list.map((o) => (
            <OrderCard key={o.id} o={o} onCancel={() => setCancelId(o.id)} onDescuento={() => setDescId(o.id)} onPremio={() => setPremioId(o.id)} />
          ))}
        </div>
      )}

      {cancelOrder && <CancelarOverlay o={cancelOrder} onClose={() => setCancelId(null)} />}
      {descOrder && <DescuentoOverlay o={descOrder} onClose={() => setDescId(null)} />}
      {premioOrder && <PremioOverlay o={premioOrder} onClose={() => setPremioId(null)} />}
      {s.merge.on && <CombinarOverlay />}
    </div>
  );
}

function OrderCard({ o, onCancel, onDescuento, onPremio }: { o: PosOrder; onCancel: () => void; onDescuento: () => void; onPremio: () => void }) {
  const s = usePos();
  const name = orderName(o);
  const people = rebuildPeople(o);
  const several = people.length > 1;
  const delivered = !!o.entregadaAt;
  const local = o.local;
  const barista = o.baristaId ? s.catalog.equipo.find((m) => m.id === o.baristaId)?.name ?? null : null;
  const pendiente = o.status === "pendiente";
  // Cancelled (or folded into another order) is final: the card only reads.
  const cancelada = o.status === "cancelada";
  const [open, setOpen] = React.useState(false);
  const due = owed(o);
  const partial = pendiente && o.paid > 0 && due > 0;
  const mins = ageMinutes(o.createdAt);
  const [menu, setMenu] = React.useState(false);
  const tickets = useTicketPrinter().modo !== "no";
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    // Escape closes the menu, not the page (the root listens on window, bubbling).
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setMenu(false); } };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKey, true); };
  }, [menu]);
  const id = `o-${o.id.replace(/[^a-z0-9]/gi, "")}`;
  // Only the latest rejection is worth showing; approved and waiting ones always.
  const descs = (o.descuentos ?? []).filter((d, i, all) => d.estado !== "rechazado" || i === all.length - 1);
  const esperando = descs.some((d) => d.estado === "pendiente");
  const charge = (fn: () => void) => {
    if (esperando && !window.confirm("Hay un descuento esperando la aprobación del dueño. ¿Cobrar con el precio normal?")) return;
    if (guard()) fn();
  };

  // Who already paid (partial): «Juan pagó» / «Juan, Laura pagaron».
  const payers = [...new Set(o.pagos.map((p) => p.customer).filter((c): c is string => !!c))];
  const canCancel = !local && (pendiente || (o.status === "pagada" && !delivered));
  // On a partial card the buttons row is full: Cancelar moves to the menu.
  const cancelInRow = canCancel && !partial;

  let pill: React.ReactNode;
  if (cancelada) pill = <span className="pill late">{o.mergedInto ? `Combinado en ${o.mergedIntoFolio ? folioTag(o.mergedIntoFolio) : "otro pedido"}` : "Cancelado"}</span>;
  else if (local) pill = <span className={`pill ${local === "failed" ? "late" : ""}`}>{LOCAL_LABEL[local]}</span>;
  else if (o.status === "pagada") pill = <span className="pill ok">Pagado{o.paymentMethod ? ` · ${methodWord(o.paymentMethod)}` : ""}</span>;
  else if (o.porVerificar === "transferencia" && !o.paid) pill = <span className="pill late">Transferencia por verificar · {money(due)}</span>;
  else if (partial) pill = <span className="pill brand">Falta por cobrar {money(due)}</span>;
  else pill = <span className="pill brand">Sin pagar · {money(due)}</span>;

  return (
    <article className={`order${delivered && o.status === "pagada" ? " done" : ""}${cancelada ? " canc" : ""}${open ? " open" : ""}`} aria-labelledby={id} style={{ position: "relative" }}>
      <div className="oh">
        <span id={id} className="num">{folioTag(o.folio)}</span>
        <span className={`title grow${name ? "" : " muted"}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 72 }}>{name || "Sin nombre"}</span>
        {o.seLoLlevamos && <span className="pill" style={{ height: 24, fontSize: 12 }}>Se lo llevamos</span>}
        {cancelada
          ? <span className="age">{bogotaClock(o.createdAt)}</span>
          : delivered
            ? <span className="pill ok">Entregado · {bogotaClock(o.entregadaAt!)}</span>
            : <span className={`age${mins > 10 ? " late" : ""}`}>{ageLabel(o.createdAt)}</span>}
        {!cancelada && (!local || local !== "sending") && (
          <div ref={menuRef} style={{ display: "contents" }}>
            <button type="button" className="ped-more" aria-label={`Más opciones del pedido ${folioTag(o.folio)}`} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><IconMore /></button>
            {menu && (
              <div className="menu" role="menu" style={{ top: 64, right: 12, width: 260 }}>
                {!local && (
                  <button type="button" role="menuitemcheckbox" aria-checked={o.seLoLlevamos} onClick={() => { setMenu(false); void toggleSeLoLlevamos(o.id, !o.seLoLlevamos); }}>
                    <span className="grow">Se lo llevamos</span>
                    {o.seLoLlevamos && <IconCheck size={18} />}
                  </button>
                )}
                {pendiente && !local && due > 0 && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onDescuento(); }}>Pedir descuento</button>
                )}
                {pendiente && !local && due > 0 && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onPremio(); }}>Premio Mi Pa&apos;Yo</button>
                )}
                <button type="button" role="menuitem" onClick={() => { setMenu(false); printLabelFor(o); }}>Reimprimir etiquetas</button>
                {tickets && (
                  <>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); printTicketFor(o, "recibo"); }}>Imprimir recibo</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); printTicketFor(o, "comanda"); }}>Reimprimir comanda</button>
                  </>
                )}
                {canCancel && !cancelInRow && (
                  <button type="button" role="menuitem" style={{ color: "var(--late)" }} onClick={() => { setMenu(false); onCancel(); }}>Cancelar pedido</button>
                )}
                {local && (
                  <button type="button" role="menuitem" style={{ color: "var(--late)" }} onClick={() => { setMenu(false); if (window.confirm(`¿Descartar el pedido ${o.folio}? No quedará registrado.`)) dropOutbox(o.id.slice(LOCAL_ORDER.length)); }}>
                    Descartar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {open ? <OrderDetail o={o} barista={barista} id={`${id}-det`} /> : <ul>
        {o.items.map((it) => (
          <li key={it.id}>
            <span>{it.qty} × {it.name}{several && it.customer ? <span className="muted"> · {it.customer}</span> : null}</span>
            <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{money(it.qty * it.unitPrice)}</span>
          </li>
        ))}
        <li style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2 }}>
          <b style={{ fontSize: 16 }}>Total</b>
          <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>{money(o.total)}</span>
        </li>
      </ul>}
      <button type="button" className="ped-det-tg" aria-expanded={open} aria-controls={open ? `${id}-det` : undefined} onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar detalle" : "Ver detalle"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {pill}
        {cancelada && !o.mergedInto && cancelMotivo(o.note) && <span className="muted" style={{ fontSize: 13 }}>{cancelMotivo(o.note)}</span>}
        {partial && <span className="muted" style={{ fontSize: 13 }}>{payers.length ? `${payers.join(", ")} ${payers.length > 1 ? "pagaron" : "pagó"}` : `Pagado ${money(o.paid)}`}</span>}
        {barista && <span className="muted" style={{ fontSize: 13 }}>Prepara {barista}</span>}
      </div>
      {pendiente && descs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {descs.map((d) =>
            d.estado === "pendiente" ? (
              <React.Fragment key={d.id}>
                <span className="pill late">Descuento por aprobar · {d.label}</span>
                <button type="button" className="btn ghost sm" onClick={() => { if (window.confirm("¿Retirar la solicitud de descuento?")) void anularDescuento({ id: d.id }).then(() => refreshOrdenes()); }}>Retirar</button>
              </React.Fragment>
            ) : d.estado === "aprobado" ? (
              <span key={d.id} className="pill ok">Descuento aprobado · {d.label}</span>
            ) : (
              <span key={d.id} className="pill">Descuento rechazado · {d.label}</span>
            ),
          )}
        </div>
      )}
      {!cancelada && <div className="acts">
        {pendiente && (local !== "sending") && (
          partial
            ? <button type="button" className="btn sm" onClick={() => charge(() => chargePendingSplit(o))}>Cobrar el resto</button>
            : o.porVerificar === "transferencia" && !local
              ? <button type="button" className="btn sm" onClick={() => charge(() => chargePending(o, "transferencia"))}>Verificar</button>
              : <button type="button" className="btn sm" onClick={() => charge(() => chargePending(o))}>Cobrar</button>
        )}
        {pendiente && !local && <button type="button" className="btn ghost sm" onClick={() => { if (guard()) editPending(o); }}>Editar</button>}
        {cancelInRow && <button type="button" className="btn ghost sm" onClick={onCancel}>Cancelar</button>}
        {o.status === "pagada" && delivered && !local && (
          <button type="button" className="btn ghost sm" onClick={() => void marcarEntregada(o.id, false)}>Deshacer entrega</button>
        )}
        <span className="grow" />
        {!local && (delivered
          ? o.status === "pagada"
            ? <span className="check done" aria-hidden="true"><IconCheck w={2.8} /></span>
            : <button type="button" className="check done" aria-label={`Deshacer entrega del pedido ${folioTag(o.folio)}`} onClick={() => void marcarEntregada(o.id, false)}><IconCheck w={2.8} /></button>
          : <button type="button" className="check" aria-label={`Marcar entregado el pedido ${folioTag(o.folio)}`} onClick={() => void marcarEntregada(o.id, true)}><IconCheck /></button>)}
      </div>}
    </article>
  );
}

/**
 * «Ver detalle»: everything stored on the order. Drink by drink (who it is
 * for, every option chosen, unit price and line total, and «Imprimir
 * etiquetas» for that drink alone), then the order itself: when and how it
 * was taken, who prepares it, notes, every payment, paid/delivered times.
 * A cancelled order shows the same, without printing.
 */
function OrderDetail({ o, barista, id }: { o: PosOrder; barista: string | null; id: string }) {
  const s = usePos();
  const cancelada = o.status === "cancelada";
  const [sent, setSent] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setSent(null), 2500);
    return () => window.clearTimeout(t);
  }, [sent]);
  const today = bogotaDay();
  const when = (iso: string) => {
    const d = bogotaDay(Date.parse(iso));
    return d === today ? bogotaClock(iso) : `${dayLabel(d, today)} · ${bogotaClock(iso)}`;
  };
  const items = [...o.items].sort((a, b) => a.position - b.position);
  const due = owed(o);
  // A direct «Cobrar» sale stores its payment on the order, not in orden_pagos.
  const pagos = o.pagos.length || o.status !== "pagada" || !o.paymentMethod || o.paymentMethod === "mixto"
    ? o.pagos
    : [{ id: "orden", customer: null, method: o.paymentMethod, amount: o.total, tendered: o.tendered, change: o.change, approvalCode: null, createdAt: o.paidAt ?? o.createdAt }];

  return (
    <div className="ped-det" id={id}>
      <ul className="ped-det-lines" aria-label="Productos">
        {items.map((it) => {
          const mods = modLabels(it.mods, s.catalog.modGroups);
          const printable = !cancelada && it.kind === "item" && !!it.productoId && !!s.catalog.byId[it.productoId]?.printsLabel;
          return (
            <li key={it.id}>
              <div className="ped-det-row">
                <b>{it.qty} × {it.name}</b>
                <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{money(it.qty * it.unitPrice)}</span>
              </div>
              {(it.customer || it.qty > 1) && (
                <div className="muted ped-det-sub">
                  {it.customer && <span>Para {it.customer}</span>}
                  {it.qty > 1 && <span>{money(it.unitPrice)} c/u</span>}
                </div>
              )}
              {mods.length > 0 && (
                <div className="ped-det-mods">
                  {mods.map((m) => <span key={m} className="pill">{m}</span>)}
                </div>
              )}
              {printable && (
                <button
                  type="button"
                  className="btn ghost sm ped-det-print"
                  onClick={() => { printLineLabelFor(o, it.id); setSent(it.id); }}
                >
                  {sent === it.id ? "Etiquetas enviadas" : it.qty > 1 ? "Imprimir etiquetas · 1 vaso" : "Imprimir etiquetas"}
                </button>
              )}
            </li>
          );
        })}
        <li className="ped-det-total">
          <b style={{ fontSize: 16 }}>Total</b>
          <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>{money(o.total)}</span>
        </li>
      </ul>
      <dl className="ped-det-info">
        <dt>Pedido</dt><dd>{o.folio}</dd>
        <dt>Tomado</dt><dd>{when(o.createdAt)}</dd>
        <dt>Tipo</dt><dd>{ORDER_TYPE_LABEL[o.orderType] ?? o.orderType}{o.canal === "whatsapp" ? " · por WhatsApp" : ""}{o.seLoLlevamos ? " · se lo llevamos" : ""}</dd>
        <dt>Prepara</dt><dd>{barista ?? "Sin asignar"}</dd>
        {o.sinGluten && (<><dt>Sin gluten</dt><dd>Sí</dd></>)}
        {o.note.trim() && (<><dt>{cancelada ? "Nota y motivo" : "Nota"}</dt><dd>{o.note}</dd></>)}
        {cancelada && (<><dt>Estado</dt><dd>{o.mergedInto ? `Combinado en ${o.mergedIntoFolio ? folioTag(o.mergedIntoFolio) : "otro pedido"}` : "Cancelado"}</dd></>)}
        {o.paidAt && (<><dt>Pagado</dt><dd>{when(o.paidAt)}</dd></>)}
        {o.entregadaAt && (<><dt>Entregado</dt><dd>{when(o.entregadaAt)}</dd></>)}
        {!cancelada && due > 0 && (<><dt>Falta por cobrar</dt><dd>{money(due)}{o.porVerificar === "transferencia" ? " · transferencia por verificar" : ""}</dd></>)}
        <dt>Pagos</dt>
        <dd>
          {pagos.length ? (
            <ul className="ped-det-pagos">
              {pagos.map((p) => (
                <li key={p.id}>
                  <span><b>{methodLabel(p.method)} · {money(p.amount)}</b>{p.customer ? ` · ${p.customer}` : ""}</span>
                  <span className="muted">
                    {[
                      bogotaClock(p.createdAt),
                      p.tendered != null && p.method === "efectivo" ? `recibido ${money(p.tendered)} · cambio ${money(p.change)}` : null,
                      p.approvalCode ? `aprobación ${p.approvalCode}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">Ninguno</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
