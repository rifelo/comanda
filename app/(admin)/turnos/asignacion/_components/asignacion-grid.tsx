"use client";

import Link from "next/link";
import * as React from "react";
import { publishWeek } from "../_actions";

type GridShift = {
  id: string;
  name: string;
  inicio: string;
  dias: boolean[];
};

type GridMember = {
  id: string;
  initials: string;
  name: string;
  email: string;
  active: boolean;
};

type GridAssignment = {
  template_id: string;
  dia_idx: number;
  member_id: string | null;
};

type DayCol = { d: string; n: string; hoy: boolean };

const DAYL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MON = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function parseISO(yyyyMMdd: string): Date {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtISO(dt: Date): string {
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO week number per the design's reference (semana 20 = Mon 12·MAY 2026). */
function isoWeekNumber(dt: Date): number {
  const target = new Date(dt.getTime());
  target.setUTCHours(0, 0, 0, 0);
  // ISO: Thursday of the same week determines the year.
  target.setUTCDate(target.getUTCDate() + 4 - ((target.getUTCDay() + 6) % 7 + 1));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function AsignacionGrid({
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
  // Local state keyed by week_start so navigating away and back keeps the
  // user's pending edits. The map is initialized lazily from the server
  // payload so SSR matches the first render.
  const [weekStart, setWeekStart] = React.useState(initialWeekStart);
  const [asigByWeek, setAsigByWeek] = React.useState<
    Record<string, Map<string, string | null>>
  >(() => {
    const initial = new Map<string, string | null>();
    for (const a of initialAssignments) {
      initial.set(`${a.template_id}-${a.dia_idx}`, a.member_id);
    }
    return { [initialWeekStart]: initial };
  });
  const [dirtyWeeks, setDirtyWeeks] = React.useState<Record<string, boolean>>({});
  const [menuKey, setMenuKey] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const asig = asigByWeek[weekStart] ?? new Map<string, string | null>();
  const dirty = !!dirtyWeeks[weekStart];

  // Derive week dates from the current weekStart.
  const monday = parseISO(weekStart);
  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const dias: DayCol[] = DAYL.map((d, i) => {
    const dt = new Date(monday.getTime());
    dt.setUTCDate(monday.getUTCDate() + i);
    return {
      d,
      n: String(dt.getUTCDate()).padStart(2, "0"),
      hoy: fmtISO(dt) === today,
    };
  });
  const semana = isoWeekNumber(monday);
  const rangeLabel = `${monday.getUTCDate()}·${MON[monday.getUTCMonth()]} — ${sunday.getUTCDate()}·${MON[sunday.getUTCMonth()]}`;
  const isCurrentWeek = monday.getTime() <= parseISO(today).getTime()
    && parseISO(today).getTime() <= sunday.getTime();

  function setAssign(key: string, value: string | null) {
    setAsigByWeek((prev) => {
      const next: Record<string, Map<string, string | null>> = { ...prev };
      const map = new Map(next[weekStart] ?? []);
      if (value === null) map.set(key, null);
      else map.set(key, value);
      next[weekStart] = map;
      return next;
    });
    setMenuKey(null);
    setDirtyWeeks((d) => ({ ...d, [weekStart]: true }));
  }

  function goWeek(delta: number) {
    setMenuKey(null);
    const dt = parseISO(weekStart);
    dt.setUTCDate(dt.getUTCDate() + delta * 7);
    const next = fmtISO(dt);
    setWeekStart(next);
    // Lazy-initialise empty map so unseeded weeks render correctly.
    setAsigByWeek((prev) =>
      prev[next] ? prev : { ...prev, [next]: new Map() },
    );
  }

  function goToday() {
    setMenuKey(null);
    const dt = parseISO(today);
    const dow = dt.getUTCDay();
    const sub = dow === 0 ? 6 : dow - 1;
    dt.setUTCDate(dt.getUTCDate() - sub);
    const next = fmtISO(dt);
    setWeekStart(next);
    setAsigByWeek((prev) =>
      prev[next] ? prev : { ...prev, [next]: new Map() },
    );
  }

  function publish() {
    setError(null);
    const changes: GridAssignment[] = [];
    // Send only operating cells (closed days can't have assignments anyway,
    // and we don't want to delete rows we never touched).
    for (const s of shifts) {
      for (let i = 0; i < 7; i++) {
        if (!s.dias[i]) continue;
        const k = `${s.id}-${i}`;
        const v = asig.get(k);
        changes.push({
          template_id: s.id,
          dia_idx: i,
          member_id: v == null ? null : v,
        });
      }
    }
    startTransition(async () => {
      const r = await publishWeek({ week_start: weekStart, changes });
      if (r && "error" in r && r.error) {
        setError(r.error);
      } else {
        setDirtyWeeks((d) => ({ ...d, [weekStart]: false }));
      }
    });
  }

  // Coverage counter (operating cells filled / total operating).
  let filled = 0;
  let totalCells = 0;
  for (const s of shifts) {
    for (let i = 0; i < 7; i++) {
      if (!s.dias[i]) continue;
      totalCells++;
      const v = asig.get(`${s.id}-${i}`);
      if (v != null) filled++;
    }
  }

  // Per-person weekly count.
  const counts: Record<string, number> = {};
  for (const m of roster) counts[m.id] = 0;
  for (const s of shifts) {
    for (let i = 0; i < 7; i++) {
      if (!s.dias[i]) continue;
      const v = asig.get(`${s.id}-${i}`);
      if (v != null && counts[v] != null) counts[v]++;
    }
  }

  const memberById = new Map(roster.map((m) => [m.id, m]));

  return (
    <div>
      <div
        className="flex items-end justify-between"
        style={{
          padding: "20px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            SEMANA {semana} · {rangeLabel} · DANIEL&apos;S BURGER
          </div>
          <h1 className="font-slab" style={{ fontSize: 30, margin: "4px 0 0" }}>
            Asignación de personal
          </h1>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={() => goWeek(-1)}
            className="cmd-btn ghost sm"
          >
            ‹ semana
          </button>
          {!isCurrentWeek ? (
            <button
              type="button"
              onClick={goToday}
              className="cmd-btn ghost sm"
            >
              hoy
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => goWeek(1)}
            className="cmd-btn ghost sm"
          >
            semana ›
          </button>
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={publish}
            className="cmd-btn sm"
            style={{
              opacity: dirty && !pending ? 1 : 0.4,
              cursor: dirty && !pending ? "pointer" : "not-allowed",
            }}
          >
            {pending ? "Publicando…" : "Publicar horario"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "10px 32px",
            background: "var(--paper-lt)",
            color: "var(--red)",
            fontSize: 12,
            borderBottom: "1px solid var(--rule)",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 260px", gap: 0 }}
      >
        <div
          style={{
            padding: "24px 24px 24px 32px",
            borderRight: "1px dashed var(--rule)",
          }}
        >
          <div
            className="flex justify-between items-baseline"
            style={{ marginBottom: 14 }}
          >
            <span
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Encargado por turno
            </span>
            <span
              className="cmd-num"
              style={{
                fontSize: 11,
                color: filled === totalCells ? "var(--green)" : "var(--amber)",
              }}
            >
              {filled}/{totalCells} cubiertos
            </span>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: "96px repeat(7, 1fr)", gap: 6 }}
          >
            <div />
            {dias.map((d) => (
              <div key={d.n} style={{ textAlign: "center", paddingBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: d.hoy ? "var(--red)" : "var(--muted)",
                    fontWeight: d.hoy ? 700 : 400,
                  }}
                >
                  {d.d}
                </div>
                <div
                  className="cmd-num font-slab"
                  style={{
                    fontSize: 16,
                    color: d.hoy ? "var(--red)" : "var(--ink)",
                  }}
                >
                  {d.n}
                </div>
              </div>
            ))}

            {shifts.map((s) => (
              <React.Fragment key={s.id}>
                <div
                  className="flex flex-col justify-center"
                  style={{ paddingRight: 8 }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    className="cmd-num text-muted"
                    style={{ fontSize: 9 }}
                  >
                    {s.inicio}
                  </div>
                </div>
                {dias.map((d, i) => {
                  const k = `${s.id}-${i}`;
                  const operating = s.dias[i];
                  const whoId = asig.get(k) ?? null;
                  const who = whoId ? memberById.get(whoId) : null;
                  const open = menuKey === k;
                  const alignRight = i >= 5;
                  const isToday = d.hoy;

                  if (!operating) {
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-center"
                        style={{
                          border: "1px solid var(--rule-soft)",
                          minHeight: 54,
                          position: "relative",
                          background:
                            "repeating-linear-gradient(45deg, var(--rule-soft) 0 1px, transparent 1px 7px)",
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          className="text-muted"
                          style={{
                            fontSize: 8,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            background: "var(--paper)",
                            padding: "1px 4px",
                          }}
                        >
                          cerrado
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={i} style={{ position: "relative" }}>
                      <button
                        type="button"
                        onClick={() => setMenuKey(open ? null : k)}
                        style={{
                          width: "100%",
                          border: `1px solid ${who ? "var(--ink)" : "var(--rule-soft)"}`,
                          background: who ? "var(--paper-lt)" : "transparent",
                          minHeight: 54,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow: isToday
                            ? "inset 0 0 0 2px var(--red)"
                            : open
                              ? "inset 0 0 0 2px var(--ink)"
                              : "none",
                          padding: 4,
                        }}
                      >
                        {who ? (
                          <span
                            className="inline-flex items-center justify-center"
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              border: "1.5px solid var(--ink)",
                              background: "var(--paper)",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            {who.initials}
                          </span>
                        ) : (
                          <span
                            className="text-muted"
                            style={{ fontSize: 18, lineHeight: 1 }}
                          >
                            ＋
                          </span>
                        )}
                      </button>

                      {open ? (
                        <>
                          <div
                            onClick={() => setMenuKey(null)}
                            style={{
                              position: "fixed",
                              inset: 0,
                              zIndex: 30,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              marginTop: 4,
                              zIndex: 31,
                              [alignRight ? "right" : "left"]: 0,
                              width: 210,
                              background: "var(--paper)",
                              border: "1.5px solid var(--ink)",
                              boxShadow: "3px 3px 0 rgba(0,0,0,.12)",
                            }}
                          >
                            <div
                              className="flex justify-between text-muted"
                              style={{
                                padding: "7px 10px",
                                borderBottom: "1px dashed var(--rule)",
                                fontSize: 9,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                              }}
                            >
                              <span style={{ textTransform: "capitalize" }}>
                                Turno {s.name}
                              </span>
                              <span>
                                {d.d} {d.n}
                              </span>
                            </div>
                            {roster.filter((p) => p.active).length === 0 ? (
                              <div
                                className="text-muted"
                                style={{
                                  padding: "12px 10px",
                                  fontSize: 11,
                                }}
                              >
                                Sin equipo activo.{" "}
                                <Link href="/configuracion/equipo" className="cmd-link">
                                  agregar →
                                </Link>
                              </div>
                            ) : (
                              roster
                                .filter((p) => p.active)
                                .map((p) => {
                                  const on = whoId === p.id;
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => setAssign(k, p.id)}
                                      className="flex items-center"
                                      style={{
                                        gap: 9,
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "8px 10px",
                                        border: "none",
                                        cursor: "pointer",
                                        background: on
                                          ? "var(--paper-lt)"
                                          : "transparent",
                                        color: "var(--ink)",
                                        minHeight: 0,
                                      }}
                                    >
                                      <span
                                        className="inline-flex items-center justify-center"
                                        style={{
                                          width: 24,
                                          height: 24,
                                          borderRadius: "50%",
                                          border: "1.5px solid var(--ink)",
                                          background: "var(--paper)",
                                          fontSize: 9,
                                          fontWeight: 700,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {p.initials}
                                      </span>
                                      <span
                                        className="flex-1 min-w-0"
                                        style={{ display: "block" }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 500,
                                            display: "block",
                                          }}
                                        >
                                          {p.name}
                                        </span>
                                        <span
                                          className="text-muted"
                                          style={{
                                            fontSize: 9,
                                            display: "block",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {p.email || "—"}
                                        </span>
                                      </span>
                                      {on ? (
                                        <span
                                          style={{
                                            color: "var(--green)",
                                            fontSize: 13,
                                          }}
                                        >
                                          ✓
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })
                            )}
                            {whoId ? (
                              <button
                                type="button"
                                onClick={() => setAssign(k, null)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  border: "none",
                                  borderTop: "1px dashed var(--rule)",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  color: "var(--red)",
                                  background: "transparent",
                                  minHeight: 0,
                                }}
                              >
                                Quitar asignación
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div
            className="flex text-muted"
            style={{
              marginTop: 18,
              gap: 18,
              fontSize: 10,
              letterSpacing: "0.08em",
              flexWrap: "wrap",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  boxShadow: "inset 0 0 0 2px var(--red)",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              hoy
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: "1px solid var(--rule-soft)",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              sin asignar · clic para asignar
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: "1px solid var(--rule-soft)",
                  background:
                    "repeating-linear-gradient(45deg, var(--rule-soft) 0 1px, transparent 1px 4px)",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              turno cerrado ese día
            </span>
          </div>
        </div>

        {/* roster workload panel */}
        <div style={{ padding: "24px 24px" }}>
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Carga del equipo
          </div>
          {roster.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 11 }}>
              Sin equipo todavía.{" "}
              <Link href="/configuracion/equipo" className="cmd-link">
                agregar persona →
              </Link>
            </div>
          ) : (
            roster.map((p) => (
              <div
                key={p.id}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule-soft)",
                  opacity: p.active ? 1 : 0.6,
                }}
              >
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "1.5px solid var(--ink)",
                    background: "var(--paper)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {p.initials}
                </span>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="cmd-num"
                    style={{ fontSize: 14, fontWeight: 700 }}
                  >
                    {counts[p.id] ?? 0}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 8, letterSpacing: "0.12em" }}
                  >
                    TURNOS
                  </div>
                </div>
              </div>
            ))
          )}
          <div
            className="text-muted"
            style={{ fontSize: 10, marginTop: 14, lineHeight: 1.5 }}
          >
            Para agregar o editar personas, ve al módulo{" "}
            <Link href="/configuracion/equipo" className="cmd-link">
              Equipo
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
