"use client";

/**
 * Venta.dc.html — the ticket (.ticket): «Pedido nuevo» / «Pedido #folio»,
 * «Prepara <barista>», the name that goes on the cup, «Se lo llevamos»,
 * people chips, the lines, total and the pay buttons. Below 1024 px it is
 * the slide-over opened from the cart bar (`ticketOpen`).
 */
import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { claveNombre, partesCoincidencia, sugerirNombres, type NombreFrecuente } from "@/lib/pos/nombres";
import { useCatalog, usePos, posStore, orderTotal, modLinePrice, modSummary, clearTicket, setActivePerson, addPerson, nameTicket, renamePerson, removePerson, linesOf, startTender, savePending, discardPendingEdit, setSeLoLlevamos, nombrarUna, type OrderLine } from "../pos-store";
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
export function lineSub(line: OrderLine, catalog: Parameters<typeof modSummary>[1], opts: { sinNombre?: boolean } = {}): string {
  const parts: string[] = [];
  if (line.customer && !opts.sinNombre) parts.push(`Pa' ${line.customer}`);
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


// ════════════════════════════════════════════════════════════════
// Ticket
// ════════════════════════════════════════════════════════════════
export function Ticket() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const [editPerson, setEditPerson] = React.useState<string | null>(null);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [addingPerson, setAddingPerson] = React.useState(false);
  const [nombreDe, setNombreDe] = React.useState<number | null>(null);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const hasMissing = s.order.some((l) => l.missing);
  const canSend = s.order.length > 0 && !s.sending && !hasMissing;
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
        {/* One row: who it's for and who prepares. The rest of the panel is the list (owner, 2-nov-2026). */}
        <div className="ticket-h">
          <h1 id="tk" className="sr-only">{editing ? `Pedido #${editing.folio}` : "Pedido nuevo"}</h1>
          {editing && <span className="tk-folio">#{editing.folio}</span>}
          <div className="grow" style={{ minWidth: 0 }}><NameField /></div>
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
              {addingPerson && (
                <div className="tk-chips">
                  <PeopleChips onEdit={setEditPerson} adding={addingPerson} setAdding={setAddingPerson} />
                </div>
              )}
              <div ref={listRef} className="tk-lines scroll">
                <GruposPedido onNombre={setNombreDe} onEditPerson={setEditPerson} />
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
              {/* The extras, small and out of the list's way. */}
              <div className="tk-tools">
                <button type="button" className={"btn ghost sm" + (s.seLoLlevamos ? " on" : "")} aria-pressed={s.seLoLlevamos} onClick={() => setSeLoLlevamos(!s.seLoLlevamos)}>
                  {s.seLoLlevamos ? "✓ Se lo llevamos" : "Llevar"}
                </button>
                {s.people.length > 0 && !addingPerson && (
                  <button type="button" className="btn ghost sm" onClick={() => setAddingPerson(true)}>+ Persona</button>
                )}
                <button type="button" className="btn ghost sm" onClick={() => { if (noteOpen || s.note) { posStore.set({ note: "" }); setNoteOpen(false); } else setNoteOpen(true); }}>
                  {noteOpen || s.note ? "Quitar nota" : "Nota"}
                </button>
                <span className="grow" />
                {editing ? (
                  <button type="button" className="btn ghost sm" onClick={() => { if (window.confirm(`¿Descartar los cambios del pedido #${editing.folio}?`)) discardPendingEdit(); }}>Descartar</button>
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => { if (window.confirm("¿Vaciar el pedido?")) clearTicket(); }}>Vaciar</button>
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
          {/* Venta.dc.html: one «Pagar» (opens cash; transfer and datáfono are one tap away
              in its header) and «Pagar después». */}
          <button type="button" className="btn lg block" disabled={!canSend} onClick={() => startTender("efectivo")}>Pagar</button>
          <button type="button" className="btn ghost lg block pay-later" disabled={!canSend} onClick={() => void savePending()}>
            {s.sending ? "Guardando…" : editing ? "Guardar cambios" : "Pagar después"}
          </button>
        </div>
      </aside>
      {editPerson && <PersonSheet name={editPerson} onClose={() => setEditPerson(null)} />}
      {nombreDe !== null && s.order[nombreDe] && <NombreSheet idx={nombreDe} onClose={() => setNombreDe(null)} />}
    </>
  );
}

/** «Prepara <barista>» → «¿Quién prepara?». Hidden when the org has no team on the bar. */

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
  const [hi, setHi] = React.useState(0);
  const shown = focused ? text : current;
  const commit = (raw: string) => {
    const t = raw.trim();
    if (!current) { if (t) nameTicket(t); }
    else if (!t) removePerson(current);
    else if (t !== current) renamePerson(current, t);
  };
  const opciones = useOpcionesNombre(text, s.people.filter((p) => p !== current));
  const pick = (name: string, el?: HTMLInputElement | null) => { setText(name); commit(name); setFocused(false); el?.blur(); };
  return (
    <div className="nf">
      <input
        className="field"
        type="text"
        value={shown}
        onFocus={() => { setText(current); setFocused(true); setHi(0); }}
        onChange={(e) => { setText(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          const n = opciones.items.length;
          if (e.key === "ArrowDown" && n) { e.preventDefault(); setHi((h) => (h + 1) % n); }
          else if (e.key === "ArrowUp" && n) { e.preventDefault(); setHi((h) => (h - 1 + n) % n); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setText(current); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Enter") {
            e.preventDefault();
            const o = opciones.items[hi];
            if (o && text.trim()) pick(o.nombre, e.currentTarget); else (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => { if (focused) commit(text); setFocused(false); }}
        placeholder="¿A nombre de quién?"
        aria-label="Nombre del cliente"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused && opciones.items.length > 0}
        aria-controls="nf-list"
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="words"
        maxLength={40}
        style={{ height: 48 }}
      />
      {focused && (opciones.items.length > 0 || text.trim()) && (
        <ListaNombres id="nf-list" texto={text} opciones={opciones} hi={hi} onPick={(n) => pick(n)} />
      )}
    </div>
  );
}

/** What the name list offers for the text typed: matching names, or the most frequent ones while empty. */
function useOpcionesNombre(texto: string, excluir: ReadonlyArray<string>): { titulo: string; items: NombreFrecuente[] } {
  const nombres = useCatalog().nombres ?? [];
  const key = excluir.join("|");
  return React.useMemo(() => {
    const t = texto.trim();
    if (t) return { titulo: "Clientes frecuentes", items: sugerirNombres(t, nombres, { max: 3, excluir }) };
    const fuera = new Set(excluir.map(claveNombre));
    return { titulo: "Frecuentes", items: nombres.filter((n) => !fuera.has(claveNombre(n.nombre))).slice(0, 5) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excluir is compared by content (key)
  }, [texto, nombres, key]);
}

/**
 * The suggestions under a name field (NombreAuto.dc.html): the typed part in
 * bold, how many orders carried the name, and «Usar «…» · nombre nuevo».
 * Options pick on pointer-down so the field doesn't blur first.
 */
function ListaNombres({ id, texto, opciones, hi, onPick }: { id: string; texto: string; opciones: { titulo: string; items: NombreFrecuente[] }; hi: number; onPick: (name: string) => void }) {
  const t = texto.trim();
  const exacto = opciones.items.some((o) => claveNombre(o.nombre) === claveNombre(t));
  return (
    <div className="ac" id={id} role="listbox" aria-label="Nombres sugeridos">
      {opciones.items.length > 0 && <span className="acl">{opciones.titulo}</span>}
      {opciones.items.map((o, k) => {
        const [a, b, c] = partesCoincidencia(o.nombre, t);
        return (
          <button key={o.nombre} type="button" role="option" aria-selected={k === hi && !!t} className="opt2" onPointerDown={(e) => { e.preventDefault(); onPick(o.nombre); }}>
            <span className="avatar">{initials(o.nombre)}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="nm">{a}<b>{b}</b>{c}</span>
              <span className="ns">{o.veces} pedido{o.veces === 1 ? "" : "s"}</span>
            </span>
          </button>
        );
      })}
      {t && !exacto && (
        <button type="button" role="option" aria-selected={false} className="opt2 new" onPointerDown={(e) => { e.preventDefault(); onPick(t); }}>
          <span className="avatar plus">+</span>
          <span className="grow">Usar «{t}» · nombre nuevo</span>
        </button>
      )}
    </div>
  );
}

/**
 * Several customers on one order: one chip per person (lines count), the
 * active one gets what is added next; tapping the active chip edits it.
 * «+ persona» adds another inline.
 */
function PeopleChips({ onEdit, adding, setAdding }: { onEdit: (name: string) => void; adding: boolean; setAdding: (v: boolean) => void }) {
  const s = usePos();
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

/**
 * Name ONE drink: someone already on the order, a new name, or no name.
 * A line of several gives away just one (nombrarUna splits it).
 */
function NombreSheet({ idx, onClose }: { idx: number; onClose: () => void }) {
  const s = usePos();
  const line = s.order[idx];
  const [text, setText] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef<HTMLInputElement>(null);
  const enPedido = s.people.filter((p) => p !== line?.customer);
  const opciones = useOpcionesNombre(text, s.people);
  const frecuentes = useOpcionesNombre("", s.people).items.slice(0, 6);
  if (!line) return null;
  const pick = (name: string | null) => { nombrarUna(idx, name); onClose(); };
  return (
    <Overlay onClose={onClose} labelledBy="nb-t" maxWidth={600}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div className="grow">
          <h2 id="nb-t" className="h1">¿Para quién es este {line.name}?</h2>
          <span className="muted" style={{ fontSize: 15 }}>
            {line.qty > 1 ? `Hay ${line.qty} en el pedido · se separa 1` : "1 en el pedido"} · {line.customer ? `hoy: ${line.customer}` : "hoy sin nombre"}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {enPedido.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">En este pedido</span>
          <div className="pchips" role="group" aria-label="Personas del pedido">
            {enPedido.map((p) => (
              <button key={p} type="button" className="pchip" onClick={() => pick(p)}>
                <span className="avatar">{initials(p)}</span>{p} <span className="muted" style={{ fontWeight: 600 }}>{linesOf(s.order, p)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="label" htmlFor="nb-x">Otro nombre</label>
        <div className="nf">
          <input
            id="nb-x"
            ref={ref}
            className="field"
            value={text}
            onChange={(e) => { setText(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              const n = opciones.items.length;
              if (e.key === "ArrowDown" && n) { e.preventDefault(); setHi((h) => (h + 1) % n); }
              else if (e.key === "ArrowUp" && n) { e.preventDefault(); setHi((h) => (h - 1 + n) % n); }
              else if (e.key === "Enter" && text.trim()) { e.preventDefault(); pick(opciones.items[hi]?.nombre ?? text); }
            }}
            maxLength={40}
            placeholder="Escribe un nombre"
            aria-label="Nombre nuevo"
            aria-controls="nb-list"
            autoCapitalize="words"
            autoComplete="off"
            style={{ height: 56, fontSize: 18 }}
          />
          {text.trim() && <ListaNombres id="nb-list" texto={text} opciones={opciones} hi={hi} onPick={(n) => pick(n)} />}
        </div>
      </div>
      {!text.trim() && frecuentes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">Frecuentes</span>
          <div className="pchips" role="group" aria-label="Clientes frecuentes">
            {frecuentes.map((f) => <button key={f.nombre} type="button" className="pchip new" onClick={() => pick(f.nombre)}>{f.nombre}</button>)}
          </div>
        </div>
      )}
      {line.customer && <button type="button" className="btn ghost block" style={{ height: 52 }} onClick={() => pick(null)}>Sin nombre</button>}
    </Overlay>
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
export function TicketLine({ idx, line, onNombre, enGrupo = false }: { idx: number; line: OrderLine; onNombre?: (idx: number) => void; enGrupo?: boolean }) {
  const catalog = useCatalog();
  const unit = modLinePrice(line, catalog);
  const sub = lineSub(line, catalog, { sinNombre: !!onNombre });
  // The name is its own button beside the line (never nested in it): «Pa' Ana» or «+ Nombre».
  const nombre = onNombre && enGrupo && line.customer ? (
    <button type="button" className="move" onClick={() => onNombre(idx)} aria-label={`${line.name} es para ${line.customer}. Pasar a otra persona o quitar nombre`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
    </button>
  ) : onNombre ? (
    <button type="button" className={"who-pill" + (line.customer ? " on" : "")} onClick={() => onNombre(idx)} aria-label={line.customer ? `${line.name} es para ${line.customer}. Cambiar o quitar nombre` : `Ponerle nombre a ${line.name}`}>
      {line.customer ? `Pa' ${line.customer}` : "+ Nombre"}
    </button>
  ) : null;
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
  const row = !editable
    ? <div className="line" style={line.missing ? { opacity: 0.6 } : undefined}>{body}</div>
    : (
      <button type="button" className="line" onClick={() => posStore.set({ sheet: { mode: "edit", idx } })} aria-label={`${line.qty} ${line.name}${sub ? `, ${sub}` : ""}, ${money(unit * line.qty)}. Editar`}>
        {body}
      </button>
    );
  if (!nombre) return row;
  return <div className="line-row">{row}{nombre}</div>;
}

/**
 * The order as the bar reads it (NombreAuto.dc.html): one group per person —
 * «Pa' Laura · 2 ítems · $ 15.500», the active one highlighted — and «Sin
 * nombre» last. Tapping a group header makes that person the one new items
 * go to (tapping it again renames). Lines without a name carry «+ Nombre»;
 * named ones a ↔ to give that drink to someone else. No names yet: a flat list.
 */
function GruposPedido({ onNombre, onEditPerson }: { onNombre: (idx: number) => void; onEditPerson: (name: string) => void }) {
  const s = usePos();
  const catalog = useCatalog();
  const idxs = s.order.map((_, i) => i);
  if (!s.order.some((l) => l.customer)) {
    return <>{idxs.map((i) => <TicketLine key={i} idx={i} line={s.order[i]} onNombre={onNombre} />)}</>;
  }
  const quienes = [...s.people.filter((p) => s.order.some((l) => l.customer === p)), ...[...new Set(s.order.map((l) => l.customer).filter((c): c is string => !!c && !s.people.includes(c)))]];
  const grupos = [
    ...quienes.map((p) => ({ key: p, nombre: p as string | null, lineas: idxs.filter((i) => s.order[i].customer === p) })),
    { key: "", nombre: null, lineas: idxs.filter((i) => !s.order[i].customer) },
  ].filter((g) => g.lineas.length);
  return (
    <>
      {grupos.map((g) => {
        const on = !!g.nombre && s.activePerson === g.nombre;
        const n = g.lineas.reduce((a, i) => a + s.order[i].qty, 0);
        const sub = g.lineas.reduce((a, i) => a + modLinePrice(s.order[i], catalog) * s.order[i].qty, 0);
        return (
          <div key={g.key} className={"tk-grp" + (on ? " on" : "")} role="group" aria-label={g.nombre ? `Pa' ${g.nombre}` : "Sin nombre"}>
            {g.nombre ? (
              <button type="button" className="tk-gh" onClick={() => (on ? onEditPerson(g.nombre!) : setActivePerson(g.nombre))} aria-label={on ? `Pa' ${g.nombre}: lo nuevo va para ${g.nombre}. Cambiar nombre` : `Agregar lo siguiente para ${g.nombre}`}>
                <span className="avatar">{initials(g.nombre)}</span>
                <span className="grow" style={{ minWidth: 0 }}>Pa&apos; {g.nombre}</span>
                <span className="gs">{n} ítem{n === 1 ? "" : "s"} · {money(sub)}</span>
              </button>
            ) : (
              <div className="tk-gh muted">
                <span className="avatar none">?</span>
                <span className="grow">Sin nombre</span>
                <span className="gs">{n} ítem{n === 1 ? "" : "s"} · {money(sub)}</span>
              </div>
            )}
            {g.lineas.map((i) => <TicketLine key={i} idx={i} line={s.order[i]} onNombre={onNombre} enGrupo />)}
          </div>
        );
      })}
    </>
  );
}

/** Tile badge helper for the catalog: how many of a product are on the ticket. */
export function qtyOnTicket(order: ReadonlyArray<OrderLine>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of order) out[l.id] = (out[l.id] ?? 0) + l.qty;
  return out;
}

