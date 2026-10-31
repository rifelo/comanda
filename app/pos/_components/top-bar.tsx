"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/comanda/primitives";
import { desvincularPos } from "../actions";
import { StationCtx, usePos, posStore, retryOutbox, openOrdenes, closeOrdenes, openEtiquetas, closeEtiquetas, openPuntos, closePuntos, setBarista, openBaristaPicker, closeBaristaPicker } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter, printTestLabel, type PrinterStatus } from "@/lib/printer/serial";
import { useDesktopApp, installApp, toggleFullscreen } from "@/lib/pwa/desktop";
import { C, F, Overlay } from "./theme";

// ════════════════════════════════════════════════════════════════
// Top bar
// ════════════════════════════════════════════════════════════════
export function TopBar({ mode }: { mode: "device" | "user" }) {
  const station = React.useContext(StationCtx);

  return (
    <div className="pos-hdr">
      <span className="pos-wordmark" style={{ lineHeight: 1, flexShrink: 0 }}>
        <Wordmark size={20} />
      </span>

      <SearchBox />

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <BaristaChip />
        <OutboxChip />
        <PendientesChip />
        <PuntosChip />
        <EtiquetasChip />
        <PrinterChip />
        {mode === "device" && <UnlinkButton station={station} />}
        <DesktopChips />
        {mode === "user" && (
          <Link href="/" title="Inicio" aria-label="Inicio" style={{ ...iconBtnStyle, color: C.ink2, textDecoration: "none" }}>
            ←
          </Link>
        )}
      </div>
    </div>
  );
}

export function SearchBox() {
  const s = usePos();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div style={{ flex: 1, minWidth: 120, maxWidth: 520, position: "relative" }}>
      <span aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>⌕</span>
      <input
        ref={ref}
        value={s.search}
        onChange={(e) => posStore.set({ search: e.target.value })}
        placeholder="Buscar producto…"
        aria-label="Buscar producto"
        style={{ width: "100%", height: 40, padding: "0 36px 0 32px", border: `1.5px solid ${s.search ? C.ink : C.rule}`, background: C.paper, color: C.ink, fontFamily: F.mono, fontSize: 14, borderRadius: 3, outline: "none" }}
      />
      {s.search && (
        <button onClick={() => { posStore.set({ search: "" }); ref.current?.focus(); }} aria-label="Limpiar búsqueda" style={{ position: "absolute", right: 0, top: 0, width: 40, height: 40, border: "none", background: "transparent", color: C.muted, fontSize: 16, cursor: "pointer" }}>×</button>
      )}
    </div>
  );
}

