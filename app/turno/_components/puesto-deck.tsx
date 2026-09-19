"use client";

import { CmdProgress } from "@/components/comanda/primitives";
import { WhoChip } from "@/components/comanda/task-bits";
import { puestoColor } from "@/lib/turno/colors";
import { puestoState, turnoProgress, type PuestoGroup, type PuestoStatus } from "@/lib/turno/state";
import type { TurnoPerson, TurnoShift } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";
import { Avatar } from "./avatar";
import { CloseButton } from "./checklist";

const STATUS_UI: Record<PuestoStatus, { label: string; color: string }> = {
  esperando: { label: "Esperando", color: "var(--amber)" },
  en_curso: { label: "En curso", color: "var(--green)" },
  listo: { label: "Listo", color: "var(--ink)" },
  por_iniciar: { label: "Por iniciar", color: "var(--muted)" },
  sin_tareas: { label: "Sin tareas", color: "var(--muted)" },
};

/** One card per puesto for turnos split into puestos (Apertura / Barista / Aseo…). */
export function PuestoDeck({ shift, group, assignedTo, started, onOpen, onClose, busy }: {
  shift: TurnoShift;
  group: { groups: PuestoGroup[]; shared: TemplateTask[] };
  assignedTo: (g: PuestoGroup) => TurnoPerson | null;
  started: (g: PuestoGroup) => boolean;
  onOpen: (g: PuestoGroup) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const prog = turnoProgress(shift.tasks, shift.completions);
  const closed = shift.instance.status === "closed";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="font-slab" style={{ fontSize: 28 }}>{shift.template.name}<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{shift.template.inicio} – {shift.template.fin}</span>
        <span className="cmd-num" style={{ marginLeft: "auto", fontSize: 12 }}>{prog.done}/{prog.total} tareas · {prog.pct}%</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {group.groups.map((g) => {
          const st = puestoState({ tasks: g.tasks, completions: shift.completions, waitsForTaskId: g.waitsForTaskId, allTasks: shift.tasks, startedAnyway: started(g) });
          const ui = STATUS_UI[st.status];
          const person = assignedTo(g);
          const color = puestoColor(g.puesto?.color ?? "ink");
          return (
            <div key={g.key} role="group" aria-label={`Puesto ${g.puesto?.name ?? shift.template.name}`} style={{ minHeight: 168, border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", boxShadow: `inset 5px 0 0 ${color}`, padding: "14px 16px 14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="font-slab" style={{ fontSize: 22, lineHeight: 1 }}>{g.puesto?.name ?? "Checklist"}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: ui.color, border: `1px solid ${ui.color}`, padding: "3px 7px", borderRadius: 3 }}>{ui.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40 }}>
                {person ? (
                  <>
                    <Avatar initials={person.initials} size={40} />
                    <span>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{person.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: "var(--muted)" }}>asignado hoy</span>
                    </span>
                  </>
                ) : (
                  <WhoChip kind="all" text="Sin asignar · cualquiera" />
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}><CmdProgress done={st.done} total={st.total} color={color} /></div>
                <span className="cmd-num" style={{ fontSize: 12 }}>{st.done}/{st.total}</span>
              </div>
              {st.gate && (
                <div style={{ fontSize: 11, color: st.gate.done ? "var(--muted)" : "var(--amber)" }}>
                  {st.gate.done ? "✓ " : "espera: "}{st.gate.title}
                </div>
              )}
              <button type="button" onClick={() => onOpen(g)} className="cmd-btn" style={{ marginTop: "auto", height: 44, fontSize: 12 }} disabled={closed}>
                {st.status === "listo" ? "Ver lista" : "Abrir lista →"}
              </button>
            </div>
          );
        })}
      </div>
      {group.shared.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)" }}>
          {group.shared.length} tarea{group.shared.length === 1 ? "" : "s"} compartida{group.shared.length === 1 ? "" : "s"} aparecen en cada lista.
        </div>
      )}
      <CloseButton shift={shift} busy={busy} onClose={onClose} />
    </div>
  );
}
