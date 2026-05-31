import { TurnosHeader } from "../../_components/turnos-header";
import { ASIG_DIAS, ASIG_GRID, ASIG_ROSTER } from "@/lib/mock/turnos";

export const dynamic = "force-dynamic";

export default function TurnosAsignacionPage() {
  return (
    <div>
      <TurnosHeader
        kicker="SEMANA 20 · 12·MAY — 18·MAY"
        title="Asignación de personal"
      >
        <button type="button" className="cmd-btn ghost sm">
          ‹ semana
        </button>
        <button type="button" className="cmd-btn ghost sm">
          semana ›
        </button>
        <button type="button" className="cmd-btn sm">
          Publicar horario
        </button>
      </TurnosHeader>

      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 260px", gap: 0 }}
      >
        {/* week grid */}
        <div
          style={{
            padding: "24px 24px 24px 32px",
            borderRight: "1px dashed var(--rule)",
          }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: "92px repeat(7, 1fr)",
              gap: 6,
            }}
          >
            <div />
            {ASIG_DIAS.map((d) => (
              <div
                key={d.n}
                style={{ textAlign: "center", paddingBottom: 8 }}
              >
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

            {(["día", "noche"] as const).map((turno) => (
              <RowFragment
                key={turno}
                turno={turno}
                row={ASIG_GRID[turno]}
                dias={ASIG_DIAS}
              />
            ))}
          </div>

          <div
            className="text-muted"
            style={{
              marginTop: 18,
              display: "flex",
              gap: 18,
              fontSize: 10,
              letterSpacing: "0.08em",
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
          </div>
        </div>

        {/* roster panel */}
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
            Equipo · {ASIG_ROSTER.length}
          </div>
          {ASIG_ROSTER.map((p) => (
            <div
              key={p.name}
              className="flex items-center"
              style={{
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-lt)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {p.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                <div className="text-muted" style={{ fontSize: 10 }}>
                  {p.role}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="cmd-num"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  {p.turnos}
                </div>
                <div
                  className="text-muted"
                  style={{ fontSize: 8, letterSpacing: "0.12em" }}
                >
                  TURNOS
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="cmd-btn ghost sm"
            style={{ width: "100%", marginTop: 14 }}
          >
            + agregar persona
          </button>
        </div>
      </div>
    </div>
  );
}

function RowFragment({
  turno,
  row,
  dias,
}: {
  turno: "día" | "noche";
  row: (string | null)[];
  dias: typeof ASIG_DIAS;
}) {
  return (
    <>
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
          {turno}
        </div>
        <div
          className="cmd-num text-muted"
          style={{ fontSize: 9 }}
        >
          {turno === "día" ? "10:30" : "14:30"}
        </div>
      </div>
      {row.map((who, i) => (
        <Cell key={i} who={who} hoy={dias[i].hoy} />
      ))}
    </>
  );
}

function Cell({ who, hoy }: { who: string | null; hoy: boolean }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        border: `1px solid ${who ? "var(--ink)" : "var(--rule-soft)"}`,
        background: who ? "var(--paper-lt)" : "transparent",
        minHeight: 52,
        cursor: "pointer",
        position: "relative",
        boxShadow: hoy ? "inset 0 0 0 2px var(--red)" : "none",
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
          {who}
        </span>
      ) : (
        <span
          className="text-muted"
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          ＋
        </span>
      )}
    </div>
  );
}
