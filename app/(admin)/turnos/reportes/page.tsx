import { TurnosHeader } from "../../_components/turnos-header";
import {
  REPORTES_GLOBAL_PCT,
  REPORTES_KPIS,
  REPORTES_POR_TURNO,
  REPORTES_WEEKDAYS,
} from "@/lib/mock/turnos";

export const dynamic = "force-dynamic";

export default function TurnosReportesPage() {
  return (
    <div>
      <TurnosHeader
        kicker="SEMANA 20 · 12·MAY — 18·MAY · DANIEL'S BURGER"
        title="Reporte de cumplimiento"
      >
        <button type="button" className="cmd-btn ghost sm">
          Esta semana ▾
        </button>
        <button type="button" className="cmd-btn ghost sm">
          Ambos turnos ▾
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
                91
                <span className="text-muted" style={{ fontSize: 24 }}>
                  %
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>
                ↑ 4 pts vs. semana anterior
              </div>
            </div>
            <div className="flex" style={{ gap: 24, fontSize: 11 }}>
              {REPORTES_KPIS.map((s) => (
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

          <div
            className="flex items-end"
            style={{
              gap: 6,
              height: 140,
              padding: "0 8px",
              borderBottom: "1.5px solid var(--ink)",
            }}
          >
            {REPORTES_GLOBAL_PCT.map((v, i) => (
              <div
                key={i}
                className="flex flex-col items-center"
                style={{ flex: 1, gap: 6 }}
              >
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10 }}
                >
                  {v}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${v}%`,
                    background:
                      "repeating-linear-gradient(45deg, var(--ink) 0 2px, transparent 2px 5px)",
                    borderTop: "2px solid var(--ink)",
                    borderLeft: "1px solid var(--ink)",
                    borderRight: "1px solid var(--ink)",
                  }}
                />
              </div>
            ))}
          </div>
          <div
            className="flex"
            style={{ gap: 6, padding: "6px 8px 0" }}
          >
            {REPORTES_WEEKDAYS.map((w, i) => (
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

        {/* per-turno table */}
        <div style={{ border: "1px solid var(--rule)" }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "2fr 3fr 1fr 1fr",
              gap: 0,
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
          {REPORTES_POR_TURNO.map((d, i) => (
            <div
              key={d.name}
              className="grid items-center"
              style={{
                gridTemplateColumns: "2fr 3fr 1fr 1fr",
                gap: 0,
                padding: "14px 16px",
                borderBottom:
                  i < REPORTES_POR_TURNO.length - 1
                    ? "1px solid var(--rule-soft)"
                    : "none",
                background: "var(--paper-lt)",
              }}
            >
              <span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {d.name}
                </span>
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10, display: "block" }}
                >
                  {d.sub}
                </span>
              </span>
              <div
                className="flex items-end"
                style={{ gap: 4, height: 36 }}
              >
                {d.vals.map((v, j) => (
                  <div
                    key={j}
                    title={`${REPORTES_WEEKDAYS[j]}: ${v}%`}
                    style={{
                      flex: 1,
                      height: `${v}%`,
                      background:
                        v < 70
                          ? "var(--red)"
                          : v < 90
                            ? "var(--amber)"
                            : "var(--green)",
                      opacity: 0.85,
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
                    d.avg < 70
                      ? "var(--red)"
                      : d.avg < 90
                        ? "var(--amber)"
                        : "var(--green)",
                }}
              >
                {d.avg}%
              </span>
              <span style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="cmd-link"
                  style={{ fontSize: 12 }}
                >
                  ver detalles →
                </button>
              </span>
            </div>
          ))}
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
          generado · 15·MAY 12:34 · andrés.restrepo@danielsburger.co
        </div>
      </div>
    </div>
  );
}
