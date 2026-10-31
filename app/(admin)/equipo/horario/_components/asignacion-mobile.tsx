"use client";

import * as React from "react";
import { publishWeek } from "../_actions";
import { PUESTO_COLORS } from "@/lib/turno/colors";

type GridPuesto = { id: string; name: string; color: string };
type GridShift = { id: string; name: string; inicio: string; dias: boolean[]; puestos: GridPuesto[] };
type GridMember = { id: string; initials: string; name: string; email: string; active: boolean };
type GridAssignment = { template_id: string; dia_idx: number; puesto_id: string | null; member_id: string | null };
type Slot = { id: string | null; name: string | null; color: string | null };
function slotsOf(s: GridShift): Slot[] {
  return s.puestos.length
    ? s.puestos.map((p) => ({ id: p.id, name: p.name, color: p.color }))
    : [{ id: null, name: null, color: null }];
}
function keyFor(templateId: string, diaIdx: number, puestoId: string | null): string {
  return `${templateId}-${diaIdx}-${puestoId ?? "all"}`;
}


const DAYL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MON = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function parseISO(yyyyMMdd: string): Date {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtISO(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function isoWeekNumber(dt: Date): number {
  const target = new Date(dt.getTime());
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() + 4 - (((target.getUTCDay() + 6) % 7) + 1));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function todayIndexIn(weekStart: string, today: string): number {
  const diff = Math.round((parseISO(today).getTime() - parseISO(weekStart).getTime()) / 86400000);
  return diff >= 0 && diff <= 6 ? diff : 0;
}

/** Avatar — initials in a ring. */
function Avatar({ children, size = 30 }: { children: React.ReactNode; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        fontSize: size * 0.36,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8, padding: "16px 14px 8px" }}>
      <span className="text-muted" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        {children}
      </span>
      <span className="flex-1" style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }} />
      {right != null ? <span className="text-muted" style={{ fontSize: 10 }}>{right}</span> : null}
    </div>
  );
}

/** Mobile Asignación — week bar → day picker → per-turno rows → bottom-sheet
 *  person picker, with a sticky publish bar. Shares the same publishWeek action
 *  and key format (`template_id-dia_idx`) as the desktop grid. */
