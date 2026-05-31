import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listShifts } from "@/lib/db/shifts";
import { TurnosHeader } from "../../_components/turnos-header";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

/**
 * Reporte de cumplimiento — weekly compliance chart + per-shift table.
 *
 * Until we have historical task_completions to aggregate, we render the
 * shift definitions in the table and a "sin datos" empty-state for the
 * chart. Bar colors still follow the design's semantic thresholds.
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

  const shifts = await listShifts(sede.id);

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
                —<span className="text-muted" style={{ fontSize: 24 }}>%</span>
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 11, marginTop: 4 }}
              >
                Sin datos suficientes para esta semana.
              </div>
            </div>
            <div className="flex" style={{ gap: 24, fontSize: 11 }}>
              {[
                { l: "Tareas completadas", v: "—" },
                { l: "Fotos verificadas", v: "—" },
                { l: "Novedades", v: "—" },
                { l: "Tareas en retraso", v: "—" },
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
            {WEEKDAYS.map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center"
                style={{ flex: 1, gap: 6 }}
              >
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10 }}
                >
                  —
                </span>
                <div
                  style={{
                    width: "100%",
                    height: "0%",
                    border: "1px dashed var(--rule)",
                  }}
                />
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
          {shifts.length === 0 ? (
            <div
              className="text-muted"
              style={{ padding: 16, fontSize: 12, textAlign: "center" }}
            >
              Sin turnos configurados.
            </div>
          ) : (
            shifts.map((s, i) => (
              <div
                key={s.id}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2fr 3fr 1fr 1fr",
                  padding: "14px 16px",
                  borderBottom:
                    i < shifts.length - 1
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
                <div
                  className="flex items-end"
                  style={{ gap: 4, height: 36 }}
                >
                  {WEEKDAYS.map((_, j) => (
                    <div
                      key={j}
                      style={{
                        flex: 1,
                        height: "0%",
                        border: "1px dashed var(--rule)",
                      }}
                    />
                  ))}
                </div>
                <span
                  className="cmd-num font-slab text-muted"
                  style={{ textAlign: "right", fontSize: 22 }}
                >
                  —
                </span>
                <span style={{ textAlign: "right" }}>
                  <span
                    className="cmd-link text-muted"
                    style={{ fontSize: 12, cursor: "default" }}
                  >
                    sin datos
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
