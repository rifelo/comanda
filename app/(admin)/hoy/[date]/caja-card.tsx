"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import type { CajaCierre } from "@/lib/types";
import { aprobarCierre, rechazarCierre } from "@/app/(admin)/caja/actions";

const STATUS: Record<CajaCierre["status"], { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "var(--amber)" },
  aprobado: { label: "Aprobado", color: "var(--green)" },
  rechazado: { label: "Rechazado", color: "var(--red)" },
};
const money = (n: number) => (n < 0 ? `-${posMoney(-n)}` : posMoney(n));

/**
 * The cash close of a turno on /hoy/[date]: what the team counted against
 * what the POS expected, and the owner's Aprobar / Rechazar while pending.
 * `window` is pre-formatted "HH:MM – HH:MM" in the sede tz (server side).
 */
export function CajaCard({ cierre, window: ventana, hasCajaTask, compact }: {
  cierre: CajaCierre | null;
  window: string | null;
  hasCajaTask: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<null | "aprobar" | "rechazar">(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!cierre) {
    return (
      <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Sin cierre de caja para este turno.
        {hasCajaTask ? " Se envía desde la tablet en Turno → Caja." : ""}
      </div>
    );
  }

  async function act(kind: "aprobar" | "rechazar") {
    if (!cierre || busy) return;
    setBusy(kind);
    setError(null);
    const r = kind === "aprobar" ? await aprobarCierre({ id: cierre.id, note }) : await rechazarCierre({ id: cierre.id, note });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  const st = STATUS[cierre.status];
  const noPos = cierre.pagos_count === 0;
  const tone = cierre.diferencia_cop < 0 ? "var(--red)" : cierre.diferencia_cop > 0 ? "var(--amber)" : "var(--green)";
  const entrega = cierre.contado_cop - cierre.base_dejada_cop;
  const cell = (label: string, value: string, color?: string) => (
    <div style={{ padding: "8px 10px", border: "1px solid var(--rule)", background: "var(--paper)" }}>
      <div className="text-muted" style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase" }}>{label}</div>
      <div className="cmd-num font-slab" style={{ fontSize: compact ? 18 : 22, lineHeight: 1.1, marginTop: 2, color: color ?? "var(--ink)" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ border: `1.5px solid ${cierre.status === "pendiente" ? "var(--ink)" : "var(--rule)"}`, background: "var(--paper-lt)", padding: compact ? 12 : 14 }}>
      <div className="flex items-center justify-between" style={{ gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: st.color, fontWeight: 700 }}>{st.label}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          contó {cierre.counted_by_name ?? "—"}{ventana ? ` · ventana ${ventana}` : ""}
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: compact ? "1fr 1fr" : "repeat(3, 1fr)", gap: 6, marginTop: 10 }}>
        {cell("Contado", posMoney(cierre.contado_cop))}
        {cell("Esperado", noPos ? "—" : posMoney(cierre.esperado_cop))}
        {cell("Diferencia", noPos ? "—" : money(cierre.diferencia_cop), noPos ? undefined : tone)}
        {cell("Base inicial", posMoney(cierre.base_inicial_cop))}
        {cell("Base que queda", posMoney(cierre.base_dejada_cop))}
        {cell("Entrega", money(entrega), entrega < 0 ? "var(--red)" : undefined)}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        {noPos
          ? "Sin pagos registrados en el POS en la ventana."
          : `POS: efectivo ${posMoney(cierre.efectivo_cop)} · tarjeta ${posMoney(cierre.tarjeta_cop)} · transferencia ${posMoney(cierre.transferencia_cop)} · ${cierre.pagos_count} pago${cierre.pagos_count === 1 ? "" : "s"}`}
      </div>
      {cierre.denominaciones.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cierre.denominaciones.map((d) => (
            <span key={d.valor} className="cmd-num" style={{ fontSize: 10.5, border: "1px solid var(--rule)", padding: "2px 6px", background: "var(--paper)" }}>
              {d.cantidad} × {posMoney(d.valor)}
            </span>
          ))}
        </div>
      )}
      {cierre.note && (
        <p className="text-ink-2 whitespace-pre-wrap" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>“{cierre.note}”</p>
      )}
      {cierre.status !== "pendiente" && cierre.review_note && (
        <p className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>Revisión: {cierre.review_note}</p>
      )}
      {cierre.status === "pendiente" && (
        <div style={{ marginTop: 10 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Nota de revisión (opcional)"
            aria-label="Nota de revisión"
            style={{ width: "100%", height: 34, padding: "0 8px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
          />
          <div className="flex" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="cmd-btn sm" onClick={() => void act("aprobar")} disabled={busy !== null} style={{ flex: 1 }}>
              {busy === "aprobar" ? "Aprobando…" : "Aprobar"}
            </button>
            <button type="button" className="cmd-btn ghost sm" onClick={() => void act("rechazar")} disabled={busy !== null} style={{ flex: 1 }}>
              {busy === "rechazar" ? "Rechazando…" : "Rechazar"}
            </button>
          </div>
          {error && <div role="alert" style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
