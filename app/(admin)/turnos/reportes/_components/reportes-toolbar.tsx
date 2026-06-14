"use client";

export type WeekOption = { value: string; label: string };
export type ShiftOption = { value: string; label: string };

/**
 * Week + shift filters for the Reportes view. A native GET <form>: changing
 * either select submits, so the browser navigates to
 * `/turnos/reportes?week=…&template=…` and the server re-renders the chart,
 * table and CSV export link for the chosen scope.
 *
 * Deliberately a plain form submit rather than `router.push` — in this Next 16
 * build a client-side push to the same route with only changed search params
 * silently no-ops. A GET form also degrades gracefully without JS.
 */
export function ReportesToolbar({
  weeks,
  selectedWeek,
  shifts,
  selectedTemplate,
}: {
  weeks: WeekOption[];
  selectedWeek: string;
  shifts: ShiftOption[];
  selectedTemplate: string;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) =>
    e.currentTarget.form?.requestSubmit();

  return (
    <form
      action="/turnos/reportes"
      method="get"
      className="flex items-center"
      style={{ gap: 8 }}
    >
      <select
        name="week"
        aria-label="Semana"
        defaultValue={selectedWeek}
        onChange={submit}
        className="cmd-btn ghost sm"
        style={{ cursor: "pointer", paddingRight: 8 }}
      >
        {weeks.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>

      <select
        name="template"
        aria-label="Turno"
        defaultValue={selectedTemplate}
        onChange={submit}
        className="cmd-btn ghost sm"
        style={{ cursor: "pointer", paddingRight: 8 }}
      >
        {shifts.map((s) => (
          <option key={s.value || "all"} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Submit fallback when JS is unavailable. */}
      <noscript>
        <button type="submit" className="cmd-btn sm">
          Aplicar
        </button>
      </noscript>
    </form>
  );
}
