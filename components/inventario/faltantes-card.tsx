"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ESTADOS, fraseFaltantes } from "@/lib/inventario/faltantes";
import type { FaltanteReporte } from "@/lib/inventario/faltantes-db";
import { cn, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { resolverFaltanteAction } from "@/app/(admin)/inventario/faltantes/actions";

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * The open faltantes the team reported from the tablet, for the panel
 * (/hoy/[date]/turnos, /notificaciones, /inventario?vista=acabando). Each row
 * has a «Repuesto» button that closes the report. `tz` formats the report time.
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
      <p className="m-0 ui-sub">
        Nada reportado como faltante. El equipo lo marca desde la tablet en Inventario.{" "}
        {showLink ? (
          <Link href="/inventario?vista=acabando" className="font-semibold text-text">
            Lista prioritaria →
          </Link>
        ) : null}
      </p>
    );
  }
  return (
    <section className={cn("bg-surface border border-line rounded-card", compact ? "p-3" : "p-4", counts.agotado ? "border-l-4 border-l-late" : "border-l-4 border-l-brand")}>
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <span className={cn("ui-label", counts.agotado ? "text-late" : "text-text")}>{fraseFaltantes(counts)}</span>
        {showLink ? (
          <Link href="/inventario?vista=acabando" className="text-[14px] font-semibold text-text">
            Ver todo →
          </Link>
        ) : null}
      </div>
      <ul className="m-0 mt-2 p-0 list-none">
        {items.map((f) => {
          const e = ESTADOS[f.estado];
          return (
            <li key={f.id} className="flex items-center gap-3 py-2.5 border-t border-line first:border-t-0">
              <Pill tone={f.estado === "agotado" ? "late" : f.estado === "bajo" ? "brand" : "ok"}>{e.short}</Pill>
              <div className="flex-1 min-w-0">
                <div className={cn("font-semibold truncate", compact ? "text-[15px]" : "text-base")}>{f.ingrediente_name}</div>
                <div className="text-[13px] text-muted">
                  {formatTime(f.reported_at, tz)}
                  {f.reported_by_name ? ` · ${f.reported_by_name}` : ""}
                  {f.stock_sistema != null ? ` · sistema ${fmtQty(f.stock_sistema)} ${f.unit}` : ""}
                  {f.note ? ` · “${f.note}”` : ""}
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={busy !== null} loading={busy === f.id} onClick={() => void resolver(f.id)}>
                Repuesto
              </Button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="m-0 mt-1.5 text-[14px] text-late">
          {error}
        </p>
      ) : null}
    </section>
  );
}
