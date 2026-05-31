import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getWeeklyCompliance } from "@/lib/db/compliance";
import { formatDateLabelEs } from "@/lib/utils";
import { TurnosHeader } from "../../_components/turnos-header";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

/** Semantic bar color by compliance threshold (mirrors the design). */
function barColor(value: number): string {
  return value >= 90
    ? "var(--green)"
    : value >= 75
      ? "var(--amber)"
      : "var(--red)";
}

/**
 * Reporte de cumplimiento — weekly compliance chart + per-shift table built
 * from real `task_completions` aggregated for the current week (in the sede's
 * timezone). Days/shifts with no instances render a muted "sin datos" marker.
 */
export default async function TurnosReportesPage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  if (!sede) {
    return (
      <div>
        <TurnosHeader kicker="SIN SEDE" title="Reporte de cumplimiento" />
        <div style={{ padding: "24px 32px" }}>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Sin sede registrada todavía.
          </p>
        </div>
      </div>
    );
  }

  const report = await getWeeklyCompliance(sede.id, sede.tz);
  const { kpis } = report;
  const weekLabel = `${formatDateLabelEs(report.weekDates[0])} – ${formatDateLabelEs(
    report.weekDates[6],
  )}`;

  // Max pixel height for the big chart bars (container is 140px tall, leaving
  // room for the value label above each bar).
  const MAX_BAR = 116;

  return (
    <div>
      <TurnosHeader
        kicker={`${sede.name.toUpperCase()} · CUMPLIMIENTO`}
        title="Reporte de cumplimiento"
      >
        <button type="button" className="cmd-btn ghost sm">
          Esta semana ▾
        </button>
        <button type="button" className="cmd-btn ghost sm">
          Todos los turnos ▾
        </button>
        <button type="button" className="cmd-btn sm">
          ↓ Exportar CSV
        </button>
      </TurnosHeader>

      <div style={{ padding: 32 }}>
        {/* big chart */}
        <div
          className="cmd-noise"
          style={{
            border: "1.5px solid var(--ink)",
            padding: 24,
            background: "var(--paper-lt)",
            marginBottom: 24,
          }}
        >
          <div className="flex justify-between" style={{ marginBottom: 18 }}>
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
                className="cmd-num font-slab"
                style={{ fontSize: 64, lineHeight: 1, marginTop: 4 }}
              >
                {report.globalPct ?? "—"}
                <span className="text-muted" style={{ fontSize: 24 }}>
                  %
                </span>
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {report.hasData
                  ? `Semana ${weekLabel}`
                  : "Sin datos suficientes para esta semana."}
              </div>
            </div>
            <div className="flex" style={{ gap: 24, fontSize: 11 }}>
              {[
                {
                  l: "Tareas completadas",
                  v: report.hasData
                    ? `${kpis.tasksDone} / ${kpis.tasksTotal}`
                    : "—",
                },
                {
                  l: "Fotos verificadas",
                  v: report.hasData
                    ? `${kpis.photosDone} / ${kpis.photosTotal}`
                    : "—",
                },
                { l: "Novedades", v: report.hasData ? kpis.novedades : "—" },
                {
                  l: "Tareas en retraso",
                  v: report.hasData ? kpis.late : "—",
                },
              ].map((s) => (
                <div
                  key={s.l}
                  style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 12 }}
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

          <div
            className="flex items-end"
            style={{
              gap: 6,
              height: 140,
              padding: "0 8px",
              borderBottom: "1.5px solid var(--ink)",
            }}
          >
            {report.daily.map((value, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-end"
                style={{ flex: 1, gap: 6, height: "100%" }}
              >
                <span className="cmd-num text-muted" style={{ fontSize: 10 }}>
                  {value ?? "—"}
                </span>
                {value === null ? (
                  <div
                    style={{
                      width: "100%",
                      height: 2,
                      border: "1px dashed var(--rule)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: Math.max(2, (value / 100) * MAX_BAR),
                      background: barColor(value),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: 6, padding: "6px 8px 0" }}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="text-muted"
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
              >
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* per-shift table — built from the live shift definitions */}
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
            <span>Turno</span>
            <span>Cumplimiento por día</span>
            <span style={{ textAlign: "right" }}>Promedio</span>
            <span style={{ textAlign: "right" }}>Acción</span>
          </div>
          {report.perShift.length === 0 ? (
            <div
              className="text-muted"
              style={{ padding: 16, fontSize: 12, textAlign: "center" }}
            >
              Sin turnos configurados.
            </div>
          ) : (
            report.perShift.map((s, i) => (
              <div
                key={s.template_id}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2fr 3fr 1fr 1fr",
                  padding: "14px 16px",
                  borderBottom:
                    i < report.perShift.length - 1
                      ? "1px solid var(--rule-soft)"
                      : "none",
                  background: "var(--paper-lt)",
                }}
              >
                <span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    Turno {s.name}
                  </span>
                  <span
                    className="cmd-num text-muted"
                    style={{ fontSize: 10, display: "block" }}
                  >
                    {s.inicio} – {s.fin}
                  </span>
                </span>
                <div className="flex items-end" style={{ gap: 4, height: 36 }}>
                  {s.vals.map((value, j) =>
                    value === null ? (
                      <div
                        key={j}
                        style={{
                          flex: 1,
                          height: 2,
                          border: "1px dashed var(--rule)",
                        }}
                        title={`${WEEKDAYS[j]} · sin datos`}
                      />
                    ) : (
                      <div
                        key={j}
                        style={{
                          flex: 1,
                          height: Math.max(2, (value / 100) * 36),
                          background: barColor(value),
                        }}
                        title={`${WEEKDAYS[j]} · ${value}%`}
                      />
                    ),
                  )}
                </div>
                <span
                  className="cmd-num font-slab"
                  style={{
                    textAlign: "right",
                    fontSize: 22,
                    color: s.avg === null ? "var(--muted)" : "var(--ink)",
                  }}
                >
                  {s.avg === null ? "—" : `${s.avg}%`}
                </span>
                <span style={{ textAlign: "right" }}>
                  <span
                    className="cmd-link text-muted"
                    style={{ fontSize: 12, cursor: "default" }}
                  >
                    {s.avg === null ? "sin datos" : "ver detalle"}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        <div
          className="text-muted"
          style={{
            marginTop: 16,
            fontSize: 10,
            letterSpacing: "0.06em",
            textAlign: "right",
          }}
        >
          generado · {sede.name}
        </div>
      </div>
    </div>
  );
}
