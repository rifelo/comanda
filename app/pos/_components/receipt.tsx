"use client";

import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { useCatalog, usePos, resetConversation, retryOutbox, dropOutbox, reprintLabel, printFrase } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter, printInstagramLabel, INSTAGRAM_FOLIO, FRASE_FOLIO, STICKER_FOLIO, printStickerLabel, relaysLabels } from "@/lib/printer/serial";
import { C, F, H, Overlay } from "./theme";
import { methodLabel } from "./ordenes";

// ════════════════════════════════════════════════════════════════
// Receipt
// ════════════════════════════════════════════════════════════════
/** A paid sale with no change to hand back closes its receipt after this long. */
const AUTO_CLOSE_MS = 3500;

export function ReceiptScreen() {
  const s = usePos();
  const pendiente = s.receiptKind === "pendiente";
  const method = methodLabel(s.lastMethod);
  const job = s.receiptJobId ? s.outbox.find((j) => j.id === s.receiptJobId) ?? null : null;
  const registrando = !!job && job.status === "sending";
  const failed = !!job && job.status === "failed";
  const offline = !!job && job.status === "offline";
  const btnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { btnRef.current?.focus(); }, []);
  // Nothing to hand back and nothing wrong → the register frees itself, so
  // the next sale starts with a tap on a product (keeps a sale at 2–3 taps).
  // Any touch on the card (reprint, read the folio…) keeps it open.
  const [hold, setHold] = React.useState(false);
  const auto = !hold && !failed && !offline && s.lastChange === 0;
  React.useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(resetConversation, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [auto]);
  return (
    <Overlay align="fill">
      <div className="pos-card" onPointerDown={() => setHold(true)} style={{ width: "min(560px, 92vw)", textAlign: "center", padding: "40px 32px 32px", border: `1px solid ${C.rule}`, borderRadius: 20, background: C.paperLt, boxShadow: "var(--shadow-2)", position: "relative", overflow: "hidden" }}>
        {auto && <span aria-hidden className="pos-autoclose" style={{ position: "absolute", left: 0, top: 0, height: 4, background: C.brand, animationDuration: `${AUTO_CLOSE_MS}ms` }} />}
        <div style={{ width: 64, height: 64, borderRadius: 32, margin: "0 auto", background: failed ? C.red : registrando ? C.muted : offline ? C.amber : pendiente ? C.amber : C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{failed ? "!" : registrando ? "…" : offline ? "⇅" : pendiente ? "⏱" : "✓"}</div>
        <div style={{ ...H, fontSize: 30, marginTop: 16 }}>{failed ? "No se registró" : registrando ? "Registrando pedido…" : offline ? "Guardado sin conexión" : pendiente ? "Pedido enviado" : "Venta registrada"}</div>
        {registrando && <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Puedes empezar el siguiente pedido; el número y las etiquetas salen solos en cuanto el servidor confirme.</div>}
        {offline && <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Quedó guardado en esta caja con número provisional y sus etiquetas ya salieron. Se envía solo cuando vuelva el internet — no cierres ni borres los datos del navegador.</div>}
        {failed && job && (
          <div role="alert" style={{ marginTop: 10, background: C.redSoft, color: C.red, padding: "12px 14px", borderRadius: 12, fontSize: 15, textAlign: "left" }}>
            {job.error ?? "No se pudo registrar el pedido."}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="cmd-btn sm" onClick={() => retryOutbox(job.id)}>Reintentar</button>
              <button onClick={() => { if (window.confirm("¿Descartar este pedido? No quedará registrado.")) { dropOutbox(job.id); resetConversation(); } }} style={{ height: 44, padding: "0 14px", borderRadius: 12, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Descartar</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
          {pendiente ? "Pendiente de pago · " : ""}Pedido <span className="cmd-num" style={{ color: C.ink }}>{s.orderNo}</span>{pendiente ? "" : ` · ${method}`}{s.customerName ? ` · ${s.customerName}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted }}>Total</div>
            <div className="cmd-num" style={{ ...H, fontSize: 34, marginTop: 2 }}>{posMoney(s.lastTotal)}</div>
          </div>
          {!pendiente && (s.lastMethod === "efectivo" || s.lastChange > 0) && (
            <div>
              <div style={{ fontSize: 12, color: C.muted }}>Cambio</div>
              <div className="cmd-num" style={{ ...H, fontSize: 34, marginTop: 2, color: C.green }}>{posMoney(s.lastChange)}</div>
            </div>
          )}
        </div>
        <button ref={btnRef} type="button" className="pos-paybtn cash" onClick={resetConversation} style={{ marginTop: 28, width: "100%" }}>
          Nuevo pedido
        </button>
        <ReceiptPrinterLine />
        <div style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>{auto ? "Se cierra solo · Enter = nuevo pedido" : "Enter · nuevo pedido"}</div>
      </div>
    </Overlay>
  );
}

/**
 * Under "Nuevo pedido": what happened with the label, plus a reprint button.
 * The label is queued the moment the sale is saved, so by the time the
 * receipt shows it's usually already printing.
 */
export function ReceiptPrinterLine() {
  const p = usePrinter();
  const s = usePos();
  const catalog = useCatalog();
  const remote = relaysLabels(p);
  if (p.status === "unsupported" && !remote) return null;
  const canPrint = p.status === "ready" || remote;
  const printed = p.lastPrinted?.folio === s.orderNo;
  const igPrinted = p.lastPrinted?.folio === INSTAGRAM_FOLIO;
  const frasePrinted = p.lastPrinted?.folio === FRASE_FOLIO;
  const stickerPrinted = p.lastPrinted?.folio === STICKER_FOLIO;
  const busy = p.status === "printing" || p.status === "connecting";
  const text = remote
    ? p.relayNote ?? "Las etiquetas salen en la caja con impresora"
    : busy
    ? "Imprimiendo etiqueta…"
    : p.note && (p.status === "error" || p.status === "disconnected" || p.status === "off")
      ? p.note
      : igPrinted
        ? "Etiqueta de Instagram impresa"
        : frasePrinted
          ? "Frase impresa"
          : stickerPrinted
            ? "Sticker impreso"
          : printed
            ? "Etiqueta impresa"
            : null;
  return (
    <>
    {(s.frase || s.fraseError) && (
      <div style={{ marginTop: 14, padding: "10px 14px", border: `1px dashed ${s.fraseError ? C.red : C.rule}`, borderRadius: 10, fontSize: 15, color: s.fraseError ? C.red : C.ink, lineHeight: 1.45 }}>
        {s.fraseError ?? s.frase}
      </div>
    )}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14, minHeight: 20, flexWrap: "wrap" }}>
      {text && (
        <span style={{ fontSize: 13, color: p.status === "error" ? C.red : C.muted }}>
          {text}
        </span>
      )}
      <button
        onClick={() => (canPrint ? reprintLabel() : p.status === "off" ? void checkPrinter() : void connectPrinter())}
        disabled={busy && !remote}
        style={{ height: 32, padding: "0 12px", borderRadius: 10, cursor: busy ? "default" : "pointer", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13 }}
      >
        {canPrint ? "Reimprimir etiquetas" : p.status === "off" ? "Reintentar" : "Conectar impresora"}
      </button>
      {catalog.instagram && canPrint && (
        <button
          onClick={() => printInstagramLabel(catalog.instagram!, catalog.cupArt)}
          disabled={busy}
          title={`Imprime un QR a instagram.com/${catalog.instagram}`}
          style={{ height: 32, padding: "0 12px", borderRadius: 10, cursor: busy ? "default" : "pointer", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13 }}
        >
          QR Instagram
        </button>
      )}
      {catalog.sticker && canPrint && (
        <button
          onClick={() => printStickerLabel(catalog.sticker!)}
          disabled={busy}
          title="Imprime el sticker de la marca"
          style={{ height: 32, padding: "0 12px", borderRadius: 10, cursor: busy ? "default" : "pointer", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13 }}
        >
          Sticker PA&apos;YO
        </button>
      )}
      {canPrint && (
        <button
          onClick={() => void printFrase()}
          disabled={busy || s.fraseLoading}
          title="La IA escribe una frase corta (graciosa, motivadora o de la noticia del día) y la imprime para el vaso"
          style={{ height: 32, padding: "0 12px", borderRadius: 10, cursor: busy || s.fraseLoading ? "default" : "pointer", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 13 }}
        >
          {s.fraseLoading ? "Pensando…" : "Frase IA"}
        </button>
      )}
    </div>
    </>
  );
}
