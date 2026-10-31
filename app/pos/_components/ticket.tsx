"use client";

import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, orderTotal, modLinePrice, modSummary, changeQty, clearTicket, setActivePerson, addPerson, nameTicket, renamePerson, removePerson, setLinePerson, linesOf, startTender, savePending, discardPendingEdit, type OrderLine } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter, relaysLabels, printerStore, type PrinterStatus } from "@/lib/printer/serial";
import { C, F, Overlay } from "./theme";

// ════════════════════════════════════════════════════════════════
// Ticket
// ════════════════════════════════════════════════════════════════
export const ORDER_TYPES = [
  { id: "aqui", label: "Aquí" },
  { id: "llevar", label: "Llevar" },
  { id: "domicilio", label: "Domicilio" },
] as const;

export const qtyBtn: React.CSSProperties = { width: "var(--pos-qty)", height: "var(--pos-qty)", border: `1.5px solid ${C.ink}`, background: C.paperLt, color: C.ink, fontFamily: F.mono, fontSize: 18, lineHeight: 1, cursor: "pointer", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export function Ticket() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  // Local (not in the store): a second global modal key would collide with `s.sheet!`.
  const [personSheet, setPersonSheet] = React.useState<PersonSheetState | null>(null);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const hasMissing = s.order.some((l) => l.missing);
  const canSend = s.order.length > 0 && !s.sending && !hasMissing;
  const count = s.order.reduce((n, l) => n + l.qty, 0);
  const comboSaved = s.order.filter((l) => l.kind === "combo").reduce((acc, l) => acc + (catalog.comboById[l.id]?.saving ?? 0) * l.qty, 0);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const prevCount = React.useRef(s.order.length);
  React.useEffect(() => {
    if (s.order.length > prevCount.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    prevCount.current = s.order.length;
  }, [s.order.length]);

  return (
    <div className={"pos-ticket" + (s.ticketOpen ? " open" : "")} style={{ flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: `1.5px solid ${C.ink}`, background: C.paperLt }}>
      {/* header */}
      <div className="pos-ticket-head" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {/* Narrow layout only: back to the catalog. */}
          <button className="pos-ticket-close" onClick={() => posStore.set({ ticketOpen: false })} aria-label="Cerrar pedido" style={{ width: 44, height: 44, marginLeft: -4, borderRadius: 4, border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 20, cursor: "pointer", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: editing ? C.red : C.ink, marginRight: "auto" }}>
            {editing ? <>EDITANDO <span className="cmd-num">{editing.folio}</span></> : "PEDIDO"}
            {count > 0 && <span className="cmd-num" style={{ color: C.muted, fontWeight: 400 }}> · {count} ítem{count === 1 ? "" : "s"}</span>}
          </span>
          {editing ? (
            <button className="pos-textbtn" onClick={() => { if (window.confirm(`¿Descartar los cambios del pedido ${editing.folio}?`)) discardPendingEdit(); }} style={{ background: "none", border: "none", color: C.muted, fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Descartar</button>
          ) : s.order.length > 0 && (
            <button className="pos-textbtn" onClick={() => { if (window.confirm("¿Vaciar el pedido?")) clearTicket(); }} style={{ background: "none", border: "none", color: C.muted, fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Vaciar</button>
          )}
        </div>
        {/* Stacked, or on one row on a short screen (POS_CSS). */}
        <div className="pos-meta">
          <div className="pos-otypes">
            {ORDER_TYPES.map((t) => {
              const on = s.orderType === t.id;
              return (
                <button key={t.id} className="pos-otype" aria-pressed={on} onClick={() => posStore.set({ orderType: t.id })} style={{
                  fontFamily: F.mono, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4,
                  border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink2,
                }}>{t.label}</button>
              );
            })}
          </div>
          <NameField />
        </div>
        {/* People at the table. Inline styles only on these nodes (no responsive Tailwind). */}
        <div style={{ marginTop: 8 }}>
          <PersonPicker
            value={s.activePerson}
            onPick={setActivePerson}
            noAdd
            onEdit={(name) => setPersonSheet({ mode: "edit", name })}
            counts
          />
          {s.people.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>Toca un nombre para asignarle lo que agregues.</div>
          )}
        </div>
      </div>

      {/* lines */}
      <div ref={listRef} className="pos-scroll" style={{ flex: 1, overflowY: "auto" }}>
        {s.order.length === 0 && (
          <div style={{ padding: "56px 24px", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
            Toca un producto<br />para empezar el pedido.
          </div>
        )}
        {s.order.map((l, i) => <TicketLine key={i} idx={i} line={l} onPerson={() => setPersonSheet({ mode: "line", idx: i })} />)}
      </div>
      {personSheet && <PersonSheet state={personSheet} onClose={() => setPersonSheet(null)} />}

      {/* footer */}
      <div className="pos-ticket-foot" style={{ borderTop: `1.5px solid ${C.ink}`, background: C.paperLt }}>
        {s.noteSinGluten && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 10.5, color: C.green, border: `1px solid ${C.green}`, padding: "5px 8px", letterSpacing: ".04em", borderRadius: 3 }}>
            <span>✓ PEDIDO «SIN GLUTEN»</span>
            <button onClick={() => posStore.set({ noteSinGluten: false })} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        )}
        {noteOpen || s.note ? (
          <textarea
            value={s.note}
            onChange={(e) => posStore.set({ note: e.target.value })}
            placeholder="Nota para cocina / barra…"
            aria-label="Nota del pedido"
            rows={2}
            maxLength={500}
            style={{ width: "100%", marginBottom: 8, padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 12.5, borderRadius: 4, outline: "none", resize: "none" }}
          />
        ) : null}
        {/* Two rows, or one on a short screen (POS_CSS). */}
        <div className="pos-sum">
        <div className="pos-sum-note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: C.muted }}>
          <button className="pos-textbtn tight" onClick={() => setNoteOpen((v) => !v)} style={{ background: "none", border: "none", color: C.ink2, fontFamily: F.mono, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
            {noteOpen || s.note ? "− Nota" : "+ Nota"}
          </button>
          {comboSaved > 0 && <span style={{ color: C.green }}>Ahorro en combos <span className="cmd-num">−{posMoney(comboSaved)}</span></span>}
        </div>
        <div className="pos-total" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12, letterSpacing: ".12em", color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num pos-total-amt" style={{ fontFamily: F.slab, color: C.ink, lineHeight: 1 }}>{posMoney(total)}</span>
        </div>
        </div>
        {hasMissing && (
          <div style={{ fontSize: 10.5, color: C.red, marginBottom: 8, lineHeight: 1.4 }}>Quita el producto no disponible para continuar.</div>
        )}
        {s.sendError && s.view === "sale" && (
          <div role="alert" style={{ fontSize: 11, color: C.red, marginBottom: 8, lineHeight: 1.4 }}>{s.sendError}</div>
        )}
        <SinImpresora />
        {/* Stacked, or side by side on a short screen (POS_CSS). */}
        <div className="pos-actions">
          <button
            className="cmd-btn red pos-pay"
            disabled={!canSend}
            onClick={() => { if (confirmarSinImpresora()) startTender(); }}
            style={{ fontWeight: 600, letterSpacing: ".06em", opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            Cobrar {s.order.length ? posMoney(total) : ""}
          </button>
          <button
            className="cmd-btn pos-send"
            disabled={!canSend}
            onClick={() => { if (confirmarSinImpresora()) void savePending(); }}
            style={{ fontWeight: 600, letterSpacing: ".06em", opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            {s.sending ? "Guardando…" : editing ? "Guardar cambios" : (
              <span>Enviar<span className="pos-send-sep"> · </span><span className="pos-send-sub">pagar después</span></span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// People at the table — chips, sheet, per-line badge
// ════════════════════════════════════════════════════════════════
export const personChip = (on: boolean, dashed = false): React.CSSProperties => ({
  height: "var(--pos-chip)", padding: "0 10px", borderRadius: 4, cursor: "pointer", maxWidth: 190,
  border: `1.5px ${dashed ? "dashed" : "solid"} ${on ? C.ink : C.rule}`,
  background: on ? C.ink : C.paper, color: on ? C.paperLt : C.ink2,
  fontFamily: F.mono, fontSize: 12.5, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 6,
});
export const personInput: React.CSSProperties = {
  height: 40, padding: "0 12px", border: `1.5px solid ${C.ink}`, borderRadius: 4, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 14, outline: "none", minWidth: 0,
};

export function Count({ n, on }: { n: number; on: boolean }) {
  return <span className="cmd-num" style={{ fontSize: 10.5, fontWeight: 400, color: on ? C.paperLt : C.muted, opacity: on ? 0.75 : 1 }}>{n}</span>;
}

/**
 * Chip row for the table's people. Used by the ticket header (with counts,
 * tapping the active chip edits it; names are added in the big field above,
 * so no "+ persona" there), by the item sheet and by the line picker (no
 * counts; "+ persona" adds inline).
 */
/**
 * A PC without its printer connected cannot print labels — and nothing
 * relays them for it. The ticket says so in red until it is connected, and
 * charging asks first, so a sale never goes out expecting labels that will
 * not come.
 */
export const sinImpresora = (p: { status: PrinterStatus; relay: boolean }) =>
  !relaysLabels(p) && (p.status === "disconnected" || p.status === "off" || p.status === "error");

export function confirmarSinImpresora(): boolean {
  const p = printerStore.get();
  if (!sinImpresora(p)) return true;
  return window.confirm("La impresora no está conectada: la venta se registra pero no van a salir etiquetas. ¿Continuar?");
}

export function SinImpresora() {
  const p = usePrinter();
  if (!sinImpresora(p)) return null;
  const busy = p.status === "connecting";
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", border: `1.5px solid ${C.red}`, borderRadius: 4, background: C.paperLt }}>
      <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.4, color: C.red, fontWeight: 600 }}>Sin impresora: las etiquetas no van a salir.</span>
      <button type="button" onClick={() => (p.status === "off" ? void checkPrinter() : void connectPrinter())} disabled={busy} style={{ height: 32, padding: "0 10px", borderRadius: 3, border: `1.5px solid ${C.red}`, background: C.red, color: C.paperLt, fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 }}>
        {p.status === "off" ? "Reintentar" : "Conectar"}
      </button>
    </div>
  );
}

export function PersonPicker({ value, onPick, onAdd, onEdit, counts, noAdd }: {
  value: string | null;
  onPick: (name: string | null) => void;
  onAdd?: () => void;
  onEdit?: (name: string) => void;
  counts?: boolean;
  noAdd?: boolean;
}) {
  const s = usePos();
  const [adding, setAdding] = React.useState(false);
  const [text, setText] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);
  const addInline = () => {
    const name = addPerson(text, { activate: false });
    if (!name) return;
    onPick(name);
    setText("");
    setAdding(false);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {s.people.length > 0 && (
        <button type="button" onClick={() => onPick(null)} aria-pressed={value === null} style={{ ...personChip(value === null), fontWeight: 500, color: value === null ? C.paperLt : C.muted }}>
          Sin nombre{counts && <Count n={linesOf(s.order, null)} on={value === null} />}
        </button>
      )}
      {s.people.map((name) => {
        const on = value === name;
        return (
          <button type="button" key={name} onClick={() => (on && onEdit ? onEdit(name) : onPick(name))} aria-pressed={on} aria-label={`Cliente ${name}`} title={on && onEdit ? "Editar o quitar" : undefined} style={personChip(on)}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            {counts && <Count n={linesOf(s.order, name)} on={on} />}
            {on && onEdit && <span aria-hidden style={{ opacity: 0.7, fontSize: 11 }}>✎</span>}
          </button>
        );
      })}
      {noAdd ? null : onAdd ? (
        <button type="button" onClick={onAdd} style={personChip(false, true)}>+ persona</button>
      ) : adding ? (
        <form onSubmit={(e) => { e.preventDefault(); addInline(); }} style={{ display: "inline-flex", gap: 6 }}>
          <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} maxLength={40} placeholder="Nombre" aria-label="Nombre de la persona" style={{ ...personInput, height: "var(--pos-chip)", width: 150, fontSize: 12.5 }} />
          <button type="submit" style={personChip(true)}>OK</button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={personChip(false, true)}>+ persona</button>
      )}
    </div>
  );
}

/**
 * The name that goes on the cup. One big field instead of a "mesa / grupo"
 * box: Enter (or leaving the field) adds the name as a chip and makes it the
 * active person. Free text on purpose — customers give nicknames and
 * pronouns, and that is exactly what gets printed. It pulses while the
 * ticket has no name.
 */
export function NameField() {
  const s = usePos();
  const [text, setText] = React.useState("");
  const commit = () => {
    if (!text.trim()) return;
    nameTicket(text);
    setText("");
  };
  const ask = s.people.length === 0 && !text;
  return (
    <input
      className={"pos-nombre" + (ask ? " ask" : "")}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      onBlur={commit}
      placeholder={s.people.length === 0 ? "¿A nombre de quién?" : "Otro nombre…"}
      aria-label="Nombre del cliente"
      enterKeyHint="done"
      autoComplete="off"
      autoCapitalize="words"
      maxLength={40}
      style={{ fontFamily: F.mono }}
    />
  );
}

export type PersonSheetState = { mode: "add" } | { mode: "edit"; name: string } | { mode: "line"; idx: number };

/** Add people in a burst, rename / remove one, or pick who a line is for. */
export function PersonSheet({ state, onClose }: { state: PersonSheetState; onClose: () => void }) {
  const s = usePos();
  const [text, setText] = React.useState(state.mode === "edit" ? state.name : "");
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const line = state.mode === "line" ? s.order[state.idx] : undefined;
  const count = state.mode === "edit" ? linesOf(s.order, state.name) : 0;

  const submit = () => {
    if (state.mode === "add") {
      if (!addPerson(text)) return;
      setText("");
      ref.current?.focus();
    } else if (state.mode === "edit") {
      renamePerson(state.name, text);
      onClose();
    } else {
      const name = addPerson(text, { activate: false });
      if (!name) return;
      setLinePerson(state.idx, name);
      onClose();
    }
  };
  const remove = () => {
    if (state.mode !== "edit") return;
    if (count > 0 && !window.confirm(`¿Quitar a ${state.name}? Sus ${count} ítem${count === 1 ? "" : "s"} quedan sin nombre.`)) return;
    removePerson(state.name);
    onClose();
  };

  const title = state.mode === "add" ? "Personas de la mesa" : state.mode === "edit" ? state.name : line?.name ?? "Persona";
  const hint = state.mode === "add"
    ? "Escribe un nombre y Enter. Repite para cada persona."
    : state.mode === "edit" ? "Cambia el nombre o quita a la persona de la mesa." : "¿Para quién es?";
  const btn: React.CSSProperties = { height: 40, padding: "0 16px", borderRadius: 4, border: `1.5px solid ${C.ink}`, background: C.ink, color: C.paperLt, fontFamily: F.mono, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 };

  return (
    <Overlay onClose={onClose} align="center">
      <div role="dialog" aria-modal aria-label={title} style={{ width: "min(520px, 94vw)", maxHeight: "88dvh", display: "flex", flexDirection: "column", background: C.paperLt, border: `1.5px solid ${C.ink}`, borderRadius: 8, boxShadow: "0 30px 80px -30px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: F.slab, fontSize: 22, lineHeight: 1.1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{hint}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: "var(--pos-close)", height: "var(--pos-close)", borderRadius: "50%", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>

        <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {state.mode === "line" && (
            <PersonPicker value={line?.customer ?? null} onPick={(name) => { setLinePerson(state.idx, name); onClose(); }} onAdd={() => ref.current?.focus()} />
          )}
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", gap: 8 }}>
            <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={state.mode === "line" ? "Nombre nuevo" : "Nombre"} aria-label="Nombre de la persona" style={{ ...personInput, flex: 1 }} />
            <button type="submit" style={btn}>{state.mode === "edit" ? "Guardar" : "Agregar"}</button>
          </form>
          {state.mode === "add" && s.people.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.people.map((n) => <span key={n} style={{ ...personChip(n === s.activePerson), cursor: "default" }}>{n}<Count n={linesOf(s.order, n)} on={n === s.activePerson} /></span>)}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1.5px solid ${C.ink}`, padding: "12px 20px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          {state.mode === "edit" && (
            <button onClick={remove} style={{ height: 44, padding: "0 14px", borderRadius: 4, border: `1.5px solid ${C.red}`, background: "transparent", color: C.red, fontFamily: F.mono, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>Quitar persona</button>
          )}
          <button className="cmd-btn" onClick={onClose} style={{ flex: 1, height: 48, fontSize: 13, marginLeft: "auto" }}>{state.mode === "add" ? "Listo" : "Cerrar"}</button>
        </div>
      </div>
    </Overlay>
  );
}

export function TicketLine({ idx, line, onPerson }: { idx: number; line: OrderLine; onPerson: () => void }) {
  const s = usePos();
  const catalog = useCatalog();
  const unit = modLinePrice(line, catalog);
  const mods = modSummary(line, catalog);
  // A line with no options only opens the sheet once there are people to pick from.
  const editable = line.kind === "item" && !line.missing && (!!line.hasMods || s.people.length > 0);
  const open = () => { if (editable) posStore.set({ sheet: { mode: "edit", idx } }); };
  const showPerson = !!line.customer || s.people.length > 0;
  return (
    <div className={editable ? "pos-line" : undefined} style={{ padding: "10px 12px 10px 14px", borderBottom: `1px solid ${C.ruleSoft}`, opacity: line.missing ? 0.55 : 1 }}>
      {/* The person badge sits OUTSIDE the row's role="button": a control nested
          in a control merges into its accessible name and steals its clicks. */}
      {showPerson && (
        <div style={{ marginBottom: 4 }}>
          <button
            type="button"
            className="pos-linebadge"
            onClick={onPerson}
            aria-label={line.customer ? `Persona: ${line.customer}. Cambiar` : "Asignar persona"}
            style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", borderRadius: 2, cursor: "pointer", fontFamily: F.mono, background: "transparent", border: `1px solid ${line.customer ? C.red : C.rule}`, color: line.customer ? C.red : C.muted, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {line.customer ? `Pa' ${line.customer}` : "+ nombre"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined} onClick={open} onKeyDown={(e) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }} style={{ flex: 1, minWidth: 0, cursor: editable ? "pointer" : "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {line.kind === "combo" && <span style={{ fontSize: 8, color: C.green, border: `1px solid ${C.green}`, padding: "1px 3px", letterSpacing: ".06em", borderRadius: 2 }}>COMBO</span>}
          {line.missing && <span style={{ fontSize: 8, color: C.red, border: `1px solid ${C.red}`, padding: "1px 3px", letterSpacing: ".06em", borderRadius: 2 }}>NO DISPONIBLE</span>}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</span>
        </div>
        {line.kind === "combo" && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{catalog.comboById[line.id]?.desc}</div>}
        {mods.length > 0 && (
          <div style={{ fontSize: 11, color: C.ink2, marginTop: 3, lineHeight: 1.4 }}>
            {mods.map((m) => m.name + (m.delta > 0 ? ` (+${posMoney(m.delta)})` : "")).join(" · ")}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
          <span className="cmd-num">{posMoney(unit)}</span> c/u{editable && <span style={{ color: C.red, marginLeft: 8 }}>editar ▸</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => changeQty(idx, -1)} aria-label={line.qty === 1 ? "Quitar" : "Quitar uno"} style={qtyBtn}>{line.qty === 1 ? "×" : "−"}</button>
        <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, minWidth: 22, textAlign: "center" }}>{line.qty}</span>
        <button onClick={() => changeQty(idx, +1)} aria-label="Agregar uno" style={qtyBtn}>+</button>
      </div>
      <div className="cmd-num" style={{ fontSize: 14, fontWeight: 700, color: C.ink, minWidth: 70, textAlign: "right" }}>{posMoney(unit * line.qty)}</div>
      </div>
    </div>
  );
}
