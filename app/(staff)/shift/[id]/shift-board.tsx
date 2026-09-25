"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ShiftView } from "@/lib/types";
import { TaskRow } from "@/components/task-row";
import { AdHocTaskRow } from "@/components/ad-hoc-task-row";
import { CmdSectionLabel, Folio } from "@/components/comanda/primitives";
import { closeShift } from "./actions";

export function ShiftBoard({
  view,
  userId,
  cajaPending = false,
}: {
  view: ShiftView;
  userId: string;
  /** The turno has an arqueo task and no cierre was sent yet (0037). */
  cajaPending?: boolean;
}) {
  const [closing, startClosing] = useTransition();
  const [closeError, setCloseError] = useState<string | null>(null);

  // Group tasks by due_time bucket (or "Sin hora" at the bottom).
  // Alias the array so the dep is a plain identifier — eslint's
  // exhaustive-deps otherwise flags `view.tasks` as a missing dep on
  // `view` (false positive).
  const tasks = view.tasks;
  const groups = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const key = t.due_time?.slice(0, 5) ?? "Sin hora";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Sin hora") return 1;
      if (b === "Sin hora") return -1;
      return a.localeCompare(b);
    });
  }, [tasks]);

  const allComplete =
    view.tasks.length > 0 &&
    Object.keys(view.completions).length === view.tasks.length;

  const remaining = view.tasks.length - Object.keys(view.completions).length;

  // Ad-hoc tasks (0015): drop cancelled, immediate (no due_time) first.
  const adHoc = view.adHocTasks
    .filter((t) => t.status !== "cancelled")
    .sort((a, b) => {
      if (!a.due_time && b.due_time) return -1;
      if (a.due_time && !b.due_time) return 1;
      return (a.due_time ?? "").localeCompare(b.due_time ?? "");
    });

  return (
    <>
      <div className="cmd-paper pb-32">
        {adHoc.length > 0 ? (
          <section>
            <div
              className="flex items-center"
              style={{
                gap: 8,
                padding: "11px 16px 8px",
                background: "rgba(176,58,46,0.06)",
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <span
                aria-hidden
                style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)" }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--red)",
                }}
              >
                Tareas inmediatas
              </span>
              <span
                className="flex-1"
                style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }}
              />
              <span className="text-muted" style={{ fontSize: 10 }}>
                {adHoc.filter((t) => t.status !== "done").length}
              </span>
            </div>
            <ul>
              {adHoc.map((task) => (
                <AdHocTaskRow
                  key={task.id}
                  task={task}
                  userId={userId}
                  disabled={view.shift.status === "closed"}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.map(([bucket, tasks]) => (
          <section key={bucket}>
            <CmdSectionLabel>
              ● {bucket === "Sin hora" ? "Sin hora" : bucket}
            </CmdSectionLabel>
            <ul>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  shiftId={view.shift.id}
                  restaurantId={view.shift.restaurant_id}
                  completion={view.completions[task.id]}
                  userId={userId}
                  disabled={view.shift.status === "closed"}
                />
              ))}
            </ul>
          </section>
        ))}

        {/* novedades footer cell */}
        <div
          className="px-4 py-4 mt-3"
          style={{ borderTop: "2px dashed var(--rule)" }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Novedades
            </span>
            <Folio n={`N-${44}`} label="REPORTE" />
          </div>
          <Link
            href={`/shift/${view.shift.id}/novedades`}
            className="cmd-btn ghost w-full"
          >
            + Agregar novedad
          </Link>
        </div>
      </div>

      {/* sticky footer */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md md:max-w-none">
        <div
          className="px-4 pt-3 pb-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(244,236,220,0) 0%, var(--paper) 30%)",
            borderTop: "1px solid var(--rule)",
          }}
        >
          {view.shift.status === "open" ? (
            <>
              <button
                type="button"
                className="cmd-btn red w-full"
                style={{ padding: "14px", fontSize: 13 }}
                disabled={closing}
                onClick={() => {
                  setCloseError(null);
                  if (
                    !allComplete &&
                    !confirm(
                      "Todavía hay tareas pendientes. ¿Cerrar el turno de todos modos?",
                    )
                  ) {
                    return;
                  }
                  if (
                    cajaPending &&
                    !confirm(
                      "Falta el cierre de caja de este turno (Caja · arqueo). ¿Cerrar el turno sin enviarlo?",
                    )
                  ) {
                    return;
                  }
                  startClosing(async () => {
                    const r = await closeShift({
                      shift_instance_id: view.shift.id,
                    });
                    if (r?.error) setCloseError(r.error);
                  });
                }}
              >
                {closing
                  ? "Cerrando…"
                  : allComplete
                    ? "Cerrar turno · entregar →"
                    : `Faltan ${remaining} tareas`}
              </button>
              {closeError ? (
                <p
                  className="text-center mt-2"
                  style={{
                    color: "var(--red)",
                    fontSize: 11,
                    letterSpacing: "0.04em",
                  }}
                >
                  {closeError}
                </p>
              ) : null}
            </>
          ) : (
            <div
              className="text-center"
              style={{
                color: "var(--green)",
                fontSize: 12,
                letterSpacing: "0.06em",
                padding: "10px 0",
              }}
            >
              Turno cerrado · entregado.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
