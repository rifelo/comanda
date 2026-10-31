"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { conteoSummary } from "@/lib/inventario/conteo";
import type { ConteosPanel } from "@/lib/inventario/conteos";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { posMoney } from "@/lib/pos/types";
import { cn, fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { aprobarConteo } from "@/app/(admin)/inventario/conteos/actions";

/**
 * The counts the team sent that still wait for the owner, for the panel
 * (/hoy/[date]/turnos, /notificaciones): approve in one tap when there is nothing
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
    <section className={cn("bg-surface border border-line border-l-4 border-l-brand rounded-card", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <span className="ui-label text-text">
          {panel.pendientes.length ? `${panel.pendientes.length} conteo${panel.pendientes.length === 1 ? "" : "s"} por aprobar` : "Conteo de inventario"}
        </span>
        <Link href="/inventario/conteos" className="text-[14px] font-semibold text-text">
          Ver todos →
        </Link>
      </div>
      {panel.ayerSinConteo ? <p className="m-0 mt-2 text-[14px] font-semibold text-late">Anoche no se envió el conteo de inventario.</p> : null}
      <ul className={cn("m-0 p-0 list-none", panel.pendientes.length ? "mt-2" : "")}>
        {panel.pendientes.map((c) => {
          const s = conteoSummary(c.items);
          const nuevos = panel.propuestas[c.id] ?? 0;
          return (
            <li key={c.id} className="flex items-center gap-3 py-2.5 border-t border-line first:border-t-0 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className={cn("font-semibold", compact ? "text-[15px]" : "text-base")}>
                  {NOMBRE_CONTEO[c.kind]} · {fechaCorta(todayInTz(tz, new Date(c.submitted_at)))} {formatTime(c.submitted_at, tz)}
                </div>
                <div className="text-[13px] text-muted">
                  {c.counted_by_name ?? "—"} · {s.withDiff} de {s.lines} con diferencia
                  {s.shortValue ? <b className="text-late"> · falta {posMoney(s.shortValue)}</b> : null}
                  {s.overValue ? <> · sobra {posMoney(s.overValue)}</> : null}
                  {nuevos ? (
                    <b className="text-text">
                      {" "}
                      · {nuevos} ítem{nuevos === 1 ? "" : "s"} nuevo{nuevos === 1 ? "" : "s"}
                    </b>
                  ) : null}
                </div>
              </div>
              <Button href={`/inventario/conteos/${c.id}`} variant="ghost" size="sm">
                Revisar
              </Button>
              {nuevos === 0 ? (
                <Button size="sm" onClick={() => void aprobar(c.id)} disabled={busy !== null} loading={busy === c.id}>
                  Aprobar
                </Button>
              ) : null}
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