export function AsignacionMobile({
  initialWeekStart,
  today,
  shifts,
  roster,
  initialAssignments,
}: {
  initialWeekStart: string;
  today: string;
  shifts: GridShift[];
  roster: GridMember[];
  initialAssignments: GridAssignment[];
}) {
  const [weekStart, setWeekStart] = React.useState(initialWeekStart);
  const [asigByWeek, setAsigByWeek] = React.useState<Record<string, Map<string, string | null>>>(() => {
    const m = new Map<string, string | null>();
    for (const a of initialAssignments) m.set(keyFor(a.template_id, a.dia_idx, a.puesto_id ?? null), a.member_id);
    return { [initialWeekStart]: m };
  });
  const [dirtyWeeks, setDirtyWeeks] = React.useState<Record<string, boolean>>({});
  const [daySel, setDaySel] = React.useState(() => todayIndexIn(initialWeekStart, today));
  const [sheet, setSheet] = React.useState<{ templateId: string; dayIdx: number; puestoId: string | null } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const asig = asigByWeek[weekStart] ?? new Map<string, string | null>();
  const dirty = !!dirtyWeeks[weekStart];

  const monday = parseISO(weekStart);
  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const dias = DAYL.map((d, i) => {
    const dt = new Date(monday.getTime());
    dt.setUTCDate(monday.getUTCDate() + i);
    return { d, n: String(dt.getUTCDate()).padStart(2, "0"), hoy: fmtISO(dt) === today };
  });
  const semana = isoWeekNumber(monday);
  const rangeLabel = `${monday.getUTCDate()}·${MON[monday.getUTCMonth()]} — ${sunday.getUTCDate()}·${MON[sunday.getUTCMonth()]}`;

  const memberById = new Map(roster.map((m) => [m.id, m]));

  function setAssign(key: string, value: string | null) {
    setAsigByWeek((prev) => {
      const next = { ...prev };
      const map = new Map(next[weekStart] ?? []);
      map.set(key, value);
      next[weekStart] = map;
      return next;
    });
    setDirtyWeeks((d) => ({ ...d, [weekStart]: true }));
    setSheet(null);
  }

  function goWeek(delta: number) {
    const dt = parseISO(weekStart);
    dt.setUTCDate(dt.getUTCDate() + delta * 7);
    const next = fmtISO(dt);
    setWeekStart(next);
    setAsigByWeek((prev) => (prev[next] ? prev : { ...prev, [next]: new Map() }));
  }

  function publish() {
    setError(null);
    const changes: GridAssignment[] = [];
    for (const s of shifts) {
      for (let i = 0; i < 7; i++) {
        if (!s.dias[i]) continue;
        for (const slot of slotsOf(s)) {
          const v = asig.get(keyFor(s.id, i, slot.id));
          changes.push({ template_id: s.id, dia_idx: i, puesto_id: slot.id, member_id: v == null ? null : v });
        }
      }
    }
    startTransition(async () => {
      const r = await publishWeek({ week_start: weekStart, changes });
      if (r && "error" in r && r.error) setError(r.error);
      else setDirtyWeeks((d) => ({ ...d, [weekStart]: false }));
    });
  }

  // coverage + per-person counts for the current week
  let filled = 0;
  let totalCells = 0;
  const counts: Record<string, number> = {};
  for (const m of roster) counts[m.id] = 0;
  for (const s of shifts) {
    for (let i = 0; i < 7; i++) {
      if (!s.dias[i]) continue;
      for (const slot of slotsOf(s)) {
        totalCells++;
        const v = asig.get(keyFor(s.id, i, slot.id));
        if (v != null) {
          filled++;
          if (counts[v] != null) counts[v]++;
        }
      }
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      {/* week bar */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "12px 14px", borderBottom: "1px dashed var(--rule)", gap: 8 }}
      >
        <button type="button" className="cmd-btn ghost sm" onClick={() => goWeek(-1)}>
          ‹
        </button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>Semana {semana}</div>
          <div className="cmd-num text-muted" style={{ fontSize: 10 }}>{rangeLabel}</div>
        </div>
        <button type="button" className="cmd-btn ghost sm" onClick={() => goWeek(1)}>
          ›
        </button>
      </div>

      {/* day picker */}
      <div className="flex" style={{ gap: 6, padding: "12px 14px 8px", overflowX: "auto" }}>
        {dias.map((d, i) => {
          const on = i === daySel;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setDaySel(i)}
              style={{
                flexShrink: 0,
                width: 46,
                padding: "8px 0",
                borderRadius: 4,
                cursor: "pointer",
                border: `1.5px solid ${on ? "var(--ink)" : d.hoy ? "var(--red)" : "var(--rule-soft)"}`,
                background: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper-lt)" : "var(--ink)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", opacity: on ? 0.85 : 0.6 }}>
                {d.d}
              </div>
              <div
                className="cmd-num font-slab"
                style={{ fontSize: 17, marginTop: 2, color: on ? "var(--paper-lt)" : d.hoy ? "var(--red)" : "var(--ink)" }}
              >
                {d.n}
              </div>
            </button>
          );
        })}
      </div>

      <SectionLabel right={`${filled}/${totalCells} cubiertos`}>
        {DAYL[daySel]} {dias[daySel].n} · encargados
      </SectionLabel>

      <div style={{ padding: "0 14px 16px" }}>
        {shifts.flatMap((turno) => slotsOf(turno).map((slot) => ({ turno, slot }))).map(({ turno, slot }) => {
          const operating = turno.dias[daySel];
          const key = keyFor(turno.id, daySel, slot.id);
          const whoId = asig.get(key) ?? null;
          const person = whoId ? memberById.get(whoId) : null;
          const rowKey = key;
          if (!operating) {
            if (slot.id && turno.puestos[0]?.id !== slot.id) return null; // one "cerrado" row per turno
            return (
              <div
                key={rowKey}
                className="flex items-center justify-between"
                style={{
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 3,
                  padding: "14px",
                  marginBottom: 10,
                  background: "repeating-linear-gradient(45deg, var(--rule-soft) 0 1px, transparent 1px 8px)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>Turno {turno.name}</span>
                <span
                  className="text-muted"
                  style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", background: "var(--paper)", padding: "2px 6px" }}
                >
                  cerrado
                </span>
              </div>
            );
          }
          return (
            <button
              key={rowKey}
              type="button"
              onClick={() => setSheet({ templateId: turno.id, dayIdx: daySel, puestoId: slot.id })}
              className="flex items-center"
              style={{
                width: "100%",
                textAlign: "left",
                gap: 12,
                border: `1.5px solid ${whoId ? "var(--ink)" : "var(--rule-soft)"}`,
                boxShadow: slot.color ? `inset 5px 0 0 ${PUESTO_COLORS[slot.color] ?? "var(--ink)"}` : undefined,
                borderRadius: 3,
                padding: "13px 14px",
                marginBottom: 10,
                background: whoId ? "var(--paper-lt)" : "transparent",
                cursor: "pointer",
              }}
            >
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>Turno {turno.name}</div>
                <div className="cmd-num text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                  {turno.inicio}{slot.name ? ` · ${slot.name}` : ""}
                </div>
              </div>
              {person ? (
                <div className="flex items-center" style={{ gap: 9 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{person.name}</div>
                    <div className="text-muted" style={{ fontSize: 9.5 }}>cambiar →</div>
                  </div>
                  <Avatar size={34}>{person.initials}</Avatar>
                </div>
              ) : (
                <span
                  style={{ fontSize: 11, color: "var(--red)", border: "1px solid var(--red)", borderRadius: 2, padding: "6px 10px", letterSpacing: "0.06em" }}
                >
                  + asignar
                </span>
              )}
            </button>
          );
        })}
      </div>

      <SectionLabel>Carga del equipo · semana</SectionLabel>
      <div style={{ padding: "0 14px 24px" }}>
        {roster.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 12 }}>Sin equipo todavía.</div>
        ) : (
          roster.map((p) => (
            <div
              key={p.id}
              className="flex items-center"
              style={{ gap: 10, padding: "9px 0", borderBottom: "1px solid var(--rule-soft)", opacity: p.active ? 1 : 0.6 }}
            >
              <Avatar size={28}>{p.initials}</Avatar>
              <span className="flex-1" style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</span>
              <span className="cmd-num" style={{ fontSize: 14, fontWeight: 700 }}>{counts[p.id] ?? 0}</span>
              <span className="text-muted" style={{ fontSize: 8, letterSpacing: "0.12em" }}>TURNOS</span>
            </div>
          ))
        )}
      </div>

      {/* publish bar */}
      {dirty || error ? (
        <div
          style={{ position: "sticky", bottom: 0, padding: "12px 14px", background: "var(--paper)", borderTop: "1.5px solid var(--ink)" }}
        >
          {error ? (
            <div style={{ color: "var(--red)", fontSize: 11, marginBottom: 8, textAlign: "center" }}>{error}</div>
          ) : null}
          <button
            type="button"
            className="cmd-btn red"
            style={{ width: "100%", padding: 13, opacity: dirty && !pending ? 1 : 0.5 }}
            disabled={!dirty || pending}
            onClick={publish}
          >
            {pending ? "Publicando…" : `Publicar horario · semana ${semana}`}
          </button>
        </div>
      ) : null}

      {/* person picker — bottom sheet */}
      {sheet ? (
        <PersonSheet
          sheet={sheet}
          shifts={shifts}
          roster={roster}
          dayLabel={`${DAYL[sheet.dayIdx]} ${dias[sheet.dayIdx].n}`}
          current={asig.get(keyFor(sheet.templateId, sheet.dayIdx, sheet.puestoId)) ?? null}
          onPick={(id) => setAssign(keyFor(sheet.templateId, sheet.dayIdx, sheet.puestoId), id)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function PersonSheet({
  sheet,
  shifts,
  roster,
  dayLabel,
  current,
  onPick,
  onClose,
}: {
  sheet: { templateId: string; dayIdx: number; puestoId: string | null };
  shifts: GridShift[];
  roster: GridMember[];
  dayLabel: string;
  current: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const shift = shifts.find((s) => s.id === sheet.templateId);
  const puestoName = shift?.puestos.find((p) => p.id === sheet.puestoId)?.name;
  const shiftName = `${shift?.name ?? ""}${puestoName ? ` · ${puestoName}` : ""}`;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,.4)" }} />
      <div
        className="bg-paper"
        style={{
          position: "relative",
          maxHeight: "78%",
          display: "flex",
          flexDirection: "column",
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          border: "1.5px solid var(--ink)",
          borderBottom: "none",
          boxShadow: "0 -10px 30px rgba(20,16,10,.25)",
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: "16px 18px 12px", borderBottom: "1px dashed var(--rule)" }}
        >
          <div>
            <div className="font-slab" style={{ fontSize: 18, textTransform: "capitalize" }}>Turno {shiftName}</div>
            <div className="text-muted" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
              {dayLabel}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: "none", fontSize: 22, color: "var(--muted)", cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 10px 24px" }}>
          {roster.filter((p) => p.active).length === 0 ? (
            <div className="text-muted" style={{ padding: "16px 10px", fontSize: 12 }}>Sin equipo activo.</div>
          ) : (
            roster
              .filter((p) => p.active)
              .map((p) => {
                const on = current === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPick(p.id)}
                    className="flex items-center"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      gap: 11,
                      padding: "11px 10px",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      background: on ? "var(--paper-lt)" : "transparent",
                      color: "var(--ink)",
                    }}
                  >
                    <Avatar size={32}>{p.initials}</Avatar>
                    <span className="flex-1 min-w-0">
                      <span style={{ fontSize: 13.5, fontWeight: 500, display: "block" }}>{p.name}</span>
                      <span
                        className="text-muted"
                        style={{ fontSize: 10, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {p.email || "—"}
                      </span>
                    </span>
                    {on ? <span style={{ color: "var(--green)", fontSize: 15 }}>✓</span> : null}
                  </button>
                );
              })
          )}
          {current ? (
            <button
              type="button"
              onClick={() => onPick(null)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 10px",
                marginTop: 4,
                border: "none",
                borderTop: "1px dashed var(--rule)",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--red)",
                background: "transparent",
              }}
            >
              Quitar asignación
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
