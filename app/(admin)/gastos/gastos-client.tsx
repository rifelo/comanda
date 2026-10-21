"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS_GASTO,
  CATEGORIA_GASTO,
  CUENTAS_GASTO,
  CUENTA_GASTO,
  comisionBold,
  errorGasto,
  moneyGasto,
  parseMontoGasto,
  type CategoriaGasto,
  type CuentaGasto,
} from "@/lib/gastos/gastos";
import { eliminarGasto, registrarGasto } from "./actions";

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const input: React.CSSProperties = { height: 40, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 14, outline: "none", minWidth: 0, width: "100%" };

/** Every amount in a pasted list ("23.000 7.000\n11.500") — what came in through Bold that day. */
function montosDe(text: string): number[] | null {
  const parts = text.split(/[\s;]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = parseMontoGasto(p);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/**
 * «Registrar gasto»: day, category, concept, amount (cents allowed) and the
 * account it left from. «Calcular comisión Bold» fills the amount from the
 * day's deposits the way the Bold statement charges them.
 */
export function NuevoGasto({ today }: { today: string }) {
  const router = useRouter();
  const [fecha, setFecha] = React.useState(today);
  const [categoria, setCategoria] = React.useState<CategoriaGasto>("comisiones");
  const [concepto, setConcepto] = React.useState("");
  const [monto, setMonto] = React.useState("");
  const [cuenta, setCuenta] = React.useState<CuentaGasto>("bold");
  const [note, setNote] = React.useState("");
  const [bold, setBold] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const ingresos = bold !== null ? montosDe(bold) : null;
  const calc = ingresos?.length
    ? ingresos.reduce(
        (s, n) => {
          const c = comisionBold(n);
          return { bruto: s.bruto + n, comision: s.comision + c.comision, gmf: s.gmf + c.gmf };
        },
        { bruto: 0, comision: 0, gmf: 0 },
      )
    : null;

  function usarCalculo() {
    if (!calc || !ingresos) return;
    const total = Math.round((calc.comision + calc.gmf) * 100) / 100;
    setCategoria("comisiones");
    setCuenta("bold");
    setMonto(total.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setConcepto("Comisión Bold + 4x1000 por transferencias");
    setNote(`${ingresos.length} depósitos por ${moneyGasto(calc.bruto)} · comisión ${moneyGasto(Math.round(calc.comision * 100) / 100)} · 4x1000 ${moneyGasto(Math.round(calc.gmf * 100) / 100)}`);
    setBold(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const m = parseMontoGasto(monto);
    const payload = { fecha, categoria, concepto: concepto.trim(), monto: m ?? 0, cuenta, note: note.trim() || undefined };
    const err = monto.trim() && m === null ? "El monto no es un número." : errorGasto({ ...payload, monto: m });
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    const r = await registrarGasto(payload);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(`Gasto de ${moneyGasto(payload.monto)} registrado.`);
    setConcepto("");
    setMonto("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} style={{ border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: 16, display: "grid", gap: 12 }}>
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={label}>Día</span>
          <input type="date" value={fecha} max={today} onChange={(e) => setFecha(e.target.value)} style={input} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={label}>Categoría</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)} style={input}>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>{CATEGORIA_GASTO[c].label} · {CATEGORIA_GASTO[c].hint}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={label}>Salió de</span>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaGasto)} style={input}>
            {CUENTAS_GASTO.map((c) => (
              <option key={c} value={c}>{CUENTA_GASTO[c]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
        <label className="sm:col-span-2" style={{ display: "grid", gap: 4 }}>
          <span style={label}>Concepto</span>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Comisión Bold, recibo de luz…" maxLength={200} style={input} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={label}>Monto</span>
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="4.345,40" style={input} />
        </label>
      </div>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={label}>Nota (opcional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={input} />
      </label>

      {bold === null ? (
        <button type="button" className="cmd-link" onClick={() => setBold("")} style={{ justifySelf: "start", fontSize: 12 }}>
          Calcular comisión Bold desde los depósitos →
        </button>
      ) : (
        <div style={{ border: "1px dashed var(--rule)", padding: 12, display: "grid", gap: 8 }}>
          <span style={label}>Depósitos del día en Bold (uno por línea o separados por espacio)</span>
          <textarea
            value={bold}
            onChange={(e) => setBold(e.target.value)}
            rows={4}
            placeholder={"23.000\n7.000\n11.500"}
            style={{ ...input, height: "auto", padding: 10, fontSize: 13 }}
          />
          <div className="flex flex-wrap items-center" style={{ gap: 10, fontSize: 12 }}>
            {bold.trim() && ingresos === null ? <span style={{ color: "var(--red)" }}>Hay algo que no es un monto.</span> : null}
            {calc && ingresos ? (
              <span className="cmd-num">
                {ingresos.length} depósitos · {moneyGasto(calc.bruto)} → comisión {moneyGasto(Math.round(calc.comision * 100) / 100)} + 4x1000 {moneyGasto(Math.round(calc.gmf * 100) / 100)} ={" "}
                <b>{moneyGasto(Math.round((calc.comision + calc.gmf) * 100) / 100)}</b>
              </span>
            ) : null}
            <span className="flex-1" />
            <button type="button" className="cmd-btn ghost sm" onClick={() => setBold(null)}>Cerrar</button>
            <button type="button" className="cmd-btn sm" disabled={!calc} onClick={usarCalculo}>Usar este monto</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
        <button type="submit" className="cmd-btn" disabled={busy} style={{ height: 44 }}>{busy ? "Guardando…" : "＋ Registrar gasto"}</button>
        {error ? <span style={{ color: "var(--red)", fontSize: 12.5 }}>{error}</span> : null}
        {ok && !error ? <span style={{ color: "var(--green)", fontSize: 12.5 }}>{ok}</span> : null}
      </div>
    </form>
  );
}

export function BorrarGasto({ id, concepto }: { id: string; concepto: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      className="cmd-link"
      disabled={busy}
      aria-label={`Borrar «${concepto}»`}
      title="Borrar"
      style={{ fontSize: 12, color: "var(--muted)" }}
      onClick={async () => {
        if (!window.confirm(`¿Borrar el gasto «${concepto}»?`)) return;
        setBusy(true);
        const r = await eliminarGasto(id);
        setBusy(false);
        if (!r.ok) window.alert(r.error);
        else router.refresh();
      }}
    >
      ✕
    </button>
  );
}
