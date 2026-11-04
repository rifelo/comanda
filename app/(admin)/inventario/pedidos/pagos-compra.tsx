"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseMonto } from "@/lib/caja/movimientos";
import { MEDIO_PAGO, MEDIOS_DUENO, resumenPago, type PagoCompra } from "@/lib/compras/pagos";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta } from "@/lib/utils";
import { borrarPagoCompra, registrarPagoCompra } from "./actions";

const input: React.CSSProperties = { height: 40, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontSize: 16, outline: "none", minWidth: 0 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const COLOR = { sin_pagos: "var(--amber)", parcial: "var(--amber)", pagado: "var(--green)", de_mas: "var(--red)" } as const;

/**
 * What an order was paid and still owes, its payments, and «Registrar pago»
 * for what the owner paid outside the drawer (online, card, PSE, transfer,
 * Nequi, their own cash).
 */
export function PagosCompra({ compraId, folio, total, pagos, today }: {
  compraId: string;
  folio: number;
  /** Invoice total once received, else the estimate; null = none yet. */
  total: number | null;
  pagos: PagoCompra[];
  today: string;
}) {
  const router = useRouter();
  const r = resumenPago(total, pagos);
  const [open, setOpen] = React.useState(false);
  const [monto, setMonto] = React.useState("");
  const [medio, setMedio] = React.useState<(typeof MEDIOS_DUENO)[number]>("tarjeta");
  const [fecha, setFecha] = React.useState(today);
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function abrir() {
    setOpen(true);
    setError(null);
    setMonto(r.debe && r.debe > 0 ? String(r.debe) : "");
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const m = parseMonto(monto);
    if (m === null || m <= 0) return setError("Escribe cuánto pagaste.");
    setBusy(true);
    setError(null);
    const res = await registrarPagoCompra({ compraId, fecha, monto: m, medio, referencia: ref.trim() || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    setRef("");
    router.refresh();
  }
  async function borrar(p: PagoCompra) {
    if (!window.confirm(`¿Borrar el pago de ${posMoney(p.monto)} (${MEDIO_PAGO[p.medio]}) del pedido n.º ${folio}?`)) return;
    const res = await borrarPagoCompra(p.id);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--rule)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLOR[r.estado] }}>{r.texto}</span>
        {total === null && r.estado === "sin_pagos" && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>sin total estimado</span>}
        {!open && <button type="button" className={r.debe ? "cmd-btn sm" : "cmd-btn ghost sm"} onClick={abrir} style={{ marginLeft: "auto" }}>＋ Registrar pago</button>}
      </div>

      {pagos.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {pagos.map((p) => (
            <li key={p.id} className="flex items-center" style={{ gap: 10, fontSize: 12.5, flexWrap: "wrap" }}>
              <span className="cmd-num" style={{ color: "var(--muted)", width: 52 }}>{fechaCorta(p.fecha)}</span>
              <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                {MEDIO_PAGO[p.medio]}
                {p.referencia ? <span style={{ color: "var(--muted)" }}> · ref. {p.referencia}</span> : null}
                {p.note ? <span style={{ color: "var(--muted)" }}> · {p.note}</span> : null}
              </span>
              <b className="cmd-num">{posMoney(p.monto)}</b>
              {p.medio !== "efectivo_caja"
                ? <button type="button" className="cmd-btn ghost sm" onClick={() => void borrar(p)} aria-label={`Borrar el pago de ${posMoney(p.monto)}`}>×</button>
                : <span style={{ width: 34 }} title="Salió de la caja: se anula desde Caja" />}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={guardar} aria-label={`Registrar pago del pedido ${folio}`} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", border: "1.5px solid var(--ink)", borderRadius: 6 }}>
          <div>
            <div style={{ ...label, marginBottom: 6 }}>¿Cómo pagaste?</div>
            <div role="radiogroup" aria-label="Cómo pagaste" className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
              {MEDIOS_DUENO.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={medio === m} onClick={() => setMedio(m)} className={medio === m ? "cmd-btn sm" : "cmd-btn ghost sm"} style={{ textTransform: "none", letterSpacing: 0 }}>{MEDIO_PAGO[m]}</button>
              ))}
            </div>
          </div>
          <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px" }}>
              <span style={label}>Monto</span>
              <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$" aria-label="Monto pagado" style={{ ...input, textAlign: "right", fontWeight: 700 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 150px" }}>
              <span style={label}>Fecha</span>
              <input type="date" value={fecha} max={today} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha del pago" style={input} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 200px" }}>
              <span style={label}>Referencia (opcional)</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} placeholder="N.º de orden, aprobación o comprobante" aria-label="Referencia del pago" style={input} />
            </label>
          </div>
          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="cmd-btn red sm" disabled={busy}>{busy ? "Guardando…" : "Guardar pago"}</button>
            <button type="button" className="cmd-btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>No toca la caja. Si se paga con efectivo del cajón, se registra desde la tablet.</span>
          </div>
        </form>
      )}
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}
    </div>
  );
}
