"use client";

/**
 * Venta.dc.html — the POS top bar: logo · person chip · printer status ·
 * (register: connection) · Pedidos · «⋯» · clock. Everything that isn't a
 * sale lives behind «⋯» (.menu) so the bar fits a 390 px phone.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { signOutLocal } from "@/app/login/actions";
import { desvincularPos } from "../actions";
import { StationCtx, usePos, posStore, openOrdenes, closeOrdenes, openEtiquetas, openPuntos, openVentas, setBarista, closeBaristaPicker } from "../pos-store";
import { printTicketTest, setTicketSettings, useTicketPrinter, type TicketSettings } from "@/lib/printer/tickets";
import { usePrinter, connectPrinter, checkPrinter, printTestLabel, relaysLabels, type PrinterStatus } from "@/lib/printer/serial";
import { useDesktopApp, installApp, toggleFullscreen } from "@/lib/pwa/desktop";
import { setDark, useIsDark } from "../pos-theme";
import { C, F } from "./theme";
import { initials, Overlay, useNow } from "./ticket";

// ════════════════════════════════════════════════════════════════
// Top bar
// ════════════════════════════════════════════════════════════════
export function TopBar({ mode }: { mode: "device" | "user" }) {
  return (
    <header className="topbar">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
      <img className="logo" src="/icons/icon.svg" alt="Café Pa' Yo" style={{ width: 36, height: 36, borderRadius: 9 }} />
      <PersonChip mode={mode} />
      <span className="grow" />
      <PrinterStatusChip />
      <ConnectionStatus />
      <VentasButton />
      <PedidosButton />
      <MoreMenu mode={mode} />
      <Clock />
    </header>
  );
}

/** H:MM in Bogotá (UTC−5, no DST). Empty on the server: no hydration mismatch. */
function Clock() {
  const now = useNow();
  if (!now) return <span className="clock" />;
  const d = new Date(now - 5 * 3600_000);
  return <span className="clock">{d.getUTCHours()}:{String(d.getUTCMinutes()).padStart(2, "0")}</span>;
}

/** «Hoy en ventas» (bar chart icon) next to Pedidos; on a phone it lives only in «⋯». */
function VentasButton() {
  return (
    <button type="button" className="icon-btn tb-ventas" onClick={openVentas} aria-label="Hoy en ventas" title="Hoy en ventas">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 20V12M12 20V5M19 20v-9" /></svg>
    </button>
  );
}

/** «Pedidos» with the count of orders not completed yet (open + queued in this register). */
function PedidosButton() {
  const s = usePos();
  const n = s.pendientes.length + s.outbox.length;
  const on = s.view === "ordenes";
  return (
    <button type="button" className="btn ghost sm badge-btn" onClick={() => (on ? closeOrdenes() : openOrdenes())} aria-label={n ? `Pedidos, ${n} pendientes` : "Pedidos"}>
      Pedidos
      {n > 0 && <span className="badge" aria-hidden>{n}</span>}
    </button>
  );
}

/** Register size only (CSS): «En línea · N en cola». */
function ConnectionStatus() {
  const s = usePos();
  const n = s.outbox.length;
  return (
    <span className="status reg-only">
      <span className="led" style={{ background: s.online ? "var(--ok)" : "var(--late)" }} />
      {s.online ? "En línea" : "Sin conexión"} · {n} en cola
    </span>
  );
}

const PrinterIcon = () => (
  <svg className="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9V4h12v5" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v6H7z" /></svg>
);

/** What a tap on the printer does in its current state (shared by the status chip, the toast and «⋯»). */
export function printerAction(status: PrinterStatus): { label: string; run: (() => void) | null } {
  if (status === "disconnected" || status === "error") return { label: "Conectar la impresora", run: () => void connectPrinter() };
  if (status === "ready") return { label: "Imprimir etiqueta de prueba", run: printTestLabel };
  if (status === "off") return { label: "¿Ya la encendiste? Reintentar", run: () => void checkPrinter() };
  return { label: status === "printing" ? "Imprimiendo…" : "Conectando…", run: null };
}

