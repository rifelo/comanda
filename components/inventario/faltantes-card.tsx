"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ESTADOS, fraseFaltantes } from "@/lib/inventario/faltantes";
import type { FaltanteReporte } from "@/lib/inventario/faltantes-db";
import { formatTime } from "@/lib/utils";
import { resolverFaltanteAction } from "@/app/(admin)/inventario/faltantes/actions";

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * The open faltantes the team reported from the tablet, for the panel
 * (/hoy/[date], /notificaciones, /inventario/faltantes). Each row has a
 * "Repuesto" button that closes the report. `tz` formats the report time.
 */
export function FaltantesCard({ items, tz, compact, showLink = true }: { items: FaltanteReporte[]; tz: string; compact?: boolean; showLink?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const counts = items.reduce((c, i) => ({ agotado: c.agotado + (i.estado === "agotado" ? 1 : 0), bajo: c.bajo + (i.estado === "bajo" ? 1 : 0) }), { agotado: 0, bajo: 0 });

  async function resolver(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    const r = await resolverFaltanteAction({ id });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Nada reportado como faltante. El equipo lo marca desde el tablet en Turno → Faltantes.
        {showLink && <> <Link href="/inventario/faltantes" className="cmd-link">Lista prioritaria →</Link></>}
      </div>
    );
  }
  return (
    <div style={{ border: `1.5px solid ${counts.agotado ? "var(--red)" : "var(--amber)"}`, background: "var(--paper-lt)", padding: compact ? 12 : 14 }}>
      <div className="flex items-center justify-between" style={{ gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: counts.agotado ? "var(--red)" : "var(--amber)", fontWeight: 700 }}>{fraseFaltantes(counts)}</span>
        {showLink && <Link href="/inventario/faltantes" className="cmd-link" style={{ fontSize: 11 }}>Ver todo →</Link>}
      </div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {items.map((f) => {
          const e = ESTADOS[f.estado];
          return (
            <li key={f.id} className="flex items-center" style={{ gap: 10, padding: "7px 0", borderTop: "1px dashed var(--rule)" }}>
              <span style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: e.color, border: `1px solid ${e.color}`, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{e.short}</span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600 }}>{f.ingrediente_name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {formatTime(f.reported_at, tz)}{f.reported_by_name ? ` · ${f.reported_by_name}` : ""}
                  {f.stock_sistema != null ? ` · sistema ${fmtQty(f.stock_sistema)} ${f.unit}` : ""}
                  {f.note ? ` · “${f.note}”` : ""}
                </div>
              </div>
              <button type="button" className="cmd-btn ghost sm" disabled={busy !== null} onClick={() => void resolver(f.id)} style={{ whiteSpace: "nowrap" }}>
                {busy === f.id ? "…" : "Repuesto"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <div role="alert" style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
