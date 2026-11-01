"use client";

/**
 * Venta.dc.html — the ticket (.ticket): «Pedido nuevo» / «Pedido #folio»,
 * «Prepara <barista>», the name that goes on the cup, «Se lo llevamos»,
 * people chips, the lines, total and the pay buttons. Below 1024 px it is
 * the slide-over opened from the cart bar (`ticketOpen`).
 */
import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, orderTotal, modLinePrice, modSummary, clearTicket, setActivePerson, addPerson, nameTicket, renamePerson, removePerson, linesOf, startTender, savePending, discardPendingEdit, setSeLoLlevamos, openBaristaPicker, type OrderLine } from "../pos-store";
import { relaysLabels, type PrinterStatus } from "@/lib/printer/serial";
import { C, F } from "./theme";

// ════════════════════════════════════════════════════════════════
// Small shared helpers (canvas format: "$ 10.000")
// ════════════════════════════════════════════════════════════════
export const money = (n: number): string => (n < 0 ? "−$ " : "$ ") + posMoney(Math.abs(n)).slice(1);

/** «Pipe Cipagauta» → «PC». */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** «Pa' Juan» line / cart summary: who it's for and the options picked. */
export function lineSub(line: OrderLine, catalog: Parameters<typeof modSummary>[1]): string {
  const parts: string[] = [];
  if (line.customer) parts.push(`Pa' ${line.customer}`);
  if (line.kind === "combo") {
    const c = catalog.comboById[line.id];
    if (c) parts.push(c.items.map((id) => catalog.byId[id]?.name).filter(Boolean).join(" + ") || c.desc);
  }
  const mods = modSummary(line, catalog);
  if (mods.length) parts.push(mods.map((m) => m.name).join(", "));
  return parts.join(" · ");
}

/**
 * Canvas overlay: .scrim + .sheet. Click on the scrim or Escape closes;
 * Escape is caught before the register's own handler.
 */
export function Overlay({ onClose, labelledBy, maxWidth, children, style }: {
  onClose: () => void;
  labelledBy: string;
  maxWidth?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const close = React.useRef(onClose);
  React.useEffect(() => { close.current = onClose; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ ...(maxWidth ? { maxWidth } : {}), ...style }}>
        {children}
      </section>
    </div>
  );
}

/**
 * Wall clock for the POS, as an external store: ticks every 30 s while
 * something listens; 0 on the server (render nothing time-based there).
 */
let nowVal = 0;
const nowSubs = new Set<() => void>();
let nowTimer: number | null = null;
function subscribeNow(cb: () => void) {
  nowSubs.add(cb);
  if (nowTimer === null) {
    nowVal = Date.now();
    nowTimer = window.setInterval(() => { nowVal = Date.now(); nowSubs.forEach((f) => f()); }, 30_000);
  }
  return () => {
    nowSubs.delete(cb);
    if (!nowSubs.size && nowTimer !== null) { window.clearInterval(nowTimer); nowTimer = null; }
  };
}
export function useNow(): number {
  return React.useSyncExternalStore(subscribeNow, () => nowVal || (nowVal = Date.now()), () => 0);
}

// Kept for the screens not redesigned yet (Pedidos / tender read the old type labels).
export const ORDER_TYPES = [
  { id: "aqui", label: "Aquí" },
  { id: "llevar", label: "Llevar" },
  { id: "domicilio", label: "Domicilio" },
] as const;
/** Kept for Puntos / Etiquetas (older inline styles). */
export const personChip = (on: boolean, dashed = false): React.CSSProperties => ({
  height: 44, padding: "0 14px", borderRadius: 999, cursor: "pointer", maxWidth: 190,
  border: `1px ${dashed ? "dashed" : "solid"} ${on ? C.strong : C.rule}`,
  background: on ? C.strong : C.paperLt, color: on ? C.onStrong : C.ink,
  fontSize: 15, fontWeight: 600, fontFamily: F.mono,
  display: "inline-flex", alignItems: "center", gap: 6,
});

