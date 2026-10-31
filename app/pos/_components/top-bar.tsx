"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Coffee,
  Download,
  Ellipsis,
  Maximize2,
  Mic,
  Minimize2,
  Printer,
  RefreshCw,
  Search,
  Star,
  Tag,
  Unlink,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import { Avatar, Button, Sheet } from "@/components/ui";
import { signOutLocal } from "@/app/login/actions";
import { desvincularPos } from "../actions";
import { StationCtx, usePos, posStore, retryOutbox, openOrdenes, closeOrdenes, openEtiquetas, openPuntos, setBarista, openBaristaPicker, closeBaristaPicker } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter, printTestLabel, type PrinterStatus } from "@/lib/printer/serial";
import { useDesktopApp, installApp, toggleFullscreen } from "@/lib/pwa/desktop";
import { C, F } from "./theme";

// ════════════════════════════════════════════════════════════════
// Top bar: ← · search · Pedidos · barista · printer · persona · ⋯
// ════════════════════════════════════════════════════════════════
/**
 * The POS chrome. Only what a sale needs stays on the bar; everything else
 * (labels, points, the voice assistant, install / full screen, unpairing)
 * lives behind «⋯» so the bar fits a 390 px phone.
 *
 *   ← back to the person's home: /turno on a paired device (the owner works
 *     as the team there too) or for staff, /hoy for the owner on their own
 *     device.
 */
