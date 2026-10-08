"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { conteoSummary } from "@/lib/inventario/conteo";
import type { ConteosPanel } from "@/lib/inventario/conteos";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { aprobarConteo } from "@/app/(admin)/inventario/conteos/actions";

/**
 * The counts the team sent that still wait for the owner, for the panel
 * (/hoy/[date], /notificaciones): approve in one tap when there is nothing
 * to decide, open the count otherwise. Also says when last night's count was
 * skipped. Renders nothing when there is nothing to say.
 */
export function ConteosCard({ panel, tz, compact }: { panel: ConteosPanel; tz: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function aprobar(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    const r = await aprobarConteo({ id });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  if (panel.pendientes.length === 0 && !panel.ayerSinConteo) return null;
  return (
    <div style={{ border: "1.5px solid var(--amber)", background: "var(--paper-lt)", padding: compact ? 12 : 14 }}>
      <div className="flex items-center justify-between" style={{ gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--amber)", fontWeight: 700 }}>
          {panel.pendientes.length ? `${panel.pendientes.length} conteo${panel.pendientes.length === 1 ? "" : "s"} por aprobar` : "Conteo de inventario"}
        </span>
        <Link href="/inventario/conteos" className="cmd-link" style={{ fontSize: 11 }}>Ver todos →</Link>
      </div>
      {panel.ayerSinConteo && (
        <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--red)", fontWeight: 600 }}>Anoche no se envió el conteo de inventario.</div>
      )}
      <ul style={{ listStyle: "none", margin: panel.pendientes.length ? "8px 0 0" : 0, padding: 0 }}>
        {panel.pendientes.map((c) => {
          const s = conteoSummary(c.items);
          const nuevos = panel.propuestas[c.id] ?? 0;
          return (
            <li key={c.id} className="flex items-center" style={{ gap: 10, padding: "8px 0", borderTop: "1px dashed var(--rule)", flexWrap: "wrap" }}>
              <div className="flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600 }}>{NOMBRE_CONTEO[c.kind]} · {fechaCorta(todayInTz(tz, new Date(c.submitted_at)))} {formatTime(c.submitted_at, tz)}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {c.counted_by_name ?? "—"} · {s.withDiff} de {s.lines} con diferencia
                  {s.shortValue ? <b style={{ color: "var(--red)" }}> · falta {posMoney(s.shortValue)}</b> : null}
                  {s.overValue ? <> · sobra {posMoney(s.overValue)}</> : null}
                  {nuevos ? <b style={{ color: "var(--amber)" }}> · {nuevos} ítem{nuevos === 1 ? "" : "s"} nuevo{nuevos === 1 ? "" : "s"}</b> : null}
                </div>
              </div>
              <Link href={`/inventario/conteos/${c.id}`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Revisar</Link>
              {nuevos === 0 && (
                <button type="button" className="cmd-btn sm" onClick={() => void aprobar(c.id)} disabled={busy !== null}>
                  {busy === c.id ? "Aprobando…" : "Aprobar"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