/**
 * A PC without its printer connected cannot print labels — and nothing
 * relays them for it. Shown (never asked): the top bar status and the
 * printer toast say so; a sale never waits on it.
 */
export const sinImpresora = (p: { status: PrinterStatus; relay: boolean }) =>
  !relaysLabels(p) && (p.status === "disconnected" || p.status === "off" || p.status === "error");

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
);

// ════════════════════════════════════════════════════════════════
// Ticket
// ════════════════════════════════════════════════════════════════
export function Ticket() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const [editPerson, setEditPerson] = React.useState<string | null>(null);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const hasMissing = s.order.some((l) => l.missing);
  const canSend = s.order.length > 0 && !s.sending && !hasMissing;
  const count = s.order.reduce((n, l) => n + l.qty, 0);
  const comboSaved = s.order.filter((l) => l.kind === "combo").reduce((acc, l) => acc + (catalog.comboById[l.id]?.saving ?? 0) * l.qty, 0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const prevCount = React.useRef(s.order.length);
  React.useEffect(() => {
    if (s.order.length > prevCount.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    prevCount.current = s.order.length;
  }, [s.order.length]);
  const empty = s.order.length === 0 && !editing;
  const offline = !s.online || s.outbox.some((j) => j.status === "offline");

  return (
    <>
      {s.ticketOpen && <button type="button" className="tk-shade" aria-label="Cerrar el pedido" tabIndex={-1} onClick={() => posStore.set({ ticketOpen: false })} />}
      <aside className={"ticket" + (s.ticketOpen ? " open" : "")} aria-labelledby="tk">
        <div className="ticket-h">
          <h1 id="tk" className="h2 grow">{editing ? `Pedido #${editing.folio}` : "Pedido nuevo"}</h1>
          <BaristaChip />
          <button type="button" className="icon-btn tk-close" onClick={() => posStore.set({ ticketOpen: false })} aria-label="Cerrar el pedido">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="ticket-b">
          {empty ? (
            <div className="empty">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8h12l-1 11H6z" /><path d="M17 10h2a2 2 0 0 1 0 4h-2.4" /><path d="M8 4c0 1 1 1 1 2M11 4c0 1 1 1 1 2" /></svg>
              <span style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>Toca un producto para empezar</span>
              <span style={{ fontSize: 14 }}>
                {offline ? "Sin conexión también puedes cobrar: la venta se guarda aquí." : "Mantén presionado un producto para ver su receta."}
              </span>
            </div>
          ) : (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0 6px" }}>
                <span className="label">¿A nombre de quién?</span>
                <NameField />
              </label>
              <div className="tk-chips">
                <button type="button" className="who-chip" aria-pressed={s.seLoLlevamos} onClick={() => setSeLoLlevamos(!s.seLoLlevamos)}>
                  <span className={"tk-box" + (s.seLoLlevamos ? " on" : "")} aria-hidden>
                    {s.seLoLlevamos && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </span>
                  Se lo llevamos
                </button>
                <PeopleChips onEdit={setEditPerson} />
              </div>
              <div ref={listRef} className="tk-lines scroll">
                {s.order.map((l, i) => <TicketLine key={i} idx={i} line={l} />)}
              </div>
              {(noteOpen || s.note) && (
                <textarea
                  className="field"
                  value={s.note}
                  onChange={(e) => posStore.set({ note: e.target.value })}
                  placeholder="Nota para la barra…"
                  aria-label="Nota del pedido"
                  rows={2}
                  maxLength={500}
                  style={{ minHeight: 64, marginTop: 8, fontSize: 15 }}
                />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0 4px" }}>
                <span className="muted" style={{ fontSize: 14 }}>{count} ítem{count === 1 ? "" : "s"}</span>
                <span className="grow" />
                <button type="button" className="btn ghost sm" style={{ height: 44, fontSize: 14 }} onClick={() => { if (noteOpen || s.note) { posStore.set({ note: "" }); setNoteOpen(false); } else setNoteOpen(true); }}>
                  {noteOpen || s.note ? "Quitar nota" : "Nota"}
                </button>
                {editing ? (
                  <button type="button" className="btn ghost sm" style={{ height: 44, fontSize: 14 }} onClick={() => { if (window.confirm(`¿Descartar los cambios del pedido #${editing.folio}?`)) discardPendingEdit(); }}>Descartar</button>
                ) : (
                  <button type="button" className="btn ghost sm" style={{ height: 44, fontSize: 14 }} onClick={() => { if (window.confirm("¿Vaciar el pedido?")) clearTicket(); }}>Vaciar</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="ticket-f">
          {s.noteSinGluten && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="pill ok">Pedido sin gluten</span>
              <button type="button" className="btn ghost sm" style={{ height: 36, fontSize: 13, padding: "0 10px" }} onClick={() => posStore.set({ noteSinGluten: false })}>Quitar</button>
            </div>
          )}
          {comboSaved > 0 && <span className="save" style={{ alignSelf: "flex-start" }}>Ahorro en combos · {money(comboSaved)}</span>}
          <div className="total"><span className="t">Total</span><span className={"v" + (empty ? " muted" : "")}>{money(total)}</span></div>
          {hasMissing && <span role="alert" style={{ fontSize: 13, color: "var(--late)", fontWeight: 600 }}>Quita el producto no disponible para continuar.</span>}
          {s.sendError && s.view === "sale" && <span role="alert" style={{ fontSize: 13, color: "var(--late)", fontWeight: 600 }}>{s.sendError}</span>}
          <button type="button" className="btn lg block" disabled={!canSend} onClick={() => startTender("efectivo")}>Efectivo</button>
          <button type="button" className="btn strong lg block" disabled={!canSend} onClick={() => startTender("transferencia")}>Transferencia</button>
          {!empty && (
            <div className="pay2">
              <button type="button" className="btn ghost sm" disabled={!canSend} onClick={() => startTender("datafono")}>Datáfono · otro pago</button>
              <button type="button" className="btn ghost sm" disabled={!canSend} onClick={() => void savePending()}>
                {s.sending ? "Guardando…" : editing ? "Guardar cambios" : "Enviar · pagar después"}
              </button>
            </div>
          )}
        </div>
      </aside>
      {editPerson && <PersonSheet name={editPerson} onClose={() => setEditPerson(null)} />}
    </>
  );
}

/** «Prepara <barista>» → «¿Quién prepara?». Hidden when the org has no team on the bar. */
function BaristaChip() {
  const s = usePos();
  if (!s.catalog.equipo.length) return null;
  const b = s.barista;
  const first = b ? b.name.split(" ")[0] : "";
  return (
    <button type="button" className={"chip" + (b ? "" : " ask")} onClick={openBaristaPicker} aria-label={b ? `¿Quién prepara? ${b.name}` : "¿Quién prepara? Nadie elegido"}>
      {b ? <span className="avatar">{initials(b.name)}</span> : null}
      {b ? `Prepara ${first}` : "¿Quién prepara?"}
      <ChevronDown />
    </button>
  );
}

/**
 * The name that goes on the cup. The field holds the order's first person:
 * typing a name and leaving the field (or Enter) names the ticket — lines
 * rung up before get that name too (nameTicket) — editing it renames them,
 * clearing it takes the name off. Free text on purpose: nicknames print.
 */
export function NameField() {
  const s = usePos();
  const current = s.people[0] ?? "";
  const [text, setText] = React.useState(current);
  const [focused, setFocused] = React.useState(false);
  const shown = focused ? text : current;
  const commit = () => {
    const t = text.trim();
    if (!current) { if (t) nameTicket(t); }
    else if (!t) removePerson(current);
    else if (t !== current) renamePerson(current, t);
  };
  return (
    <input
      className="field"
      type="text"
      value={shown}
      onFocus={() => { setText(current); setFocused(true); }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      onBlur={() => { commit(); setFocused(false); }}
      placeholder="Nombre para el vaso"
      aria-label="Nombre del cliente"
      enterKeyHint="done"
      autoComplete="off"
      autoCapitalize="words"
      maxLength={40}
      style={{ height: 48 }}
    />
  );
}

/**
 * Several customers on one order: one chip per person (lines count), the
 * active one gets what is added next; tapping the active chip edits it.
 * «+ persona» adds another inline.
 */
function PeopleChips({ onEdit }: { onEdit: (name: string) => void }) {
  const s = usePos();
  const [adding, setAdding] = React.useState(false);
  const [text, setText] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);
  if (!s.people.length) return null;
  const add = () => {
    const name = addPerson(text);
    setText("");
    setAdding(false);
    return name;
  };
  const several = s.people.length > 1;
  return (
    <>
      {several && s.people.map((name) => {
        const on = s.activePerson === name;
        return (
          <button key={name} type="button" className={"who-chip" + (on ? " a" : "")} aria-pressed={on} onClick={() => (on ? onEdit(name) : setActivePerson(name))} aria-label={`${name}, ${linesOf(s.order, name)} ítems${on ? ". Editar" : ""}`}>
            <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            <span className="muted">{linesOf(s.order, name)}</span>
          </button>
        );
      })}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "inline-flex", gap: 6 }}>
          <input ref={ref} className="field" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text.trim()) add(); else setAdding(false); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} maxLength={40} placeholder="Nombre" aria-label="Nombre de otra persona" style={{ height: 44, width: 130, fontSize: 14, padding: "0 12px" }} />
        </form>
      ) : (
        <button type="button" className="who-chip" onClick={() => setAdding(true)} style={{ borderStyle: "dashed", background: "transparent" }}>+ persona</button>
      )}
    </>
  );
}

/** Rename or take a person off the order (their lines stay, unassigned). */
function PersonSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const s = usePos();
  const [text, setText] = React.useState(name);
  const count = linesOf(s.order, name);
  const remove = () => {
    if (count > 0 && !window.confirm(`¿Quitar a ${name}? Sus ${count} ítem${count === 1 ? "" : "s"} quedan sin nombre.`)) return;
    removePerson(name);
    onClose();
  };
  return (
    <Overlay onClose={onClose} labelledBy="per-t" maxWidth={480}>
      <h2 id="per-t" className="h2">{name}</h2>
      <form onSubmit={(e) => { e.preventDefault(); renamePerson(name, text); onClose(); }} style={{ display: "flex", gap: 10 }}>
        <input className="field" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={40} aria-label="Nombre de la persona" />
        <button type="submit" className="btn">Guardar</button>
      </form>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn ghost" style={{ flex: 1, color: "var(--late)" }} onClick={remove}>Quitar persona</button>
        <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
      </div>
    </Overlay>
  );
}

