import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  date: string;
  restaurant_id: string;
  restaurant_name: string;
  template_name: string;
  total: number;
  done: number;
  pct: number;
}

export default async function ReportsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const today = todayInTz();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const startDate = start.toISOString().slice(0, 10);

  const { data: rowsRaw } = await supabase
    .from("shift_instances")
    .select(
      `id, date, restaurant_id, restaurant:restaurants!inner(id, name),
       template:checklist_templates!inner(id, name, shift, template_tasks(count)),
       completions:task_completions(count)`,
    )
    .gte("date", startDate)
    .lte("date", today)
    .order("date", { ascending: false });

  const rows: Row[] = (rowsRaw ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = ((r as any).template?.template_tasks?.[0]?.count ?? 0) as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const done = ((r as any).completions?.[0]?.count ?? 0) as number;
    return {
      id: r.id,
      date: r.date,
      restaurant_id: r.restaurant_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      restaurant_name: (r as any).restaurant?.name ?? "—",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template_name: (r as any).template?.name ?? "—",
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  // Per-day average across all sedes (for the global bar chart)
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    days.push(d.toISOString().slice(0, 10));
  }
  const dayAvg = days.map((d) => {
    const dayRows = rows.filter((r) => r.date === d);
    if (dayRows.length === 0) return { d, pct: 0, count: 0 };
    const pct = Math.round(
      dayRows.reduce((a, r) => a + r.pct, 0) / dayRows.length,
    );
    return { d, pct, count: dayRows.length };
  });
  const globalPct =
    rows.length > 0
      ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length)
      : 0;
  const totalTasks = rows.reduce((a, r) => a + r.total, 0);
  const doneTasks = rows.reduce((a, r) => a + r.done, 0);

  // Per-sede grouping
  type SedeRow = { id: string; name: string; vals: number[]; avg: number };
  const sedeMap = new Map<string, SedeRow>();
  for (const r of rows) {
    if (!sedeMap.has(r.restaurant_id)) {
      sedeMap.set(r.restaurant_id, {
        id: r.restaurant_id,
        name: r.restaurant_name,
        vals: days.map(() => 0),
        avg: 0,
      });
    }
  }
  for (const r of rows) {
    const sede = sedeMap.get(r.restaurant_id)!;
    const idx = days.indexOf(r.date);
    if (idx >= 0) sede.vals[idx] = Math.max(sede.vals[idx], r.pct);
  }
  for (const sede of sedeMap.values()) {
    const filled = sede.vals.filter((v) => v > 0);
    sede.avg =
      filled.length > 0
        ? Math.round(filled.reduce((a, v) => a + v, 0) / filled.length)
        : 0;
  }
  const sedes = Array.from(sedeMap.values());

  const csvUrl = `/api/reports/csv?start=${startDate}&end=${today}`;
  const weekLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div>
      <header
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
            ÚLTIMOS 7 DÍAS · {startDate} → {today}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 30, margin: "4px 0 0" }}
          >
            Reporte de cumplimiento
          </h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="cmd-btn ghost sm">
            Esta semana ▾
          </button>
          <button type="button" className="cmd-btn ghost sm">
            Todas las sedes ▾
          </button>
          <a href={csvUrl} className="cmd-btn sm">
            ↓ Exportar CSV
          </a>
        </div>
      </header>

      <div style={{ padding: 32 }}>
        {/* Global chart */}
        <div
          className="cmd-noise"
          style={{
            border: "1.5px solid var(--ink)",
            padding: 24,
            background: "var(--paper-lt)",
            marginBottom: 24,
          }}
        >
          <div className="flex flex-wrap justify-between gap-4 mb-5">
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Cumplimiento global
              </div>
              <div
                className="cmd-num font-slab leading-none"
                style={{ fontSize: 64, marginTop: 4 }}
              >
                {globalPct}
                <span className="text-muted" style={{ fontSize: 24 }}>
                  %
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  color: "var(--muted)",
                }}
              >
                {rows.length} turnos en el periodo
              </div>
            </div>
            <div
              className="flex flex-wrap gap-6"
              style={{ fontSize: 11 }}
            >
              {[
                {
                  l: "Tareas completadas",
                  v: `${doneTasks} / ${totalTasks}`,
                },
                {
                  l: "Sedes activas",
                  v: String(sedes.length),
                },
                {
                  l: "Turnos abiertos",
                  v: String(rows.length),
                },
              ].map((s) => (
                <div
                  key={s.l}
                  style={{
                    borderLeft: "1px solid var(--rule)",
                    paddingLeft: 12,
                  }}
                >
                  <div
                    className="text-muted"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.l}
                  </div>
                  <div
                    className="cmd-num"
                    style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}
                  >
                    {s.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hand-drawn-style bar chart */}
          <div
            className="flex items-end gap-1.5"
            style={{
              height: 140,
              padding: "0 8px",
              borderBottom: "1.5px solid var(--ink)",
            }}
          >
            {dayAvg.map((d, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1.5"
                style={{ flex: 1 }}
              >
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10 }}
                >
                  {d.pct || ""}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(d.pct, 2)}%`,
                    background:
                      "repeating-linear-gradient(45deg, var(--ink) 0 2px, transparent 2px 5px)",
                    borderTop: "2px solid var(--ink)",
                    borderLeft: "1px solid var(--ink)",
                    borderRight: "1px solid var(--ink)",
                    opacity: d.pct === 0 ? 0.2 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <div
            className="flex gap-1.5"
            style={{ padding: "6px 8px 0" }}
          >
            {weekLabels.map((w, i) => (
              <div
                key={i}
                className="text-muted text-center"
                style={{
                  flex: 1,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
              >
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* per-sede table */}
        <div style={{ border: "1px solid var(--rule)" }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "2fr 3fr 1fr 1fr",
              padding: "10px 16px",
              background: "var(--ink)",
              color: "var(--paper-lt)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            <span>Sede</span>
            <span>Cumplimiento por día</span>
            <span style={{ textAlign: "right" }}>Promedio</span>
            <span style={{ textAlign: "right" }}>Acción</span>
          </div>
          {sedes.length === 0 ? (
            <div
              className="text-muted text-center"
              style={{
                padding: "32px 16px",
                fontSize: 12,
                background: "var(--paper-lt)",
              }}
            >
              No hay turnos en este rango.
            </div>
          ) : (
            sedes.map((s, i) => (
              <div
                key={s.id}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2fr 3fr 1fr 1fr",
                  padding: "14px 16px",
                  borderBottom:
                    i < sedes.length - 1
                      ? "1px solid var(--rule-soft)"
                      : "none",
                  background: "var(--paper-lt)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                <div className="flex items-end gap-1" style={{ height: 36 }}>
                  {s.vals.map((v, j) => (
                    <div
                      key={j}
                      title={`${weekLabels[j]}: ${v}%`}
                      style={{
                        flex: 1,
                        height: `${Math.max(v, 4)}%`,
                        background:
                          v === 0
                            ? "var(--rule-soft)"
                            : v < 70
                              ? "var(--red)"
                              : v < 90
                                ? "var(--amber)"
                                : "var(--green)",
                        opacity: v === 0 ? 0.4 : 0.85,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="cmd-num font-slab"
                  style={{
                    textAlign: "right",
                    fontSize: 22,
                    color:
                      s.avg < 70
                        ? "var(--red)"
                        : s.avg < 90
                          ? "var(--amber)"
                          : "var(--green)",
                  }}
                >
                  {s.avg}%
                </span>
                <span style={{ textAlign: "right" }}>
                  <a
                    href={`/restaurants/${s.id}`}
                    className="cmd-link"
                    style={{ fontSize: 12 }}
                  >
                    ver detalles →
                  </a>
                </span>
              </div>
            ))
          )}
        </div>

        <div
          className="text-muted text-right"
          style={{ marginTop: 16, fontSize: 10, letterSpacing: "0.06em" }}
        >
          generado · {today}
        </div>
      </div>
    </div>
  );
}