/** "Pedidos" — opens the Square-style orders screen; badge = open orders. */
export function PendientesChip() {
  const s = usePos();
  // Not completed yet: unpaid, or paid and not delivered (queued ones are neither).
  const n = s.pendientes.length + s.outbox.length;
  const on = s.view === "ordenes";
  return (
    <button
      onClick={() => (on ? closeOrdenes() : openOrdenes())}
      title={`Pedidos: ${n} por completar`}
      aria-pressed={on}
      style={{ ...chipStyle, justifyContent: "center", minWidth: "min(150px, 22vw)", padding: "0 16px", fontSize: 12, border: `1.5px solid ${on ? C.ink : n ? C.amber : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink, position: "relative" }}
    >
      Pedidos
      {n > 0 && (
        <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.amber, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {n}
        </span>
      )}
    </button>
  );
}

/**
 * «Barista: Andrés» — who is on the bar. Every new order is credited to them,
 * so the drinks they make and the ratings those cups get count for them.
 * Unset, it asks «¿Quién prepara?» in red until someone picks.
 */
export function BaristaChip() {
  const s = usePos();
  if (!s.catalog.equipo.length) return null;
  const b = s.barista;
  return (
    <button
      onClick={openBaristaPicker}
      className={"pos-chip-c" + (b ? "" : " pos-hl")}
      title={b ? `Las bebidas se cuentan para ${b.name}. Toca para cambiar de barista.` : "Elige quién está en la barra: las bebidas y sus calificaciones se cuentan para esa persona."}
      aria-label={b ? `Barista: ${b.name}. Cambiar` : "Elegir barista"}
      style={{ ...chipStyle, justifyContent: "center", padding: "0 12px", fontSize: 12, maxWidth: 220, border: `1.5px solid ${b ? C.ink : C.red}`, background: "transparent", color: b ? C.ink : C.red, fontWeight: b ? 600 : 700 }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {b ? <><span className="pos-barista-pre">Barista: </span>{b.name.split(" ")[0]}</> : <><span className="pos-barista-ask-long">¿Quién prepara?</span><span className="pos-barista-ask-short">¿Quién?</span></>}
      </span>
    </button>
  );
}

/** Pick who is on the bar. One tap; stays on this register until changed. */
export function BaristaPicker() {
  const s = usePos();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeBaristaPicker(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <Overlay onClose={closeBaristaPicker} align="center">
      <div role="dialog" aria-modal aria-label="¿Quién prepara?" style={{ width: "min(440px, 94vw)", maxHeight: "86dvh", display: "flex", flexDirection: "column", background: C.paperLt, border: `1.5px solid ${C.ink}`, borderRadius: 8, boxShadow: "0 30px 80px -30px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.slab, fontSize: 24, lineHeight: 1.1 }}>¿Quién prepara?</div>
            <div style={{ fontSize: 12, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>Las bebidas que se vendan desde ahora, y sus calificaciones, se cuentan para esta persona.</div>
          </div>
          <button onClick={closeBaristaPicker} aria-label="Cerrar" style={{ width: "var(--pos-close)", height: "var(--pos-close)", borderRadius: "50%", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>
        <div className="pos-scroll" style={{ overflowY: "auto", padding: "8px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {s.catalog.equipo.map((m) => {
            const on = s.barista?.id === m.id;
            return (
              <button key={m.id} onClick={() => setBarista(m)} aria-pressed={on} style={{ height: 56, padding: "0 16px", borderRadius: 6, border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink, fontFamily: F.mono, fontSize: 16, fontWeight: 600, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{m.name}</span>
                {on && <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>En barra</span>}
              </button>
            );
          })}
          {s.barista && (
            <button onClick={() => setBarista(null)} style={{ height: 44, marginTop: 4, border: "none", background: "transparent", color: C.muted, fontFamily: F.mono, fontSize: 12, letterSpacing: ".06em", cursor: "pointer" }}>Nadie en barra (no contar)</button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

/** "Puntos" — the customers' points board (@ and accumulated points). */
export function PuntosChip() {
  const s = usePos();
  const on = s.view === "puntos";
  return (
    <button
      onClick={() => (on ? closePuntos() : openPuntos())}
      className="pos-chip-c"
      title="Puntos: los clientes con su @ de Instagram y los puntos acumulados"
      aria-pressed={on}
      style={{ ...chipStyle, justifyContent: "center", padding: "0 14px", fontSize: 12, border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink }}
    >
      Puntos
    </button>
  );
}

/** "Etiquetas" — opens the screen to print or reprint a label on demand. */
export function EtiquetasChip() {
  const s = usePos();
  const on = s.view === "etiquetas";
  return (
    <button
      onClick={() => (on ? closeEtiquetas() : openEtiquetas())}
      className="pos-chip-c"
      title="Etiquetas: imprimir o reimprimir un nombre, un vaso o una frase"
      aria-pressed={on}
      style={{ ...chipStyle, justifyContent: "center", padding: "0 14px", fontSize: 12, border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink }}
    >
      Etiquetas
    </button>
  );
}

export const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 3, cursor: "pointer",
  border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink,
  fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap",
};

/** Square icon-only variant of {@link chipStyle} — same height as the chips. */
export const iconBtnStyle: React.CSSProperties = {
  ...chipStyle, gap: 0, justifyContent: "center", width: 40, padding: 0, fontSize: 15, letterSpacing: 0,
};

/**
 * Desktop-app chips: "instalar" while Chrome/Edge offers the install prompt
 * (hidden once installed / already in an app window), and a full-screen
 * toggle. Both need a click — the browser won't install or go full screen
 * without a user gesture; F11 and Esc keep working as usual.
 */
export function DesktopChips() {
  const d = useDesktopApp();
  return (
    <>
      {d.canInstall && !d.standalone && (
        <button onClick={() => void installApp()} title="Instalar el POS como app en este PC" aria-label="Instalar el POS como app" style={iconBtnStyle}>
          <span aria-hidden>⤓</span>
        </button>
      )}
      <button
        onClick={() => void toggleFullscreen()}
        aria-pressed={d.fullscreen}
        title={d.fullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
        aria-label={d.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        style={{ ...iconBtnStyle, border: `1.5px solid ${d.fullscreen ? C.ink : C.rule}` }}
      >
        <span aria-hidden>{d.fullscreen ? "⤡" : "⤢"}</span>
      </button>
    </>
  );
}

/** Printer glyph for {@link PrinterChip}; inherits the status colour. */
export function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

export const PRINTER_UI: Record<PrinterStatus, { label: string; dot: string; blink?: boolean }> = {
  unsupported: { label: "sin impresora", dot: C.muted },
  disconnected: { label: "conectar impresora", dot: C.muted },
  connecting: { label: "conectando…", dot: C.amber, blink: true },
  ready: { label: "impresora", dot: C.green },
  printing: { label: "imprimiendo…", dot: C.amber, blink: true },
  off: { label: "impresora apagada", dot: C.red },
  error: { label: "impresora", dot: C.red },
};

/**
 * Label-printer chip. Disconnected → click pairs (needs the click: the port
 * picker only opens inside a user gesture). Connected → click prints a test
 * label. Errors show as a red dot with the reason in the tooltip and a line
 * under the bar.
 */
export function PrinterChip() {
  const p = usePrinter();
  const ui = PRINTER_UI[p.status];
  const canPair = p.status === "disconnected" || p.status === "error";
  const disabled = p.status === "unsupported" || p.status === "connecting" || p.status === "printing";
  const title = p.note ?? (p.status === "ready" ? "Imprimir etiqueta de prueba" : canPair ? "Conectar la impresora de etiquetas" : ui.label);
  const onClick = () => {
    if (canPair) void connectPrinter();
    else if (p.status === "ready") printTestLabel();
    else if (p.status === "off") void checkPrinter(); // "¿ya la encendí?" without waiting for the heartbeat
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        ...iconBtnStyle, position: "relative",
        cursor: disabled ? "default" : "pointer",
        border: `1.5px solid ${p.status === "error" ? C.red : C.rule}`,
        color: ui.dot,
      }}
    >
      <PrinterIcon className={ui.blink ? "pos-rec" : ""} />
      {p.queued > 0 && (
        <span className="cmd-num" style={{ position: "absolute", top: -6, right: -6, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: C.ink, color: C.paperLt, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          +{p.queued}
        </span>
      )}
    </button>
  );
}

/** Paired-device chip: shows the station name and lets the admin unpair it. */
export function UnlinkButton({ station }: { station: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  function onClick() {
    if (pending) return;
    if (!window.confirm(`¿Desvincular "${station}" de esta cuenta? Necesitarás un nuevo código para volver a usarla.`)) return;
    startTransition(async () => {
      await desvincularPos();
      router.refresh();
    });
  }
  return (
    <button onClick={onClick} disabled={pending} title="Desvincular este dispositivo" style={{
      height: 40, padding: "0 12px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${C.rule}`, background: "transparent", color: C.muted,
      fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase",
    }}>
      {pending ? "…" : "desvincular"}
    </button>
  );
}