/** One ticket line; tap = edit it on the options page (qty, options, person). */
export function TicketLine({ idx, line }: { idx: number; line: OrderLine }) {
  const catalog = useCatalog();
  const unit = modLinePrice(line, catalog);
  const sub = lineSub(line, catalog);
  const editable = line.kind === "item" && !line.missing;
  const body = (
    <>
      <span className="q">{line.qty}</span>
      <span className="grow">
        <span className="ln" style={{ display: "block" }}>
          {line.missing && <span className="pill late" style={{ marginRight: 6 }}>No disponible</span>}
          {line.kind === "combo" && <span className="save" style={{ marginRight: 6 }}>Combo</span>}
          {line.name}
        </span>
        {sub && <span className="ls" style={{ display: "block" }}>{sub}</span>}
      </span>
      <span className="lp">{money(unit * line.qty)}</span>
    </>
  );
  if (!editable) return <div className="line" style={line.missing ? { opacity: 0.6 } : undefined}>{body}</div>;
  return (
    <button type="button" className="line" onClick={() => posStore.set({ sheet: { mode: "edit", idx } })} aria-label={`${line.qty} ${line.name}${sub ? `, ${sub}` : ""}, ${money(unit * line.qty)}. Editar`}>
      {body}
    </button>
  );
}

/** Tile badge helper for the catalog: how many of a product are on the ticket. */
export function qtyOnTicket(order: ReadonlyArray<OrderLine>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of order) out[l.id] = (out[l.id] ?? 0) + l.qty;
  return out;
}

