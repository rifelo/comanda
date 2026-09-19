"use client";

import * as React from "react";
import { puestoColor } from "@/lib/turno/colors";
import { bucketTasks } from "@/lib/turno/blocks";
import { puestoState, turnoProgress, ALL_KEY, type PuestoGroup } from "@/lib/turno/state";
import type { TurnoActor, TurnoPerson, TurnoShift } from "@/lib/turno/server";
import type { AdHocTask, TemplateTask } from "@/lib/types";
import { linkChip } from "./avatar";
import { Inmediatas } from "./inmediatas";
import { SectionHead } from "./section-head";
import { TurnoTaskRow } from "./task-row";

/**
 * The checklist of one turno (or one puesto of it), in the order an ops
 * board reads: inmediatas → atrasadas → ahora → luego → sin hora → hechas.
 */
export function Checklist({ shift, group, shared, flat, me, actor, now, tz, started, busy, onBack, onStartAnyway, onToggle, onToggleAdHoc, onClose }: {
  shift: TurnoShift;
  group: PuestoGroup;
  shared: TemplateTask[];
  /** No puestos on this turno: there is no deck to go back to. */
  flat: boolean;
  me: TurnoPerson;
  actor: TurnoActor;
  now: string;
  tz: string;
  started: boolean;
  busy: string | null;
  onBack: () => void;
  onStartAnyway: () => void;
  onToggle: (t: TemplateTask) => void;
  onToggleAdHoc: (t: AdHocTask, done: boolean) => void;
  onClose: () => void;
}) {
  const [showDone, setShowDone] = React.useState(false);
  const st = puestoState({ tasks: group.tasks, completions: shift.completions, waitsForTaskId: group.waitsForTaskId, allTasks: shift.tasks, startedAnyway: started });
  const gateWho = st.gate && !st.gate.done ? (() => {
    const gateTask = shift.tasks.find((t) => t.id === st.gate!.taskId);
    return shift.puestos.find((p) => p.puesto_id === gateTask?.puesto_id)?.puesto.name ?? null;
  })() : null;
  const closed = shift.instance.status === "closed";
  const color = puestoColor(group.puesto?.color ?? "ink");
  const prog = turnoProgress(shift.tasks, shift.completions);

  const sharedIds = React.useMemo(() => new Set(group.key === ALL_KEY ? [] : shared.map((t) => t.id)), [group.key, shared]);
  const visible = group.key === ALL_KEY ? group.tasks : [...group.tasks, ...shared];
  const b = bucketTasks({ tasks: visible, done: (t) => !!shift.completions[t.id], now, inicio: shift.template.inicio, fin: shift.template.fin });
  const nothingPending = b.atrasadas.length + b.ahora.length + b.luego.length + b.sin_hora.length === 0;

  const row = (t: TemplateTask, overdue: boolean) => (
    <TurnoTaskRow key={t.id} t={t} c={shift.completions[t.id]} tz={tz} overdue={overdue} shared={sharedIds.has(t.id)} busy={busy === t.id} disabled={closed} onToggle={() => onToggle(t)} />
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        {!flat && <button type="button" onClick={onBack} style={{ ...linkChip, cursor: "pointer", background: "transparent", fontFamily: "var(--font-mono)" }}>← Puestos</button>}
        <span className="font-slab" style={{ fontSize: flat ? 28 : 22, lineHeight: 1.1 }}>
          {flat ? (
            <>{shift.template.name}<span style={{ color: "var(--red)" }}>.</span></>
          ) : (
            <>{me.name} <span style={{ color: "var(--muted)" }}>·</span> <span style={{ color }}>{group.puesto?.name ?? shift.template.name}</span></>
          )}
        </span>
        <span className="cmd-num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {shift.template.inicio} – {shift.template.fin} · {prog.done}/{prog.total}
        </span>
      </div>

      {st.status === "esperando" && st.gate && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 56, padding: "10px 14px", marginBottom: 14, border: "1.5px solid var(--amber)", background: "color-mix(in srgb, var(--amber) 12%, transparent)", borderRadius: 6 }}>
          <span style={{ fontSize: 13 }}>
            <strong>Esperando{gateWho ? ` a ${gateWho}` : ""}:</strong> {st.gate.title}
          </span>
          <button type="button" onClick={onStartAnyway} className="cmd-btn sm" style={{ marginLeft: "auto" }}>Iniciar de todos modos</button>
        </div>
      )}

      <Inmediatas adHoc={shift.adHoc} actor={actor} now={now} tz={tz} busy={busy} disabled={closed} onToggle={onToggleAdHoc} />

      {b.atrasadas.length > 0 && (
        <section id="turno-sec-atrasadas" style={{ marginBottom: 14, scrollMarginTop: 12 }}>
          <SectionHead label="Atrasadas" count={b.atrasadas.length} tone="var(--red)" />
          {b.atrasadas.map((t) => row(t, true))}
        </section>
      )}

      <section id="turno-sec-ahora" style={{ marginBottom: 14, scrollMarginTop: 12 }}>
        <SectionHead label={`Ahora · ${now}`} count={b.ahora.length} stamp="ahora" tone={b.ahora.length ? "var(--ink)" : undefined} />
        {b.ahora.map((t) => row(t, false))}
        {b.ahora.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)", border: "1px dashed var(--rule)", borderRadius: 6 }}>
            {nothingPending ? (closed ? "Turno cerrado." : "Todo listo. Nada pendiente por ahora.") : "Nada vence en la próxima media hora."}
          </div>
        )}
      </section>

      {b.luego.length > 0 && (
        <section id="turno-sec-luego" style={{ marginBottom: 14, scrollMarginTop: 12 }}>
          <SectionHead label="Luego" count={b.luego.length} />
          {b.luego.map((t) => row(t, false))}
        </section>
      )}

      {b.sin_hora.length > 0 && (
        <section id="turno-sec-sin-hora" style={{ marginBottom: 14, scrollMarginTop: 12 }}>
          <SectionHead label="Sin hora" count={b.sin_hora.length} />
          {b.sin_hora.map((t) => row(t, false))}
        </section>
      )}

      {b.hechas.length > 0 && (
        <section id="turno-sec-hechas" style={{ marginBottom: 14, scrollMarginTop: 12 }}>
          <SectionHead
            label="Hechas"
            count={b.hechas.length}
            action={
              <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="cmd-btn ghost sm" style={{ letterSpacing: ".1em" }}>
                {showDone ? "Ocultar" : `Ver ${b.hechas.length} hechas`}
              </button>
            }
          />
          {showDone && b.hechas.map((t) => row(t, false))}
        </section>
      )}

      {visible.length === 0 && <div style={{ padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Este turno no tiene tareas.</div>}

      {flat && <CloseButton shift={shift} busy={busy === "close"} onClose={onClose} />}
    </div>
  );
}

export function CloseButton({ shift, busy, onClose }: { shift: TurnoShift; busy: boolean; onClose: () => void }) {
  const prog = turnoProgress(shift.tasks, shift.completions);
  const closed = shift.instance.status === "closed";
  return (
    <div style={{ position: "sticky", bottom: 0, marginTop: 24, paddingTop: 12, background: "linear-gradient(transparent, var(--paper) 30%)" }}>
      <button type="button" onClick={onClose} disabled={closed || busy} className={prog.allDone ? "cmd-btn red" : "cmd-btn ghost"} style={{ width: "100%", height: 60, fontSize: 14 }}>
        {closed ? "Turno cerrado" : busy ? "Cerrando…" : prog.allDone ? "Cerrar turno · entregar →" : `Cerrar turno · faltan ${prog.total - prog.done}`}
      </button>
    </div>
  );
}
