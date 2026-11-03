"use client";

/**
 * Pedidos.dc.html — /pos/pedidos. Pendientes (unpaid, or paid and not handed
 * over yet) and Completados (paid and delivered, one day at a time). Each card
 * says who it is for, what it has, how it stands with the money and who
 * prepares it; the round check on the right marks it delivered. Cancelar and
 * Combinar open over this page (cancelar.tsx, combinar.tsx).
 */
import * as React from "react";
import { PAY_METHOD_LABEL, type PayMethodSummary, type PosOrder } from "@/lib/pos/types";
import { ageLabel, ageMinutes, bogotaClock, bogotaDay, dayLabel, folioTag, rebuildPeople, shiftDay } from "@/lib/pos/pending";
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
  printTicketFor,
  startMerge,
  toggleSeLoLlevamos,
  countCompletados,
  PAY_METHODS,
} from "../pos-store";
import { useTicketPrinter } from "@/lib/printer/tickets";
import { CancelarOverlay } from "./cancelar";
import { CombinarOverlay } from "./combinar";

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
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [lastAt, setLastAt] = React.useState<number | null>(null);
  const [doneCount, setDoneCount] = React.useState<number | null>(null);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  // The history tabs of the old screen collapse into these two.
  React.useEffect(() => {
    if (s.ordenesTab !== "pendiente" && s.ordenesTab !== "completada") setOrdenesTab("pendiente");
  }, [s.ordenesTab]);

  // Poll every 15 s while the page is visible; ages tick with it.
  React.useEffect(() => {
    const run = () => {
      tick();
      if (document.visibilityState !== "visible") return;
      void refreshOrdenes();
      const st = posStore.get();
      if (st.ordenesTab === "pendiente") void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
    };
    const id = window.setInterval(run, 15_000);
    void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
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
  const list = [...queued, ...s.ordenes.filter((o) => (isPend ? true : o.status === "pagada" && !!o.entregadaAt))];
  const pendCount = isPend ? list.length : s.pendientes.length + s.outbox.length;
  const compCount = !isPend ? list.length : doneCount;
  const combinables = s.pendientes.filter((o) => o.status === "pendiente").length;
  const cancelOrder = cancelId ? [...s.ordenes, ...s.pendientes].find((o) => o.id === cancelId) ?? null : null;
  const error = s.ordenesError ?? s.pendientesError;

  const refresh = () => {
    void refreshOrdenes();
    void refreshPendientes();
    void countCompletados(bogotaDay()).then((n) => { if (n !== null) setDoneCount(n); });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="topbar ped-top">
        <button type="button" className="icon-btn" onClick={closeOrdenes} aria-label="Volver a vender"><IconBack /></button>
        <h1 className="h2">Pedidos</h1>
        <div className="ped-tabs">
          <div className="seg" role="group" aria-label="Estado">
            <button type="button" aria-pressed={isPend} onClick={() => !isPend && setOrdenesTab("pendiente")}>Pendientes · {pendCount}</button>
            <button type="button" aria-pressed={!isPend} onClick={() => isPend && setOrdenesTab("completada")}>Completados{compCount !== null ? ` · ${compCount}` : ""}</button>
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
            <span style={{ fontSize: 17, fontWeight: 600 }}>Sin pedidos completados este día.</span>
          )}
        </div>
      ) : (
        <div className="orders scroll" aria-label={isPend ? "Pedidos pendientes" : "Pedidos completados"}>
          {list.map((o) => (
            <OrderCard key={o.id} o={o} onCancel={() => setCancelId(o.id)} />
          ))}
        </div>
      )}

      {cancelOrder && <CancelarOverlay o={cancelOrder} onClose={() => setCancelId(null)} />}
      {s.merge.on && <CombinarOverlay />}
    </div>
  );
}

function OrderCard({ o, onCancel }: { o: PosOrder; onCancel: () => void }) {
  const s = usePos();
  const name = orderName(o);
  const people = rebuildPeople(o);
  const several = people.length > 1;
  const delivered = !!o.entregadaAt;
  const local = o.local;
  const barista = o.baristaId ? s.catalog.equipo.find((m) => m.id === o.baristaId)?.name ?? null : null;
  const pendiente = o.status === "pendiente";
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

  // Who already paid (partial): «Juan pagó» / «Juan, Laura pagaron».
  const payers = [...new Set(o.pagos.map((p) => p.customer).filter((c): c is string => !!c))];
  const canCancel = !local && (pendiente || (o.status === "pagada" && !delivered));
  // On a partial card the buttons row is full: Cancelar moves to the menu.
  const cancelInRow = canCancel && !partial;

  let pill: React.ReactNode;
  if (local) pill = <span className={`pill ${local === "failed" ? "late" : ""}`}>{LOCAL_LABEL[local]}</span>;
  else if (o.status === "pagada") pill = <span className="pill ok">Pagado{o.paymentMethod ? ` · ${methodWord(o.paymentMethod)}` : ""}</span>;
  else if (o.porVerificar === "transferencia" && !o.paid) pill = <span className="pill late">Transferencia por verificar · {money(due)}</span>;
  else if (partial) pill = <span className="pill brand">Falta por cobrar {money(due)}</span>;
  else pill = <span className="pill brand">Sin pagar · {money(due)}</span>;

  return (
    <article className={`order${delivered && o.status === "pagada" ? " done" : ""}`} aria-labelledby={id} style={{ position: "relative" }}>
      <div className="oh">
        <span id={id} className="num">{folioTag(o.folio)}</span>
        <span className={`title grow${name ? "" : " muted"}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 72 }}>{name || "Sin nombre"}</span>
        {o.seLoLlevamos && <span className="pill" style={{ height: 24, fontSize: 12 }}>Se lo llevamos</span>}
        {delivered
          ? <span className="pill ok">Entregado · {bogotaClock(o.entregadaAt!)}</span>
          : <span className={`age${mins > 10 ? " late" : ""}`}>{ageLabel(o.createdAt)}</span>}
        {(!local || local !== "sending") && (
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
      <ul>
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
      </ul>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {pill}
        {partial && <span className="muted" style={{ fontSize: 13 }}>{payers.length ? `${payers.join(", ")} ${payers.length > 1 ? "pagaron" : "pagó"}` : `Pagado ${money(o.paid)}`}</span>}
        {barista && <span className="muted" style={{ fontSize: 13 }}>Prepara {barista}</span>}
      </div>
      <div className="acts">
        {pendiente && (local !== "sending") && (
          partial
            ? <button type="button" className="btn sm" onClick={() => { if (guard()) chargePendingSplit(o); }}>Cobrar el resto</button>
            : o.porVerificar === "transferencia" && !local
              ? <button type="button" className="btn sm" onClick={() => { if (guard()) chargePending(o, "transferencia"); }}>Verificar</button>
              : <button type="button" className="btn sm" onClick={() => { if (guard()) chargePending(o); }}>Cobrar</button>
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
      </div>
    </article>
  );
}