/** Orders still on their way to the server, waiting for the connection, or that failed and wait for a retry. */
export function OutboxChip() {
  const s = usePos();
  const sending = s.outbox.filter((j) => j.status === "sending").length;
  const failed = s.outbox.filter((j) => j.status === "failed").length;
  const waiting = s.outbox.filter((j) => j.status === "offline").length;
  if (!s.online || waiting) {
    return (
      <button onClick={() => retryOutbox()} title="Sin internet: los pedidos se guardan en esta caja y se envían solos cuando vuelva la conexión. Toca para intentar ya." style={{ height: 40, padding: "0 12px", borderRadius: 3, border: `1.5px solid ${C.amber}`, background: C.amber, color: "#fff", fontFamily: F.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
        Sin conexión{waiting + sending ? ` · ${waiting + sending} en cola` : ""}{failed ? ` · ${failed} con error` : ""}
      </button>
    );
  }
  if (!sending && !failed) return null;
  if (failed) {
    return (
      <button onClick={() => retryOutbox()} title={s.outbox.find((j) => j.status === "failed")?.error ?? undefined} style={{ height: 40, padding: "0 12px", borderRadius: 3, border: `1.5px solid ${C.red}`, background: C.red, color: C.paperLt, fontFamily: F.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
        {failed} sin registrar · reintentar
      </button>
    );
  }
  return (
    <span style={{ height: 40, padding: "0 12px", borderRadius: 3, border: `1.5px solid ${C.rule}`, color: C.muted, fontFamily: F.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center" }}>
      Enviando {sending}…
    </span>
  );
}
