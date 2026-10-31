"use client";

import * as React from "react";
import { publishWeek } from "../_actions";
import { ChevronLeft, ChevronRight, Check as CheckIcon } from "lucide-react";
import { PUESTO_COLORS } from "@/lib/turno/colors";
import { Avatar, Button, IconButton, Pill, Sheet } from "@/components/ui";
import { cn } from "@/lib/utils";

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
const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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
  const rangeLabel = `${monday.getUTCDate()} ${MON[monday.getUTCMonth()]} – ${sunday.getUTCDate()} ${MON[sunday.getUTCMonth()]}`;

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

  const sheetShift = sheet ? shifts.find((s) => s.id === sheet.templateId) ?? null : null;
  const sheetPuesto = sheet && sheetShift ? sheetShift.puestos.find((p) => p.id === sheet.puestoId)?.name ?? null : null;
  const current = sheet ? asig.get(keyFor(sheet.templateId, sheet.dayIdx, sheet.puestoId)) ?? null : null;
  const activos = roster.filter((p) => p.active);

  return (
    <div className="relative min-h-full flex flex-col gap-4 pb-6">
      {/* semana */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <IconButton label="Semana anterior" size="sm" onClick={() => goWeek(-1)}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
        <div className="flex-1 text-center">
          <p className="ui-title m-0">Semana {semana}</p>
          <p className="ui-sub m-0 ui-num">{rangeLabel}</p>
        </div>
        <IconButton label="Semana siguiente" size="sm" onClick={() => goWeek(1)}>
          <ChevronRight size={20} aria-hidden />
        </IconButton>
      </div>

      {/* días */}
      <div role="group" aria-label="Día" className="grid grid-cols-7 gap-1.5 px-4">
        {dias.map((d, i) => {
          const on = i === daySel;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => setDaySel(i)}
              className={cn(
                "min-h-[60px] rounded-btn border flex flex-col items-center justify-center gap-0.5 cursor-pointer",
                on ? "bg-strong text-on-strong border-transparent" : "bg-surface text-text border-line",
                !on && d.hoy && "border-brand",
              )}
            >
              <span className={cn("text-[12px] font-semibold", on ? "opacity-80" : "text-muted")}>{d.d}</span>
              <span className="text-[18px] font-bold ui-num leading-none">{d.n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between gap-2 px-4">
        <h2 className="ui-h2 m-0">
          {DAYL[daySel]} {dias[daySel].n}
        </h2>
        <span className="ui-sub ui-num">
          {filled}/{totalCells} cubiertos en la semana
        </span>
      </div>

      <ul className="m-0 px-4 list-none flex flex-col gap-2.5">
        {shifts.flatMap((turno) => slotsOf(turno).map((slot) => ({ turno, slot }))).map(({ turno, slot }) => {
          const operating = turno.dias[daySel];
          const key = keyFor(turno.id, daySel, slot.id);
          const whoId = asig.get(key) ?? null;
          const person = whoId ? memberById.get(whoId) : null;
          if (!operating) {
            if (slot.id && turno.puestos[0]?.id !== slot.id) return null; // one "no abre" row per turno
            return (
              <li key={key} className="flex items-center justify-between gap-3 min-h-14 px-4 rounded-card border border-dashed border-line text-muted">
                <span className="text-[15px] font-semibold">{turno.name}</span>
                <span className="text-[13px]">No abre este día</span>
              </li>
            );
          }
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setSheet({ templateId: turno.id, dayIdx: daySel, puestoId: slot.id })}
                data-testid="horario-slot"
                className="w-full min-h-[76px] flex items-center gap-3 px-4 py-3 rounded-card border border-line bg-surface text-left text-text cursor-pointer hover:bg-surface-2"
                style={slot.color ? { boxShadow: `inset 5px 0 0 ${PUESTO_COLORS[slot.color] ?? "var(--text)"}` } : undefined}
              >
                <span className="flex-1 min-w-0">
                  <span className="ui-title block truncate">{turno.name}</span>
                  <span className="ui-sub block ui-num">
                    {turno.inicio.slice(0, 5)}
                    {slot.name ? ` · ${slot.name}` : ""}
                  </span>
                </span>
                {person ? (
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[15px] font-semibold truncate max-w-[120px]">{person.name}</span>
                    <Avatar name={person.name} initials={person.initials} size="sm" />
                  </span>
                ) : (
                  <Pill tone="late">Sin asignar</Pill>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="carga" className="flex flex-col gap-2 px-4">
        <h2 id="carga" className="ui-label m-0">
          Turnos de cada persona esta semana
        </h2>
        {roster.length === 0 ? (
          <p className="ui-sub m-0">Sin equipo todavía.</p>
        ) : (
          <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
            {roster.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-3 min-h-14 px-4 border-b border-line last:border-b-0", !p.active && "opacity-60")}>
                <Avatar name={p.name} initials={p.initials} size="sm" />
                <span className="flex-1 min-w-0 truncate text-[15px]">{p.name}</span>
                <span className="ui-num text-[17px] font-bold">{counts[p.id] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* publicar */}
      {dirty || error ? (
        <div className="sticky bottom-0 bg-bg border-t border-line px-4 py-3 flex flex-col gap-2">
          {error ? (
            <p role="alert" className="m-0 text-late text-center font-semibold">
              {error}
            </p>
          ) : null}
          <Button block loading={pending} disabled={!dirty} onClick={publish}>
            Publicar horario · semana {semana}
          </Button>
        </div>
      ) : null}

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet ? `${sheetShift?.name ?? ""}${sheetPuesto ? ` · ${sheetPuesto}` : ""} · ${DAYL[sheet.dayIdx]} ${dias[sheet.dayIdx].n}` : "Asignar"}
      >
        {activos.length === 0 ? (
          <p className="ui-sub m-0">Sin equipo activo. Agrega personas en Equipo → Personas.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {activos.map((p) => {
              const on = current === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => sheet && setAssign(keyFor(sheet.templateId, sheet.dayIdx, sheet.puestoId), p.id)}
                    className={cn(
                      "w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-btn border-0 text-left text-text cursor-pointer",
                      on ? "bg-brand-soft" : "bg-transparent hover:bg-surface-2",
                    )}
                  >
                    <Avatar name={p.name} initials={p.initials} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-semibold truncate">{p.name}</span>
                      <span className="block ui-sub truncate">{counts[p.id] ?? 0} turnos esta semana</span>
                    </span>
                    {on ? <CheckIcon size={20} className="text-ok" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {current ? (
          <Button
            variant="ghost"
            block
            className="mt-3 text-late"
            onClick={() => sheet && setAssign(keyFor(sheet.templateId, sheet.dayIdx, sheet.puestoId), null)}
          >
            Quitar asignación
          </Button>
        ) : null}
      </Sheet>
    </div>
  );
}
