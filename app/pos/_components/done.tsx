"use client";

/**
 * VentaRegistrada.dc.html — /pos/done.
 *
 * Opens the moment a sale is confirmed: the order travels in the outbox
 * behind it («Registrando…» → folio; offline → provisional number; failed →
 * retry / discard). With change to hand back the screen waits for «Cambio
 * entregado»; with none (and nothing wrong) it frees the register by itself
 * after 3.5 s — any touch on the card keeps it open.
 */
import * as React from "react";
import { PAY_METHOD_LABEL } from "@/lib/pos/types";
import { planSaleLabels } from "@/lib/pos/drink-label";
import { useCatalog, usePos, resetConversation, retryOutbox, dropOutbox, reprintLabel, printFrase } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter, printInstagramLabel, printStickerLabel, relaysLabels } from "@/lib/printer/serial";
import { CheckIcon, money, whoOf } from "./pay-common";

/** A paid sale with no change to hand back closes its receipt after this long. */
const AUTO_CLOSE_MS = 3500;

export function VentaRegistradaPage() {
  const s = usePos();
  const pendiente = s.receiptKind === "pendiente";
  const job = s.receiptJobId ? s.outbox.find((j) => j.id === s.receiptJobId) ?? null : null;
  const registrando = !!job && job.status === "sending";
  const failed = !!job && job.status === "failed";
  const offline = !!job && job.status === "offline";
  const porVerificar = pendiente && job?.base.porVerificar === "transferencia";
  const change = pendiente ? 0 : s.lastChange;

  const btnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { btnRef.current?.focus(); }, []);
  const [hold, setHold] = React.useState(false);
  const auto = !hold && !failed && !offline && change === 0;
  React.useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(resetConversation, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [auto]);

  const title = failed
    ? "No se registró"
    : registrando
      ? "Registrando pedido…"
      : offline
        ? "Guardado sin conexión"
        : pendiente
          ? "Pedido enviado · pagar después"
          : "Venta registrada";
  const who = whoOf(s);
  const sub = [
    s.orderNo && s.orderNo !== "…" && s.orderNo !== "Nuevo" ? `Pedido #${s.orderNo}` : null,
    who ? `Pa' ${who}` : null,
    porVerificar ? "Transferencia por verificar" : pendiente ? "Pendiente de pago" : PAY_METHOD_LABEL[s.lastMethod],
  ].filter(Boolean).join(" · ");
  const tone = failed ? "var(--late)" : registrando || offline || pendiente ? "var(--strong)" : "var(--ok)";
  const toneText = registrando || offline || pendiente ? "var(--on-strong)" : "var(--surface)";

  return (
    <div className="done-wrap">
      <section className="card done-card" aria-labelledby="vr" role="status" onPointerDown={() => setHold(true)}>
        {auto && <span aria-hidden className="done-auto" style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }} />}
        <span className="done-ico" style={{ background: tone, color: toneText }} aria-hidden="true">
          {failed ? <b style={{ fontSize: 34 }}>!</b> : registrando ? <Dots /> : offline ? <CloudOff /> : pendiente ? <ClockIco /> : <CheckIcon size={36} width={2.8} />}
        </span>
        <div>
          <h1 id="vr" className="h1">{title}</h1>
          {sub && <span className="muted" style={{ fontSize: 16 }}>{sub}</span>}
        </div>
        {registrando && <p className="muted done-note">Puedes empezar el siguiente pedido; el número y las etiquetas salen solos en cuanto el servidor confirme.</p>}
        {offline && <p className="muted done-note">Quedó guardado en esta caja con número provisional y sus etiquetas ya salieron. Se envía solo cuando vuelva el internet — no cierres ni borres los datos del navegador.</p>}
        {failed && job && (
          <div role="alert" className="done-fail">
            <span>{job.error ?? "No se pudo registrar el pedido."}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn sm" onClick={() => retryOutbox(job.id)}>Reintentar</button>
              <button type="button" className="btn ghost sm" style={{ color: "var(--late)", borderColor: "var(--late)" }} onClick={() => { if (window.confirm("¿Descartar este pedido? No quedará registrado.")) { dropOutbox(job.id); resetConversation(); } }}>Descartar</button>
            </div>
          </div>
        )}

        <div className="done-total" style={{ background: "var(--surface-2)" }}>
          <span className="label">Total</span>
          <span className="amount" style={{ fontSize: change > 0 ? 32 : 48 }}>{money(s.lastTotal)}</span>
        </div>
        {change > 0 && (
          <div className="done-change">
            <span className="label" style={{ color: "var(--text)", fontSize: 16 }}>Cambio a entregar</span>
            <span className="huge md">{money(change)}</span>
          </div>
        )}

        <LabelsLine />

        <button ref={btnRef} type="button" className="btn lg block" onClick={resetConversation}>
          {change > 0 ? "Cambio entregado · siguiente venta" : "Siguiente venta"}
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          {auto ? "Se cierra sola en 3,5 s · Enter = siguiente venta" : change > 0 ? "Entrega el cambio antes de seguir · Enter = siguiente venta" : "Enter = siguiente venta"}
        </span>
      </section>
    </div>
  );
}

