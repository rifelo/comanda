"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { errorMovimiento, JUSTIFICACION_CAJA_MIN, MOTIVO_CAJA, motivosDe, parseMonto, resumenCaja, type MotivoCaja, type TipoMovimiento } from "@/lib/caja/movimientos";
import { registrarMovimientoCaja } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const label: React.CSSProperties = { fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-2)" };
const pick = (on: boolean, color = "var(--ink)"): React.CSSProperties => ({ ...chip, height: 46, textTransform: "none", letterSpacing: 0, fontSize: 13.5, border: `1.5px solid ${on ? color : "var(--rule)"}`, background: on ? color : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)" });

export function MovimientosScreen({ sedeName, actorName, hoy }: {
  sedeName: string;
  actorName: string;
  hoy: { id: string; tipo: TipoMovimiento; monto: number; motivo: MotivoCaja; justificacion: string; folio: number | null; quien: string | null; hora: string }[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<TipoMovimiento | null>(null);
  const [monto, setMonto] = React.useState("");
  const [motivo, setMotivo] = React.useState<MotivoCaja | null>(null);
  const [just, setJust] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const tot = resumenCaja(hoy);
  const n = parseMonto(monto);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const invalid = errorMovimiento({ tipo, monto: n, motivo, justificacion: just });
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    const r = await registrarMovimientoCaja({ tipo, monto: n, motivo, justificacion: just.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(`${tipo === "ingreso" ? "Ingreso" : "Salida"} de ${posMoney(n ?? 0)} registrado.`);
    setTipo(null);
    setMonto("");
    setMotivo(null);
    setJust("");
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Ingresos y salidas<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <span className="hidden sm:inline" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{actorName}</span>
        <Link href="/turno/caja" style={{ ...chip, marginLeft: 8 }}>← Caja</Link>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <section aria-label="Registrar movimiento">
          <div style={kicker}>Plata que entra o sale de la caja sin ser una venta</div>
          <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <div role="radiogroup" aria-label="Entra o sale" style={{ display: "flex", gap: 8 }}>
              <button type="button" role="radio" aria-checked={tipo === "ingreso"} onClick={() => { setTipo("ingreso"); setMotivo(null); setOk(null); }} style={{ ...pick(tipo === "ingreso", "var(--green)"), minWidth: 150, justifyContent: "center", fontSize: 15, fontWeight: 700 }}>＋ Ingreso</button>
              <button type="button" role="radio" aria-checked={tipo === "salida"} onClick={() => { setTipo("salida"); setMotivo(null); setOk(null); }} style={{ ...pick(tipo === "salida", "var(--red)"), minWidth: 150, justifyContent: "center", fontSize: 15, fontWeight: 700 }}>− Salida</button>
            </div>

            {tipo && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={label}>Monto</span>
                  <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" aria-label="Monto" placeholder="$ 0" style={{ ...field, width: 220, fontSize: 20, fontWeight: 700, textAlign: "right" }} />
                  {n !== null && n > 0 && <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{posMoney(n)}</span>}
                </label>
                <div>
                  <div style={{ ...label, marginBottom: 6 }}>Motivo</div>
                  <div role="radiogroup" aria-label="Motivo" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {motivosDe(tipo).map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={motivo === m} title={MOTIVO_CAJA[m].hint} onClick={() => setMotivo(m)} style={pick(motivo === m)}>{MOTIVO_CAJA[m].label}</button>
                    ))}
                  </div>
                  {tipo === "salida" && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>¿Pagaste un pedido que llegó? Regístralo en <Link href="/turno/inventario/recibir" style={{ color: "var(--ink)" }}>Inventario → Pedidos por llegar</Link>: ahí queda el conteo, las fotos y esta salida.</div>}
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={label}>Justificación · obligatoria</span>
                  <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={3} maxLength={300} aria-label="Justificación" placeholder={tipo === "ingreso" ? "Ej.: sencillo para abrir — 10 billetes de 10.000, lo trajo Jesús." : "Ej.: bolsa de hielo en la tienda de la esquina."} style={{ ...field, height: "auto", padding: "10px 12px", lineHeight: 1.45, resize: "vertical" }} />
                  <span style={{ fontSize: 11, color: just.trim().length >= JUSTIFICACION_CAJA_MIN ? "var(--muted)" : "var(--amber)" }}>{just.trim().length}/300</span>
                </label>
                <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 52, fontSize: 13, alignSelf: "flex-start", padding: "0 24px" }}>{busy ? "Registrando…" : `Registrar ${tipo}`}</button>
              </>
            )}
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
            {ok && <p role="status" style={{ margin: 0, fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</p>}
          </form>
        </section>

        <section aria-label="Movimientos de hoy">
          <div style={{ ...kicker, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Hoy · {hoy.length}</span>
            <span>Ingresos <b className="cmd-num" style={{ color: "var(--green)" }}>{posMoney(tot.ingresos)}</b></span>
            <span>Salidas <b className="cmd-num" style={{ color: "var(--red)" }}>{posMoney(tot.salidas)}</b></span>
          </div>
          {hoy.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Ningún movimiento hoy. El cierre de caja los suma o resta de lo esperado.</div>}
          {hoy.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span className="cmd-num" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{m.hora}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{MOTIVO_CAJA[m.motivo].label}{m.folio ? ` · pedido #${m.folio}` : ""}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>«{m.justificacion}» · {m.quien ?? "—"}</span>
              </span>
              <span className="cmd-num" style={{ fontWeight: 700, whiteSpace: "nowrap", color: m.tipo === "ingreso" ? "var(--green)" : "var(--red)" }}>{m.tipo === "ingreso" ? "+" : "−"}{posMoney(m.monto)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
