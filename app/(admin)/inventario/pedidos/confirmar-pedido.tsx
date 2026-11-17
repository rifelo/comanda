"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseMonto } from "@/lib/caja/movimientos";
import { posMoney } from "@/lib/pos/types";
import { confirmarPedido, cancelarPedidoAction } from "./actions";

export interface BorradorView {
  id: string;
  folio: number;
  proveedor: string;
  /** «17 nov»: when it was armed and sent. */
  armado: string;
  /** YYYY-MM-DD suggested from the supplier's delivery days. */
  llegaSugerida: string;
  lineas: { nombre: string; cantidad: string }[];
  /** The WhatsApp again, in case it wasn't sent. */
  wa: string | null;
}

const input: React.CSSProperties = { height: 44, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontSize: 16, outline: "none", minWidth: 0, width: "100%" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 };
const pick = (on: boolean): React.CSSProperties => ({ flex: "1 1 150px", minHeight: 48, padding: "6px 10px", borderRadius: 5, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "var(--paper-lt)", color: on ? "var(--paper-lt)" : "var(--ink)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "left", lineHeight: 1.25 });

// The phone's «Por pedir» styles every button with `color: inherit`: the solid ones say their color here.
const solid: React.CSSProperties = { color: "var(--on-strong)" };

const PAGO = {
  caja: { label: "Pagar de caja", hint: "El equipo le paga al proveedor con el efectivo del cajón cuando llegue (queda una salida de caja)." },
  transferencia: { label: "Pagado por transferencia", hint: "Ya lo pagaste: queda registrado el pago por el total y la caja no cambia." },
} as const;

/**
 * An order armed from «Por pedir» and sent by WhatsApp that the supplier
 * hasn't confirmed yet. «Marcar como solicitado» asks for the delivery date,
 * the total and how it's paid, and moves it to «en camino».
 */
export function PorConfirmar({ p, today }: { p: BorradorView; today: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [llega, setLlega] = React.useState(p.llegaSugerida < today ? today : p.llegaSugerida);
  const [total, setTotal] = React.useState("");
  const [pago, setPago] = React.useState<"caja" | "transferencia" | null>(null);
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t = parseMonto(total);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!llega || llega < today) return setError("Elige la fecha en que llega (hoy o después).");
    if (t === null || t <= 0) return setError("Escribe el total del pedido.");
    if (!pago) return setError("Elige cómo se paga.");
    setBusy(true);
    setError(null);
    try {
      const r = await confirmarPedido({ id: p.id, llega, total: t, pago, referencia: ref.trim() || undefined });
      if (!r.ok) return setError(r.error);
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisa el internet.");
    } finally {
      setBusy(false);
    }
  }
  async function cancelar() {
    if (busy || !window.confirm(`¿Cancelar el pedido n.º ${p.folio} a ${p.proveedor}? Sus ítems vuelven a «por pedir».`)) return;
    setBusy(true);
    const r = await cancelarPedidoAction(p.id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div data-borrador={p.folio} style={{ border: "1.5px dashed var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>n.º {p.folio} · {p.proveedor}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>enviado el {p.armado} · falta confirmar</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{p.lineas.map((l) => `${l.cantidad} ${l.nombre}`).join(" · ")}</div>

      {!open ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="cmd-btn sm" style={solid} onClick={() => { setOpen(true); setError(null); }} disabled={busy}>Marcar como solicitado</button>
          {p.wa && <a href={p.wa} target="_blank" rel="noreferrer" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Reenviar WhatsApp</a>}
          <button type="button" className="cmd-btn ghost sm" onClick={() => void cancelar()} disabled={busy}>{busy ? "…" : "Cancelar"}</button>
        </div>
      ) : (
        <form onSubmit={(e) => void confirmar(e)} style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={kicker}>Llega el</span>
              <input type="date" value={llega} min={today} onChange={(e) => setLlega(e.target.value)} style={input} required />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={kicker}>Total del pedido</span>
              <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" placeholder="$0" aria-label="Total del pedido" style={{ ...input, fontWeight: 700 }} />
            </label>
          </div>
          <div role="radiogroup" aria-label="Cómo se paga" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["caja", "transferencia"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={pago === m} onClick={() => setPago(m)} style={pick(pago === m)}>{PAGO[m].label}</button>
            ))}
          </div>
          {pago && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>{PAGO[pago].hint}{pago === "caja" && t ? ` Saldrán ${posMoney(t)} (o lo que diga la factura).` : ""}</div>}
          {pago === "transferencia" && (
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Referencia de la transferencia (opcional)" aria-label="Referencia de la transferencia" maxLength={80} style={input} />
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="cmd-btn sm" style={solid} disabled={busy}>{busy ? "Guardando…" : "Confirmar pedido"}</button>
            <button type="button" className="cmd-btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>Volver</button>
          </div>
        </form>
      )}
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}
    </div>
  );
}