/** «Niimbot B21S» (ok) or «Impresora desconectada · Reconectar» (bad → connect). */
function PrinterStatusChip() {
  const p = usePrinter();
  if (p.status === "unsupported") {
    // The tablet: its labels print on the register.
    if (!relaysLabels(p)) return null;
    return (
      <span className="status ok" aria-label="Las etiquetas salen en la caja" title={p.relayNote ?? undefined}>
        <span className="led" /><PrinterIcon /><span className="txt">Etiquetas en la caja</span>
      </span>
    );
  }
  if (p.status === "ready" || p.status === "printing") {
    return (
      <span className="status ok" aria-label="Impresora conectada" title={p.note ?? undefined}>
        <span className="led" /><PrinterIcon /><span className="txt">{p.status === "printing" ? "Imprimiendo…" : "Niimbot B21S"}{p.queued > 0 ? ` · ${p.queued} en cola` : ""}</span>
      </span>
    );
  }
  if (p.status === "connecting") {
    return <span className="status" aria-label="Conectando la impresora"><span className="led" /><PrinterIcon /><span className="txt">Conectando…</span></span>;
  }
  const off = p.status === "off";
  const label = off ? "Impresora apagada · Reintentar" : "Impresora desconectada · Reconectar";
  return (
    <button type="button" className="status bad" onClick={() => (off ? void checkPrinter() : void connectPrinter())} aria-label={label} title={p.note ?? undefined}>
      <span className="led" /><PrinterIcon /><span className="txt">{label}</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// Persona (single login) — chip + «Cambiar persona»
// ════════════════════════════════════════════════════════════════
function PersonChip({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  const [open, setOpen] = React.useState(false);
  const p = s.person;
  if (!p) return null;
  const first = p.name.split(" ")[0] || p.name;
  return (
    <>
      <button type="button" className="chip" onClick={() => setOpen(true)} aria-label={`${p.name}. Cambiar persona`}>
        <span className="avatar">{initials(p.name)}</span>
        {first}
        <span className="act">Cambiar<span className="act-long"> persona</span></span>
      </button>
      {open && <SessionSheet onClose={() => setOpen(false)} mode={mode} />}
    </>
  );
}

function SessionSheet({ onClose, mode }: { onClose: () => void; mode: "device" | "user" }) {
  const s = usePos();
  const p = s.person;
  if (!p) return null;
  const busy = s.order.length > 0 || s.outbox.some((j) => j.status === "sending");
  return (
    <Overlay onClose={onClose} labelledBy="ses-t" maxWidth={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>{initials(p.name)}</span>
        <div className="grow">
          <h2 id="ses-t" className="h2">{p.name}</h2>
          <span className="muted" style={{ fontSize: 15 }}>{p.role === "admin" ? "Administrador" : "Equipo"} · las ventas quedan a tu nombre</span>
        </div>
      </div>
      {busy && (
        <p role="alert" className="pill brand" style={{ height: "auto", padding: "12px 14px", borderRadius: 12, whiteSpace: "normal", fontSize: 15, lineHeight: 1.45 }}>
          Hay un pedido en curso. Si cambias de persona ahora, el ticket se pierde; los pedidos ya enviados no.
        </p>
      )}
      <form action={signOutLocal}>
        {/* The next person signs in and lands back on the register. */}
        <input type="hidden" name="next" value="/pos" />
        <button type="submit" className="btn strong block">Cambiar persona</button>
      </form>
      <div style={{ display: "flex", gap: 12 }}>
        <a className="btn ghost" style={{ flex: 1 }} href={p.role === "admin" && mode === "user" ? "/hoy" : "/turno"}>
          {p.role === "admin" && mode === "user" ? "Ir al panel" : "Ir a la tablet del turno"}
        </a>
        <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
      </div>
    </Overlay>
  );
}

// ════════════════════════════════════════════════════════════════
// «⋯» — everything that isn't a sale
// ════════════════════════════════════════════════════════════════
function MoreMenu({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  const p = usePrinter();
  const d = useDesktopApp();
  const dark = useIsDark();
  const station = React.useContext(StationCtx);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const act = printerAction(p.status);
  const go = (fn: () => void) => () => { setOpen(false); fn(); };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  async function unlink() {
    if (unlinking) return;
    if (!window.confirm(`¿Desvincular «${station}»? Necesitarás un código nuevo para volver a usarla como caja.`)) return;
    setUnlinking(true);
    await desvincularPos();
    // Not inside startTransition (Next 16: router.push/refresh there can hang the pending state).
    router.refresh();
  }
  const admin = s.person?.role === "admin" && mode === "user";

  return (
    <>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Más herramientas" aria-haspopup="menu" aria-expanded={open}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && (
        <>
          <button type="button" className="menu-shade" aria-label="Cerrar menú" tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="menu" role="menu" aria-label="Más herramientas">
            <button type="button" role="menuitem" onClick={go(openVentas)}>Hoy en ventas</button>
            <button type="button" role="menuitem" onClick={go(openEtiquetas)}>Etiquetas</button>
            <button type="button" role="menuitem" onClick={go(openPuntos)}>Puntos y reseñas</button>
            <button type="button" role="menuitem" onClick={go(() => posStore.set((st) => ({ ...st, aiOpen: !st.aiOpen })))}>
              {s.aiOpen ? "Cerrar el asistente de voz" : "Asistente de voz"}
            </button>
            {p.status !== "unsupported" && (
              <button type="button" role="menuitem" disabled={!act.run} onClick={go(() => act.run?.())}>
                Impresora: {p.status === "ready" ? "probar" : p.status === "off" ? "reintentar" : act.run ? "conectar" : act.label.toLowerCase()}
              </button>
            )}
            <hr />
            <TicketMenuItems onTest={go(() => printTicketTest(s.catalog.orgName))} />
            <hr />
            <button type="button" role="menuitemcheckbox" aria-checked={!!dark} onClick={() => setDark(!dark)}>
              <span className="grow">Modo oscuro</span>
              <span className={"switch" + (dark ? " on" : "")} aria-hidden><span /></span>
            </button>
            {d.canInstall && !d.standalone && (
              <button type="button" role="menuitem" onClick={go(() => void installApp())}>Instalar en este equipo</button>
            )}
            <button type="button" role="menuitem" onClick={go(() => void toggleFullscreen())}>
              {d.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            </button>
            <hr />
            <a role="menuitem" href={admin ? "/hoy" : "/turno"}>{admin ? "Ir al panel" : "Tablet de turno"}</a>
            {mode === "device" && (
              <button type="button" role="menuitem" style={{ color: "var(--late)" }} disabled={unlinking} onClick={() => void unlink()}>
                Desvincular este dispositivo
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * The receipt printer (DIG-E200I, a Windows printer): «Aquí» on the PC it is
 * plugged into, «A la caja» on the tablets that send it their tickets.
 */
function TicketMenuItems({ onTest }: { onTest: () => void }) {
  const t = useTicketPrinter();
  const sw = (on: boolean) => <span className={"switch" + (on ? " on" : "")} aria-hidden><span /></span>;
  const modos: Array<[TicketSettings["modo"], string]> = [["aqui", "Aquí"], ["caja", "A la caja"], ["no", "No"]];
  return (
    <>
      <div className="menu-label" style={{ padding: "6px 14px 2px", fontSize: 13, color: "var(--muted)" }}>Recibos y comandas</div>
      <div role="radiogroup" aria-label="Recibos y comandas" style={{ display: "flex", gap: 6, padding: "4px 10px 8px" }}>
        {modos.map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={t.modo === m} className="btn sm ghost" style={{ flex: 1, justifyContent: "center", ...(t.modo === m ? { background: "var(--strong)", color: "var(--on-strong)", borderColor: "var(--strong)" } : {}) }} onClick={() => setTicketSettings({ modo: m })}>
            {label}
          </button>
        ))}
      </div>
      {t.modo !== "no" && (
        <>
          <button type="button" role="menuitemcheckbox" aria-checked={t.recibo === "auto"} onClick={() => setTicketSettings({ recibo: t.recibo === "auto" ? "pedir" : "auto" })}>
            <span className="grow">Recibo con cada venta</span>
            {sw(t.recibo === "auto")}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={t.comanda} onClick={() => setTicketSettings({ comanda: !t.comanda })}>
            <span className="grow">Comanda para la barra</span>
            {sw(t.comanda)}
          </button>
        </>
      )}
      {t.modo === "aqui" && <button type="button" role="menuitem" onClick={onTest}>Imprimir recibo de prueba</button>}
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// «¿Quién prepara?» — who is on the bar
// ════════════════════════════════════════════════════════════════
/** Pick who is on the bar. One tap; stays on this register until changed. */
export function BaristaPicker() {
  const s = usePos();
  return (
    <Overlay onClose={closeBaristaPicker} labelledBy="bar-t" maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="grow">
          <h2 id="bar-t" className="h1">¿Quién prepara?</h2>
          <span className="muted" style={{ fontSize: 15 }}>Las bebidas que se vendan desde ahora, y sus calificaciones, se cuentan para esta persona.</span>
        </div>
        <CloseX onClick={closeBaristaPicker} />
      </div>
      <div role="radiogroup" aria-label="Barista" className="scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50dvh" }}>
        {s.catalog.equipo.map((m) => {
          const on = s.barista?.id === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} className="opt" onClick={() => setBarista(m)}>
              <span className="radio" />
              <span className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{initials(m.name)}</span>
              <span className="grow">{m.name}{m.id === s.person?.id ? " (yo)" : ""}</span>
              {on && <span className="pill ok">En barra</span>}
            </button>
          );
        })}
      </div>
      {s.barista && (
        <button type="button" className="btn ghost" onClick={() => setBarista(null)}>Nadie en barra (no contar)</button>
      )}
    </Overlay>
  );
}

export function CloseX({ onClick, label = "Cerrar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn" onClick={onClick} aria-label={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

/** Kept for the screens that still draw small chips (Puntos, Etiquetas). */
export const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", borderRadius: 12, cursor: "pointer",
  border: `1px solid ${C.rule}`, background: C.paperLt, color: C.ink,
  fontFamily: F.mono, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
};