/**
 * «3 etiquetas en la impresora · Pa' Juan · QR · Cappuccino» plus the
 * reprint actions. New labels go out only for a new order — a stored order
 * that is being charged got its labels when it was sent.
 */
function LabelsLine() {
  const p = usePrinter();
  const s = usePos();
  const catalog = useCatalog();
  const job = s.receiptJobId ? s.outbox.find((j) => j.id === s.receiptJobId) ?? null : null;
  const remote = relaysLabels(p);
  const fresh = !s.pending;
  const sale = job?.snapshot ?? { order: s.order, people: s.people, customerName: s.customerName };
  const jobs = fresh ? planSaleLabels({ order: sale.order, people: sale.people, byId: catalog.byId, tableName: sale.customerName.trim() }) : [];
  const what: string[] = [];
  for (const j of jobs) {
    const t = j.kind === "name" ? `Pa' ${j.name}` : j.kind === "califica" ? "QR" : j.kind === "drink" ? j.item.name : "frase";
    if (!what.includes(t)) what.push(t);
  }
  const busy = p.status === "printing" || p.status === "connecting";
  const canPrint = p.status === "ready" || p.status === "printing" || remote;
  const bad = !remote && (p.status === "error" || p.status === "off" || p.status === "disconnected");
  const waiting = !!job && job.status === "sending";
  const n = jobs.length;

  let text: string | null = null;
  if (p.status === "unsupported" && !remote) text = null;
  else if (bad) text = p.note ?? "Impresora desconectada";
  else if (remote && p.relayNote) text = p.relayNote;
  else if (n > 0) text = waiting ? `${n} etiqueta${n === 1 ? "" : "s"} · salen al registrarse` : `${n} etiqueta${n === 1 ? "" : "s"} ${remote ? "a la caja con impresora" : "en la impresora"}`;

  const tool = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" className="btn ghost sm done-tool" onClick={onClick} disabled={disabled}>{label}</button>
  );

  return (
    <div className="done-labels">
      {text && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <span className={`status${bad ? " bad" : canPrint ? " ok" : ""}`}><span className="led" />{text}</span>
          {n > 0 && !bad && what.length > 0 && <span className="muted" style={{ fontSize: 14 }}>{what.join(" · ")}</span>}
        </div>
      )}
      {(s.frase || s.fraseError) && (
        <div className="done-frase" style={s.fraseError ? { color: "var(--late)", borderColor: "var(--late)" } : undefined}>{s.fraseError ?? s.frase}</div>
      )}
      {(p.status !== "unsupported" || remote) && (
        <div className="done-tools">
          {tool(canPrint ? "Reimprimir etiquetas" : p.status === "off" ? "Reintentar" : "Conectar impresora", () => (canPrint ? reprintLabel() : p.status === "off" ? void checkPrinter() : void connectPrinter()), busy && !remote)}
          {catalog.instagram && canPrint && tool("QR Instagram", () => printInstagramLabel(catalog.instagram!, catalog.cupArt), busy)}
          {catalog.sticker && canPrint && tool("Sticker PA'YO", () => printStickerLabel(catalog.sticker!), busy)}
          {canPrint && tool(s.fraseLoading ? "Pensando…" : "Frase IA", () => void printFrase(), busy || s.fraseLoading)}
        </div>
      )}
    </div>
  );
}

function Dots() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
  );
}
function ClockIco() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
  );
}
function CloudOff() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .9-7.9A6 6 0 0 0 6.2 9.2 4.5 4.5 0 0 0 7 18z" /><path d="M3 3l18 18" /></svg>
  );
}
