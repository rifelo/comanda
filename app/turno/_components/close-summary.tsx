"use client";

import Link from "next/link";
import { CmdProgress, Stamp } from "@/components/comanda/primitives";
import { formatDuration, summarize } from "@/lib/turno/blocks";
import type { TurnoActor, TurnoShift } from "@/lib/turno/server";
import { formatTime } from "@/lib/utils";
import { signOutTurno } from "../auth-actions";

/**
 * Confirm sheet before closing: what is still pending, so "cerrar igual"
 * is a decision and not a slip.
 */
export function CloseConfirm({ shift, now, busy, cajaPending, onCancel, onConfirm }: {
  shift: TurnoShift;
  now: string;
  busy: boolean;
  /** The turno has an arqueo task and no cash close was sent yet (0037). */
  cajaPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = summarize({
    tasks: shift.tasks, completions: shift.completions, adHoc: shift.adHoc, novedades: shift.novedades.length,
    now, inicio: shift.template.inicio, fin: shift.template.fin, opened_at: shift.instance.opened_at, closed_at: null,
  });
  const clean = s.pendingTasks.length === 0 && s.adHocPending === 0 && s.photosDone === s.photosTotal && !cajaPending;
  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,14,8,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Cerrar turno" style={{ width: "min(560px, 96vw)", maxHeight: "88vh", overflowY: "auto", border: "1.5px solid var(--ink)", borderRadius: 10, background: "var(--paper-lt)", padding: "20px 22px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
        <div className="font-slab" style={{ fontSize: 24, lineHeight: 1.1 }}>
          {clean ? "Todo listo." : "Faltan cosas."}<span style={{ color: "var(--red)" }}>.</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          {clean
            ? `Cierras ${shift.template.name} con todas las tareas y fotos completas.`
            : "Puedes cerrar igual, pero queda registrado así en el resumen que ve el administrador."}
        </div>
        {!clean && (
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 13 }}>
            {s.pendingTasks.length > 0 && <li><b style={{ color: "var(--red)" }}>{s.pendingTasks.length}</b> tarea{s.pendingTasks.length === 1 ? "" : "s"} sin marcar{s.overdue > 0 ? ` · ${s.overdue} atrasada${s.overdue === 1 ? "" : "s"}` : ""}</li>}
            {s.photosTotal - s.photosDone > 0 && <li><b style={{ color: "var(--red)" }}>{s.photosTotal - s.photosDone}</b> foto{s.photosTotal - s.photosDone === 1 ? "" : "s"} sin tomar</li>}
            {s.adHocPending > 0 && <li><b style={{ color: "var(--red)" }}>{s.adHocPending}</b> inmediata{s.adHocPending === 1 ? "" : "s"} pendiente{s.adHocPending === 1 ? "" : "s"}</li>}
            {cajaPending && <li><b style={{ color: "var(--red)" }}>Falta el cierre de caja</b> · <Link href="/turno/caja" style={{ color: "var(--ink)", textDecoration: "underline" }}>Contar ahora →</Link></li>}
          </ul>
        )}
        {s.pendingTasks.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", border: "1px dashed var(--rule)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", maxHeight: 180, overflowY: "auto" }}>
            {s.pendingTasks.slice(0, 12).map((t) => <div key={t.id} style={{ padding: "2px 0" }}>· {t.title}</div>)}
            {s.pendingTasks.length > 12 && <div style={{ padding: "2px 0", color: "var(--muted)" }}>… y {s.pendingTasks.length - 12} más</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onCancel} disabled={busy} className="cmd-btn ghost" style={{ flex: 1, height: 56 }}>Volver</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="cmd-btn red" style={{ flex: 1.4, height: 56, fontSize: 14 }}>
            {busy ? "Cerrando…" : clean ? "Cerrar turno · entregar →" : "Cerrar turno igual"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The receipt shown after a close: what happened this turno, in numbers. */
export function CloseSummary({ shift, actor, tz, now, othersOpen, onSwitch }: {
  shift: TurnoShift;
  actor: TurnoActor;
  tz: string;
  now: string;
  othersOpen: boolean;
  onSwitch: () => void;
}) {
  const s = summarize({
    tasks: shift.tasks, completions: shift.completions, adHoc: shift.adHoc, novedades: shift.novedades.length,
    now, inicio: shift.template.inicio, fin: shift.template.fin, opened_at: shift.instance.opened_at, closed_at: shift.instance.closed_at,
  });
  const cell =(label: string, value: string, tone?: string) => (
    <div style={{ padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 6, background: "var(--paper)" }}>
      <div style={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div className="cmd-num font-slab" style={{ fontSize: 26, lineHeight: 1.1, marginTop: 4, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
  return (
    <section aria-label="Resumen del turno" className="cmd-noise" style={{ maxWidth: 640, margin: "8px auto 0", border: "1.5px solid var(--ink)", borderRadius: 10, background: "var(--paper-lt)", padding: "22px 24px 20px", boxShadow: "3px 3px 0 rgba(0,0,0,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)" }}>Turno entregado</div>
          <div className="font-slab" style={{ fontSize: 28, lineHeight: 1.05, marginTop: 2 }}>{shift.template.name}<span style={{ color: "var(--red)" }}>.</span></div>
        </div>
        <Stamp rotate={-6} size={12} color="var(--green)" style={{ marginLeft: "auto" }}>cerrado ✓</Stamp>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16, fontSize: 12.5, lineHeight: 1.5 }}>
        <div><span style={{ color: "var(--muted)" }}>Abrió</span><br />{shift.opened_by_name ?? actor.fullName}{shift.instance.opened_at ? ` · ${formatTime(shift.instance.opened_at, tz)}` : ""}</div>
        <div><span style={{ color: "var(--muted)" }}>Cerró</span><br />{shift.closed_by_name ?? actor.fullName}{shift.instance.closed_at ? ` · ${formatTime(shift.instance.closed_at, tz)}` : ""}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <div style={{ flex: 1 }}><CmdProgress done={s.done} total={s.total} color="var(--ink)" /></div>
        <span className="cmd-num" style={{ fontSize: 12 }}>{s.total ? Math.round((s.done / s.total) * 100) : 0}%</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
        {cell("Tareas", `${s.done}/${s.total}`, s.done === s.total ? "var(--green)" : "var(--red)")}
        {cell("Fotos", `${s.photosDone}/${s.photosTotal}`, s.photosDone === s.photosTotal ? "var(--green)" : "var(--red)")}
        {cell("Duración", s.durationMin === null ? "—" : formatDuration(s.durationMin))}
        {cell("Novedades", String(s.novedades))}
        {cell("Inmediatas pend.", String(s.adHocPending), s.adHocPending ? "var(--red)" : undefined)}
        {cell("Sin marcar", String(s.pendingTasks.length), s.pendingTasks.length ? "var(--red)" : undefined)}
      </div>

      {s.pendingTasks.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--red)", marginBottom: 6 }}>Quedó pendiente</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)" }}>
            {s.pendingTasks.map((t) => <div key={t.id}>· {t.title}</div>)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <form action={signOutTurno} style={{ flex: 1.4, minWidth: 200 }}>
          <button type="submit" className="cmd-btn red" style={{ width: "100%", height: 56, fontSize: 14 }}>Salir de la tablet →</button>
        </form>
        {othersOpen && (
          <button type="button" onClick={onSwitch} className="cmd-btn ghost" style={{ flex: 1, minWidth: 160, height: 56 }}>Ver otro turno</button>
        )}
      </div>
    </section>
  );
}
