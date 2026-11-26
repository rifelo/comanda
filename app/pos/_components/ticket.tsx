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
import { sugerenciasEfectivo } from "@/lib/pos/efectivo";
import { useCatalog, usePos, posStore, orderTotal, modLinePrice, modSummary, clearTicket, nameTicket, renamePerson, removePerson, startTender, savePending, discardPendingEdit, setSeLoLlevamos, nombrarUna, changeQty, setLineSingle, quickCash, type OrderLine } from "../pos-store";
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
  const [noteOpen, setNoteOpen] = React.useState(false);
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
              <div ref={listRef} className="tk-lines scroll">
                {s.order.map((l, i) => <LineaRapida key={i} idx={i} line={l} />)}
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
          {/* Pedido rápido: cash is one tap — «Exacto» or the bill handed over — and the
              change shows on the receipt screen. «Otro monto» opens the keypad. */}
          <span className="qc-l">Efectivo · toca lo que te entregan</span>
          <div className="qc" role="group" aria-label="Cobrar en efectivo">
            <button type="button" className="btn" disabled={!canSend} onClick={() => quickCash(total)}>Exacto</button>
            {(empty ? [] : sugerenciasEfectivo(total)).map((n) => (
              <button key={n} type="button" className="btn" disabled={!canSend} onClick={() => quickCash(n)}>{money(n)}</button>
            ))}
            <button type="button" className="btn ghost" disabled={!canSend} onClick={() => startTender("efectivo")}>Otro monto</button>
          </div>
          <div className="pay2 qc-m" role="group" aria-label="Otras formas de pago">
            <button type="button" className="btn ghost" disabled={!canSend} onClick={() => startTender("transferencia")}>Transferencia</button>
            <button type="button" className="btn ghost" disabled={!canSend} onClick={() => startTender("datafono")}>Datáfono</button>
            <button type="button" className="btn ghost" disabled={!canSend} onClick={() => void savePending()}>
              {s.sending ? "Guardando…" : editing ? "Guardar cambios" : "Pagar después"}
            </button>
          </div>
        </div>
      </aside>
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
  // One name = the order's name. With several (each drink has its own, on its line)
  // the field lists them and a new name here is the person the next drinks are for.
  const varios = s.people.length > 1;
  const current = varios ? "" : s.people[0] ?? "";
  const [text, setText] = React.useState(current);
  const [focused, setFocused] = React.useState(false);
  // −1 = nothing highlighted: Enter saves what was typed. Arrows move onto a suggestion.
  const [hi, setHi] = React.useState(-1);
  // Enter / a tapped suggestion already saved: the blur that follows must not save again.
  const hecho = React.useRef(false);
  const shown = focused ? text : current;
  const commit = (raw: string) => {
    const t = raw.trim();
    if (!current) { if (t) nameTicket(t); }
    else if (!t) removePerson(current);
    else if (t !== current) renamePerson(current, t);
  };
  const opciones = useOpcionesNombre(text, varios ? s.people : s.people.filter((p) => p !== current));
  const ref = React.useRef<HTMLInputElement>(null);
  const pick = (name: string) => { hecho.current = true; setText(name); commit(name); setFocused(false); ref.current?.blur(); };
  return (
    <div className="nf">
      <input
        ref={ref}
        className="field"
        type="text"
        value={shown}
        onFocus={() => { hecho.current = false; setText(current); setFocused(true); setHi(-1); }}
        onChange={(e) => { setText(e.target.value); setHi(-1); }}
        onKeyDown={(e) => {
          const n = opciones.items.length;
          if (e.key === "ArrowDown" && n) { e.preventDefault(); setHi((h) => (h + 1) % n); }
          else if (e.key === "ArrowUp" && n) { e.preventDefault(); setHi((h) => (h <= 0 ? n - 1 : h - 1)); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hecho.current = true; setText(current); setFocused(false); e.currentTarget.blur(); }
          else if (e.key === "Enter") {
            e.preventDefault();
            pick(opciones.items[hi]?.nombre ?? text);
          }
        }}
        onBlur={() => { if (!hecho.current) commit(text); hecho.current = false; setFocused(false); }}
        placeholder={varios ? s.people.join(", ") : "Nombre para todo el pedido"}
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
 * One drink on the ticket (pedido rápido): name and price, its either/or
 * options as buttons right on the line (size, milk, base), and «Pa' …» — the
 * name that prints on its cup label. Tapping the name opens every option.
 */
function LineaRapida({ idx, line }: { idx: number; line: OrderLine }) {
  const catalog = useCatalog();
  const unit = modLinePrice(line, catalog);
  const p = line.kind === "item" ? catalog.byId[line.id] : undefined;
  const editable = line.kind === "item" && !line.missing;
  // Either/or groups (entera / deslactosada, 12 / 16 oz) fit on the line; the rest stay in «Opciones».
  const grupos = (editable && p ? p.mods : []).map((gid) => catalog.modGroups[gid]).filter((g) => g && g.type === "single" && g.options.length === 2);
  const enLinea = new Set(grupos.map((g) => g.id));
  const otros = modSummary(line, catalog).filter((m) => !enLinea.has(m.group)).map((m) => m.name);
  const masOpciones = !!p && p.mods.some((gid) => !enLinea.has(gid));
  const sub = [
    line.kind === "combo" ? (catalog.comboById[line.id]?.items.map((id) => catalog.byId[id]?.name).filter(Boolean).join(" + ") || null) : null,
    otros.length ? otros.join(", ") : null,
  ].filter(Boolean).join(" · ");
  const abrir = () => posStore.set({ sheet: { mode: "edit", idx } });
  const conNombre = !line.missing && !!p?.printsLabel;
  return (
    <div className="ql" style={line.missing ? { opacity: 0.6 } : undefined}>
      <div className="ql-top">
        {line.qty > 1 && <span className="q">{line.qty}</span>}
        <div className="ql-n">
          <span className="ln">
            {line.missing && <span className="pill late" style={{ marginRight: 6 }}>No disponible</span>}
            {line.kind === "combo" && <span className="save" style={{ marginRight: 6 }}>Combo</span>}
            {line.name}
          </span>
          <span className="ls"><b className="lp">{money(unit * line.qty)}</b>{sub ? ` · ${sub}` : ""}</span>
        </div>
        {conNombre && <CampoNombre idx={idx} line={line} />}
        <button type="button" className="ql-x" onClick={() => changeQty(idx, -1)} aria-label={`Quitar un ${line.name}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
        </button>
      </div>
      {(grupos.length > 0 || masOpciones) && (
        <div className="ql-opts">
          {grupos.map((g) => {
            const sel = line.mods?.[g.id];
            return (
              <div key={g.id} className="seg" role="group" aria-label={g.name}>
                {g.options.map((o) => {
                  const on = sel === o.name;
                  return (
                    <button key={o.name} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => setLineSingle(idx, g.id, on && !g.required ? null : o.name)}>
                      {o.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {masOpciones && <button type="button" className="ql-mas" onClick={abrir}>Opciones</button>}
        </div>
      )}
    </div>
  );
}

/**
 * «Pa' …» on a ticket line. Enter saves exactly what was typed and jumps to
 * the next drink without a name; leaving the field saves too. The chips are
 * the people already on the order and the frequent customers that match.
 * A line of several gives the name to one (nombrarUna splits it).
 */
function CampoNombre({ idx, line }: { idx: number; line: OrderLine }) {
  const s = usePos();
  const actual = line.customer ?? "";
  const [text, setText] = React.useState(actual);
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  // Enter / a chip already saved: the blur that follows must not save again.
  const hecho = React.useRef(false);
  const t = text.trim();
  const frecuentes = useOpcionesNombre(text, s.people).items.map((f) => f.nombre);
  const enPedido = s.people.filter((p) => p !== actual && (!t || claveNombre(p).startsWith(claveNombre(t))));
  const chips = [...enPedido, ...frecuentes].slice(0, 4);
  const guardar = (raw: string) => {
    const n = raw.trim();
    if (n !== actual) nombrarUna(idx, n || null);
  };
  // After the store settles: the next drink still without a name (this one again when it was split).
  const siguiente = () => window.setTimeout(() => {
    const el = ref.current;
    const vacios = [...document.querySelectorAll<HTMLInputElement>(".ticket input[data-nm='0']")];
    const next = vacios.find((c) => Number(c.dataset.idx) >= idx) ?? vacios[0];
    if (next && next === el) hecho.current = false;
    else if (next) next.focus();
    else el?.blur();
  }, 0);
  const listo = (name: string) => { hecho.current = true; guardar(name); setText(""); siguiente(); };
  return (
    <div className={"nmf" + (focused ? " on" : "") + (actual ? " has" : "")}>
      <label className="nmf-in">
        <span className="nmf-pa">Pa&apos;</span>
        <input
          ref={ref}
          data-nm={actual ? "1" : "0"}
          data-idx={idx}
          type="text"
          value={focused ? text : actual}
          onFocus={(e) => {
            hecho.current = false; setText(actual); setFocused(true);
            // The on-screen keyboard shrinks the page: keep the field (and its chips) in view.
            const el = e.currentTarget;
            window.setTimeout(() => el.closest(".ql")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); listo(text); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hecho.current = true; e.currentTarget.blur(); }
          }}
          onBlur={() => { if (!hecho.current) guardar(text); hecho.current = false; setFocused(false); }}
          placeholder="¿quién?"
          aria-label={`Nombre en la etiqueta de ${line.name}`}
          enterKeyHint="next"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={40}
        />
      </label>
      {focused && chips.length > 0 && (
        <div className="nmf-chips" role="group" aria-label="Nombres sugeridos">
          {chips.map((n) => (
            <button key={n} type="button" onPointerDown={(e) => { e.preventDefault(); listo(n); }}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tile badge helper for the catalog: how many of a product are on the ticket. */
export function qtyOnTicket(order: ReadonlyArray<OrderLine>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of order) out[l.id] = (out[l.id] ?? 0) + l.qty;
  return out;
}

