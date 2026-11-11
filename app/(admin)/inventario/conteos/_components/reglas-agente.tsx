"use client";

import * as React from "react";
import { MOTIVOS, REGLAS, type Regla } from "@/lib/inventario/agente/planificador";
import { guardarReglaAgente } from "../actions";

const SPARKLE = "M9 4h6v2H9zM7 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1M9 13l2 2 4-4";

/** «Cómo decide el control de inventario»: the four reasons as switches (optimistic) plus how the team keeps up. */
export function ReglasAgente({
  max,
  diasSinContar,
  inicial,
  aTiempo,
  atrasadas,
}: {
  max: number | null;
  diasSinContar: number;
  inicial: Record<string, boolean>;
  aTiempo: number | null;
  atrasadas: number;
}) {
  const [on, setOn] = React.useState<Record<string, boolean>>(inicial);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(r: Regla) {
    const next = !on[r];
    setOn((s) => ({ ...s, [r]: next }));
    setError(null);
    const res = await guardarReglaAgente({ regla: r, on: next });
    if (!res.ok) {
      setOn((s) => ({ ...s, [r]: !next }));
      setError(res.error);
    }
  }

  const desc = (r: Regla) => (r === "sin_contar" ? `Una zona por día, con lo que lleva ${diasSinContar} días sin contarse` : MOTIVOS[r].desc);

  return (
    <section className="flex flex-col gap-3" style={{ border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: 16 }} aria-labelledby="as-t">
      <div className="flex items-center" style={{ gap: 10 }}>
        <span aria-hidden="true" className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand-soft)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={SPARKLE} />
            <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
          </svg>
        </span>
        <h2 id="as-t" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Cómo decide el control de inventario</h2>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: "19px", color: "var(--muted)" }}>
        {max == null ? "Pide todos los insumos que lo necesiten, en las horas de menos movimiento." : `Pide máximo ${max} insumos por día.`} Cuenta cuando pasa algo de esto:
      </p>
      <div className="flex flex-col">
        {REGLAS.map((r) => {
          const activo = !!on[r];
          return (
            <div key={r} className="flex items-center" style={{ gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0, opacity: activo ? 1 : 0.5 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{MOTIVOS[r].label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{desc(r)}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={activo}
                aria-label={MOTIVOS[r].label}
                onClick={() => void toggle(r)}
                className={`flex shrink-0 items-center cursor-pointer ${activo ? "justify-end" : "justify-start"}`}
                style={{ width: 48, height: 28, minHeight: 28, minWidth: 48, boxSizing: "border-box", padding: 3, border: 0, borderRadius: 999, background: activo ? "var(--ok)" : "var(--line)" }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
              </button>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--late)" }}>{error}</p>}
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div className="flex justify-between" style={{ fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>Hechas a tiempo</span>
          <b className="cmd-num">{aTiempo === null ? "—" : `${aTiempo} %`}</b>
        </div>
        <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${aTiempo ?? 0}%`, height: "100%", background: "var(--brand)" }} />
        </div>
        <div className="flex justify-between" style={{ fontSize: 13, gap: 8 }}>
          <span style={{ color: "var(--muted)" }}>Sin contar (vuelven al día siguiente)</span>
          <b className="cmd-num">{atrasadas}</b>
        </div>
      </div>
    </section>
  );
}
