"use client";

/**
 * Estados.dc.html — states shown, never asked: the offline bar (sales keep
 * going into the outbox) and the printer toast (labels can't print here).
 */
import * as React from "react";
import { usePos, retryOutbox } from "../pos-store";
import { usePrinter, connectPrinter, checkPrinter } from "@/lib/printer/serial";
import { sinImpresora } from "./ticket";

/** «Sin conexión · N ventas en cola» while offline or while queued sales wait / failed. */
export function OfflineBar() {
  const s = usePos();
  const waiting = s.outbox.filter((j) => j.status === "offline").length;
  const failed = s.outbox.filter((j) => j.status === "failed").length;
  if (s.online && !waiting && !failed) return null;
  const n = s.outbox.length;
  const venta = (k: number) => `${k} venta${k === 1 ? "" : "s"}`;
  const title = !s.online || waiting
    ? `Sin conexión · ${venta(n)} en cola`
    : `${venta(failed)} sin registrar`;
  const sub = !s.online || waiting
    ? "Sigue vendiendo: se envían solas cuando vuelva la red"
    : s.outbox.find((j) => j.status === "failed")?.error ?? "Reintenta; si sigue, revisa Pedidos";
  return (
    <div className="offline" role="status">
      <span>{title}</span>
      <span className="off-sub" style={{ fontWeight: 600, opacity: 0.85 }}>{sub}</span>
      <button type="button" className="btn" onClick={() => retryOutbox()}>Reintentar</button>
    </div>
  );
}

/** The printer's queue drops labels it can't print: these notes mean labels were lost. */
const LOST = /no se imprimió|reimprime/i;

/**
 * «Impresora desconectada · N etiquetas esperan · revisa el cable USB».
 * Shows when this PC has no printer and labels were sent to it (waiting in
 * the queue, or dropped by it). «Imprimir después» hides it until the next
 * label fails; reprint from Pedidos or Etiquetas.
 */
export function PrinterToast() {
  const p = usePrinter();
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const missing = sinImpresora(p);
  const lost = !!p.note && LOST.test(p.note);
  const key = `${p.status}|${p.note}|${p.queued}`;
  if (!missing || !(p.queued > 0 || lost) || dismissed === key) return null;
  const off = p.status === "off";
  const what = p.queued > 0
    ? `${p.queued} etiqueta${p.queued === 1 ? "" : "s"} espera${p.queued === 1 ? "" : "n"}`
    : "las etiquetas no salieron";
  return (
    <div className="toast" role="status">
      <span className="grow">{off ? "Impresora apagada" : "Impresora desconectada"} · {what} · {off ? "enciéndela" : "revisa el cable USB"}</span>
      <button type="button" className="btn" onClick={() => (off ? void checkPrinter() : void connectPrinter())}>Reconectar</button>
      <button type="button" className="btn quiet" onClick={() => setDismissed(key)}>Imprimir después</button>
    </div>
  );
}