export function TopBar({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  const back = mode === "device" || s.person?.role !== "admin" ? "/turno" : "/hoy";
  return (
    <header className="pos-hdr">
      <Link href={back} className="pos-hbtn icon" aria-label="Volver" title="Volver">
        <ArrowLeft size={22} aria-hidden />
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
      <img src="/icons/icon.svg" alt="" width={40} height={40} className="pos-hide-narrow" style={{ borderRadius: 10, flexShrink: 0 }} />
      <SearchBox />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <OutboxChip />
        <PendientesChip />
        <BaristaChip />
        <PrinterChip />
        <PersonChip mode={mode} />
        <MoreButton mode={mode} />
      </div>
    </header>
  );
}

export function SearchBox() {
  const s = usePos();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="pos-search">
      <Search size={20} aria-hidden style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
      <input
        ref={ref}
        type="search"
        value={s.search}
        onChange={(e) => posStore.set({ search: e.target.value })}
        placeholder="Buscar producto"
        aria-label="Buscar producto"
        enterKeyHint="search"
        autoComplete="off"
      />
      {s.search && (
        <button onClick={() => { posStore.set({ search: "" }); ref.current?.focus(); }} aria-label="Limpiar búsqueda" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** «Pedidos» — opens the orders screen; badge = orders not completed yet. */
export function PendientesChip() {
  const s = usePos();
  // Not completed yet: unpaid, or paid and not delivered (queued ones are neither).
  const n = s.pendientes.length + s.outbox.length;
  const on = s.view === "ordenes";
  return (
    <button
      type="button"
      className="pos-hbtn"
      onClick={() => (on ? closeOrdenes() : openOrdenes())}
      title={`Pedidos: ${n} por completar`}
      aria-label={n ? `Pedidos, ${n} por completar` : "Pedidos"}
      aria-pressed={on}
    >
      <ClipboardList size={20} aria-hidden />
      <span className="pos-hide-phone">Pedidos</span>
      {n > 0 && <span className="pos-badge">{n}</span>}
    </button>
  );
}

/**
 * «Prepara: Andrés» — who is on the bar. Every new order is credited to them,
 * so the drinks they make and the ratings those cups get count for them. It
 * starts as the person in session when they are on the team (see
 * PosTerminal); unset, it asks «¿Quién prepara?» until someone picks. On a
 * narrow screen it hides once set (it is in «⋯» too).
 */
export function BaristaChip() {
  const s = usePos();
  if (!s.catalog.equipo.length) return null;
  const b = s.barista;
  const self = !!b && b.id === s.person?.id;
  return (
    <button
      type="button"
      onClick={openBaristaPicker}
      className={"pos-hbtn" + (b ? " pos-hide-narrow" : " alert pos-hl")}
      title={b ? `Las bebidas se cuentan para ${b.name}. Toca para cambiar.` : "Elige quién está en la barra: las bebidas y sus calificaciones se cuentan para esa persona."}
      aria-label={b ? `Prepara ${b.name}. Cambiar` : "Elegir quién prepara"}
      style={{ maxWidth: 200 }}
    >
      <Coffee size={18} aria-hidden />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {b ? (self ? "Preparo yo" : b.name.split(" ")[0]) : <><span className="pos-barista-ask-long">¿Quién prepara?</span><span className="pos-barista-ask-short">¿Quién?</span></>}
      </span>
    </button>
  );
}

/** Pick who is on the bar. One tap; stays on this register until changed. */
export function BaristaPicker() {
  const s = usePos();
  return (
    <Sheet open onClose={closeBaristaPicker} title="¿Quién prepara?">
      <p style={{ margin: 0, fontSize: 15, color: C.muted, lineHeight: 1.5 }}>Las bebidas que se vendan desde ahora, y sus calificaciones, se cuentan para esta persona.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {s.catalog.equipo.map((m) => {
          const on = s.barista?.id === m.id;
          return (
            <button key={m.id} type="button" onClick={() => setBarista(m)} aria-pressed={on} style={{ minHeight: 64, padding: "0 16px", borderRadius: 12, border: `1px solid ${on ? C.strong : C.rule}`, background: on ? C.strong : C.paperLt, color: on ? C.onStrong : C.ink, fontSize: 17, fontWeight: 600, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={m.name} />
              <span style={{ flex: 1 }}>{m.name}{m.id === s.person?.id ? " (yo)" : ""}</span>
              {on && <span style={{ fontSize: 14 }}>En barra</span>}
            </button>
          );
        })}
        {s.barista && (
          <Button variant="ghost" size="sm" onClick={() => setBarista(null)}>Nadie en barra (no contar)</Button>
        )}
      </div>
    </Sheet>
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
      <button type="button" className="pos-hbtn warn" onClick={() => retryOutbox()} title="Sin internet: los pedidos se guardan en esta caja y se envían solos cuando vuelva la conexión. Toca para intentar ya." aria-label="Sin conexión. Reintentar">
        <WifiOff size={18} aria-hidden />
        <span className="pos-hide-phone">Sin conexión{waiting + sending ? ` · ${waiting + sending} en cola` : ""}{failed ? ` · ${failed} con error` : ""}</span>
      </button>
    );
  }
  if (!sending && !failed) return null;
  if (failed) {
    return (
      <button type="button" className="pos-hbtn alert" onClick={() => retryOutbox()} title={s.outbox.find((j) => j.status === "failed")?.error ?? undefined}>
        <RefreshCw size={18} aria-hidden />
        <span className="pos-hide-phone">{failed} sin registrar · reintentar</span>
      </button>
    );
  }
  return (
    <span className="pos-hbtn pos-hide-phone" style={{ color: C.muted, cursor: "default" }}>
      Enviando {sending}…
    </span>
  );
}

/** Kept for the screens that still draw small chips (Puntos, Etiquetas). */
export const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", borderRadius: 12, cursor: "pointer",
  border: `1px solid ${C.rule}`, background: C.paperLt, color: C.ink,
  fontFamily: F.mono, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
};

const PRINTER_UI: Record<PrinterStatus, { label: string; dot: string; blink?: boolean }> = {
  unsupported: { label: "Este navegador no imprime etiquetas", dot: C.muted },
  disconnected: { label: "Conectar la impresora", dot: C.muted },
  connecting: { label: "Conectando…", dot: C.amber, blink: true },
  ready: { label: "Impresora lista", dot: C.green },
  printing: { label: "Imprimiendo…", dot: C.amber, blink: true },
  off: { label: "Impresora apagada", dot: C.red },
  error: { label: "Error de impresora", dot: C.red },
};

/** What a tap on the printer does in its current state (shared by the chip and «⋯»). */
function printerAction(status: PrinterStatus): { label: string; run: (() => void) | null } {
  if (status === "disconnected" || status === "error") return { label: "Conectar la impresora", run: () => void connectPrinter() };
  if (status === "ready") return { label: "Imprimir etiqueta de prueba", run: printTestLabel };
  if (status === "off") return { label: "¿Ya la encendiste? Reintentar", run: () => void checkPrinter() };
  return { label: PRINTER_UI[status].label, run: null };
}

/**
 * Label-printer chip. Disconnected → click pairs (needs the click: the port
 * picker only opens inside a user gesture). Connected → test label. Hidden
 * where the browser can't print (phones, the tablet: labels relay to the
 * register).
 */
export function PrinterChip() {
  const p = usePrinter();
  if (p.status === "unsupported") return null;
  const ui = PRINTER_UI[p.status];
  const act = printerAction(p.status);
  const title = p.note ?? act.label;
  return (
    <button
      type="button"
      className={"pos-hbtn icon pos-hide-phone" + (p.status === "error" || p.status === "off" ? " alert" : "")}
      onClick={() => act.run?.()}
      disabled={!act.run}
      title={title}
      aria-label={title}
      style={{ position: "relative", color: ui.dot }}
    >
      <Printer size={20} className={ui.blink ? "pos-rec" : ""} aria-hidden />
      {p.queued > 0 && (
        <span className="pos-badge" style={{ position: "absolute", top: -6, right: -6, background: C.strong, color: C.onStrong }}>+{p.queued}</span>
      )}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// Persona (single login) — chip + sheet with «Cambiar persona»
// ════════════════════════════════════════════════════════════════
export function PersonChip({ mode }: { mode: "device" | "user" }) {
  const s = usePos();
  const [open, setOpen] = React.useState(false);
  const p = s.person;
  if (!p) return null;
  const first = p.name.split(" ")[0] || p.name;
  return (
    <>
      <button type="button" className="pos-hbtn" onClick={() => setOpen(true)} aria-label={`${p.name}. Cambiar persona`} title={`${p.name} · cambiar persona`} style={{ paddingLeft: 6 }}>
        <Avatar name={p.name} size="sm" />
        <span className="pos-who-name pos-hide-narrow">{first}</span>
      </button>
      <PersonSheet open={open} onClose={() => setOpen(false)} mode={mode} />
    </>
  );
}

function PersonSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: "device" | "user" }) {
  const s = usePos();
  const p = s.person;
  if (!p) return null;
  const busy = s.order.length > 0 || s.outbox.some((j) => j.status === "sending");
  return (
    <Sheet open={open} onClose={onClose} title="En esta caja">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar name={p.name} size="lg" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: 15, color: C.muted }}>{p.role === "admin" ? "Administrador" : "Equipo"} · las ventas quedan a tu nombre</div>
        </div>
      </div>
      {busy && (
        <p role="alert" style={{ margin: 0, padding: "12px 14px", borderRadius: 12, background: C.brandSoft, fontSize: 15, lineHeight: 1.45 }}>
          Hay un pedido en curso. Si cambias de persona ahora, el ticket se pierde; los pedidos ya enviados no.
        </p>
      )}
      <form action={signOutLocal}>
        {/* The next person signs in and lands back on the register. */}
        <input type="hidden" name="next" value="/pos" />
        <Button type="submit" variant="strong" block icon={<UserRound size={20} aria-hidden />}>Cambiar persona</Button>
      </form>
      {p.role === "admin" && mode === "user" ? (
        <Button href="/hoy" variant="ghost" block>Ir al panel</Button>
      ) : (
        <Button href="/turno" variant="ghost" block>Ir a la tablet del turno</Button>
      )}
    </Sheet>
  );
}

// ════════════════════════════════════════════════════════════════
// «⋯» — everything that isn't a sale
// ════════════════════════════════════════════════════════════════
function MoreButton({ mode }: { mode: "device" | "user" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="pos-hbtn icon" onClick={() => setOpen(true)} aria-label="Más opciones" title="Más opciones" aria-haspopup="dialog">
        <Ellipsis size={22} aria-hidden />
      </button>
      <MoreSheet open={open} onClose={() => setOpen(false)} mode={mode} />
    </>
  );
}

function MoreRow({ icon, title, sub, onClick, tone, disabled }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void; tone?: "late"; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ minHeight: 64, width: "100%", padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.rule}`, background: C.paperLt, color: tone === "late" ? C.red : C.ink, display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}
    >
      <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, background: C.paperDk, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 17, fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 14, color: C.muted, marginTop: 2 }}>{sub}</span>}
      </span>
    </button>
  );
}

function MoreSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: "device" | "user" }) {
  const s = usePos();
  const p = usePrinter();
  const d = useDesktopApp();
  const station = React.useContext(StationCtx);
  const router = useRouter();
  const [unlinking, setUnlinking] = React.useState(false);
  const act = printerAction(p.status);
  const go = (fn: () => void) => () => { onClose(); fn(); };
  async function unlink() {
    if (unlinking) return;
    if (!window.confirm(`¿Desvincular «${station}»? Necesitarás un código nuevo para volver a usarla como caja.`)) return;
    setUnlinking(true);
    await desvincularPos();
    // Not inside startTransition (Next 16: router.push/refresh there can hang the pending state).
    router.refresh();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Más opciones">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <MoreRow icon={<Tag size={20} />} title="Etiquetas" sub="Imprimir un nombre, un vaso o una frase" onClick={go(openEtiquetas)} />
        <MoreRow icon={<Star size={20} />} title="Puntos y reseñas" sub="Clientes con su @ y lo que dijeron" onClick={go(openPuntos)} />
        {s.catalog.equipo.length > 0 && (
          <MoreRow icon={<Coffee size={20} />} title="¿Quién prepara?" sub={s.barista ? `Ahora: ${s.barista.name}` : "Nadie elegido"} onClick={go(openBaristaPicker)} />
        )}
        {p.status !== "unsupported" && (
          <MoreRow icon={<Printer size={20} />} title="Impresora de etiquetas" sub={p.note ?? (act.label === PRINTER_UI[p.status].label ? act.label : `${PRINTER_UI[p.status].label} · ${act.label}`)} onClick={go(() => act.run?.())} disabled={!act.run} />
        )}
        <MoreRow
          icon={<Mic size={20} />}
          title={s.aiOpen ? "Cerrar el asistente de voz" : "Asistente de voz"}
          sub="Escucha la conversación y sugiere productos"
          onClick={go(() => posStore.set((st) => ({ ...st, aiOpen: !st.aiOpen })))}
        />
        {d.canInstall && !d.standalone && (
          <MoreRow icon={<Download size={20} />} title="Instalar el POS" sub="Como app en este equipo" onClick={go(() => void installApp())} />
        )}
        <MoreRow
          icon={d.fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          title={d.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          sub={d.fullscreen ? "Esc" : "F11"}
          onClick={go(() => void toggleFullscreen())}
        />
        {mode === "device" && (
          <MoreRow icon={<Unlink size={20} />} title="Desvincular esta caja" sub={`${station} · pide un código nuevo para volver`} tone="late" onClick={() => void unlink()} disabled={unlinking} />
        )}
      </div>
    </Sheet>
  );
}
