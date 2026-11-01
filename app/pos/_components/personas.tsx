"use client";

/**
 * Personas.dc.html — /pos/pedidos/<id>/personas. A stored order split by
 * person: pick a person, then tap the lines that are theirs (saved on the
 * order at once — the number and the payments stay); on the right each person
 * pays their share (Efectivo / Transferencia go to the pay pages, which come
 * back here after a partial payment), or the rest is charged in one go.
 */
import * as React from "react";
import { shareStatus } from "@/lib/pos/pagos";
import { folioTag } from "@/lib/pos/pending";
import {
  usePos,
  ticketShares,
  ticketTotal,
  modLinePrice,
  modSummary,
  setActivePerson,
  assignLinePersona,
  addPersonaToOrder,
  closePersonas,
  payShare,
  openOrdenes,
  type PosState,
} from "../pos-store";
import { Clock, methodWord, money } from "./ordenes";
import { useEscape } from "./cancelar";

const initials = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toLocaleUpperCase("es") || "?";

/** Payments made per person (null = the lines nobody claimed). */
function paidBy(s: PosState, who: string | null): number {
  return (s.pending?.pagos ?? []).filter((p) => (p.customer || null) === who).reduce((n, p) => n + p.amount, 0);
}

export function PersonasPage() {
  const s = usePos();
  useEscape(closePersonas);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const asideRef = React.useRef<HTMLElement>(null);

  if (!s.pending) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header className="topbar">
          <button type="button" className="icon-btn" onClick={() => openOrdenes()} aria-label="Volver a Pedidos">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <h1 className="h2">Pedidos</h1>
          <span className="grow" />
          <Clock />
        </header>
        <div className="empty"><span style={{ fontSize: 17, fontWeight: 600 }}>Cargando el pedido…</span></div>
      </div>
    );
  }

  const p = s.pending;
  const remaining = ticketTotal(s);
  const shares = ticketShares(s);
  const pagos = p.pagos;
  const settled = remaining <= 0;
  const busy = s.sending;
  // A person who already paid keeps their lines: moving them would change what they paid for.
  const lockedFor = (who: string | null) => paidBy(s, who) > 0;
  const active = s.activePerson;

  const addNew = () => {
    const name = addPersonaToOrder(draft);
    if (name) {
      setDraft("");
      setAdding(false);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
        <img className="logo" src="/icons/icon.svg" alt="" style={{ width: 36, height: 36 }} />
        <span className="grow" />
        <button type="button" className="btn ghost sm badge-btn" onClick={() => openOrdenes()}>
          Pedidos{s.pendientes.length > 0 && <span className="badge" aria-label={`${s.pendientes.length} pendientes`}>{s.pendientes.length}</span>}
        </button>
        <Clock />
      </header>

      <div className="sale personas">
        <section className="card grow" aria-labelledby="pp" style={{ gap: 16, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="grow">
              <h1 id="pp" className="h1">Pedido {folioTag(p.folio)} · Personas</h1>
              <span className="muted" style={{ fontSize: 15 }}>Cada persona recibe sus propias etiquetas</span>
            </div>
            <button type="button" className="btn ghost sm" onClick={closePersonas}>Volver</button>
          </div>

          <div className="chips" role="group" aria-label="Personas en el pedido">
            {s.people.map((name) => {
              const n = s.order.reduce((k, l) => k + (l.customer === name ? 1 : 0), 0);
              const paid = lockedFor(name);
              return (
                <button
                  key={name}
                  type="button"
                  className="chip reason"
                  aria-pressed={active === name}
                  disabled={paid}
                  title={paid ? `${name} ya pagó` : undefined}
                  onClick={() => setActivePerson(active === name ? null : name)}
                  style={paid ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                >
                  {name} · {n}{paid ? " · pagó" : ""}
                </button>
              );
            })}
            {adding ? (
              <form onSubmit={(e) => { e.preventDefault(); addNew(); }} style={{ display: "flex", gap: 8 }}>
                <input
                  className="field"
                  autoFocus
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { if (!draft.trim()) setAdding(false); }}
                  placeholder="Nombre"
                  aria-label="Nombre de la persona"
                  style={{ height: 44, width: 180 }}
                />
                <button type="submit" className="btn sm" disabled={!draft.trim()} style={{ height: 44 }}>Agregar</button>
              </form>
            ) : (
              <button type="button" className="chip reason" onClick={() => setAdding(true)} style={{ borderStyle: "dashed" }}>+ Persona</button>
            )}
          </div>

          <p className="muted" style={{ fontSize: 14 }}>Toca una persona y luego las líneas que son suyas.</p>

          <div className="scroll" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {s.order.map((l, i) => {
              const who = l.customer ?? null;
              const locked = lockedFor(who);
              const mine = !!active && who === active;
              const canTap = !!active && !locked && !busy;
              const subs = modSummary(l, s.catalog).map((m) => m.name).join(" · ");
              return (
                <div key={i} className="line">
                  <span className="q">{l.qty}</span>
                  <span className="grow"><span className="ln" style={{ display: "block" }}>{l.name}</span>{subs && <span className="ls">{subs}</span>}</span>
                  <button
                    type="button"
                    className={`who-chip${mine ? " a" : ""}`}
                    disabled={!canTap}
                    onClick={() => assignLinePersona(i, mine ? null : active)}
                    aria-label={locked ? `${who ?? "Sin nombre"} ya pagó esta línea` : who ? `Asignado a ${who}, cambiar` : "Sin asignar, asignar"}
                    style={!canTap && !locked && !active ? { cursor: "default" } : locked ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                  >
                    {who ?? <span className="muted">Sin asignar</span>}
                  </button>
                  <span className="lp">{money(modLinePrice(l, s.catalog) * l.qty)}</span>
                </div>
              );
            })}
          </div>

          {s.sendError && <div role="alert" style={{ color: "var(--late)", fontSize: 15, fontWeight: 600 }}>{s.sendError}</div>}
          <div className="grow" />
          <div className="pay2">
            <button type="button" className="btn ghost lg" disabled={settled || busy} onClick={() => payShare({ kind: "rest" }, "efectivo")}>
              Cobrar todo junto · {money(remaining)}
            </button>
            <button type="button" className="btn lg" aria-pressed="true" onClick={() => asideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Dividir por persona
            </button>
          </div>
        </section>

        <aside ref={asideRef} className="ticket personas-split" aria-labelledby="dv" style={{ width: 440 }}>
          <div className="ticket-h">
            <h2 id="dv" className="h2 grow">Dividir por persona</h2>
            {settled ? <span className="pill ok">Pagado</span> : <span className="pill brand">Falta por cobrar {money(remaining)}</span>}
          </div>
          <div className="ticket-b scroll" style={{ gap: 12, paddingTop: 14, paddingBottom: 14 }}>
            {shares.map((sh) => {
              const st = shareStatus(sh, pagos, settled);
              const due = Math.max(0, sh.amount - st.paid);
              // The cups that carry this person's labels (prepared drinks only).
              const drinks = s.order.filter((l) => (l.customer ?? null) === sh.customer && l.kind === "item" && s.catalog.byId[l.id]?.printsLabel);
              return (
                <div key={sh.customer ?? "—"} className="card tight" style={{ gap: st.done ? 8 : 10, flexShrink: 0, ...(st.done ? { borderColor: "var(--ok)" } : {}) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{initials(sh.label)}</span>
                    <span className={`title grow${sh.customer ? "" : " muted"}`}>{sh.label}</span>
                    {st.done
                      ? <span className="pill ok">Pagado{st.last ? ` · ${methodWord(st.last.method)}` : ""}</span>
                      : st.paid > 0
                        ? <span className="pill brand">Pagó {money(st.paid)}</span>
                        : <span className="pill brand">Sin pagar</span>}
                  </div>
                  {sh.items.map((it, k) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 15 }}>
                      <span className="muted">{it.qty > 1 ? `${it.qty} × ` : ""}{it.name}</span>
                      <span className="num">{money(it.qty * it.unitPrice)}</span>
                    </div>
                  ))}
                  {st.done ? (
                    sh.customer && drinks.length > 0 && (
                      <div style={{ fontSize: 13 }}><span className="muted">Etiquetas: Pa&apos; {sh.customer} · QR · {drinks.map((d) => d.name).join(", ")}</span></div>
                    )
                  ) : (
                    <>
                      <div className="total" style={{ paddingTop: 4 }}><span className="t">{sh.customer ? `${sh.customer} paga` : "Sin nombre paga"}</span><span className="v" style={{ fontSize: 26 }}>{money(due)}</span></div>
                      <div className="pay2">
                        <button type="button" className="btn" disabled={busy || due <= 0} onClick={() => payShare({ kind: "share", customer: sh.customer }, "efectivo")}>Efectivo</button>
                        <button type="button" className="btn strong" disabled={busy || due <= 0} onClick={() => payShare({ kind: "share", customer: sh.customer }, "transferencia")}>Transferencia</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!settled && (
            <div className="ticket-f">
              <button type="button" className="btn lg block" disabled={busy} onClick={() => payShare({ kind: "rest" }, "efectivo")}>Cobrar el resto · {money(remaining)}</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
