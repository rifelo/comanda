import { getActiveSede } from "@/lib/data/sede";
import { CmdProgress } from "@/components/comanda/primitives";
import { TurnosHeader } from "../../_components/turnos-header";
import {
  TURNOS_RESUMEN,
  TURNOS_WEEKLY_HORARIO,
} from "@/lib/mock/turnos";

export const dynamic = "force-dynamic";

export default async function TurnosResumenPage() {
  const sede = await getActiveSede();
  const sedeName = sede?.name ?? "Daniel's Burger";

  return (
    <div>
      <TurnosHeader
        kicker={`DEFINICIÓN · ${sedeName.toUpperCase()}`}
        title="Resumen de turnos"
      >
        <button type="button" className="cmd-btn ghost sm">
          Editar horarios
        </button>
        <button type="button" className="cmd-btn sm">
          + Nuevo turno
        </button>
      </TurnosHeader>

      <div style={{ padding: "24px 32px" }}>
        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Turnos configurados · 2 por día
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}
        >
          {TURNOS_RESUMEN.map((t) => {
            const open = t.estado === "EN CURSO";
            return (
              <div
                key={t.shift}
                className="cmd-noise relative"
                style={{
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-lt)",
                  padding: 22,
                  boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div
                      className="font-slab"
                      style={{ fontSize: 26, lineHeight: 1 }}
                    >
                      Turno {t.shift}
                    </div>
                    <div
                      className="cmd-num text-muted"
                      style={{ fontSize: 12, marginTop: 6 }}
                    >
                      {t.horario}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      padding: "3px 7px",
                      border: `1px solid ${open ? "var(--ink)" : "var(--rule)"}`,
                      color: open ? "var(--ink)" : "var(--muted)",
                    }}
                  >
                    {t.estado}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: "1px dashed var(--rule)",
                  }}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div
                        className="text-muted"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                        }}
                      >
                        Plantilla asignada
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginTop: 3,
                        }}
                      >
                        {t.plantilla}{" "}
                        <span
                          className="cmd-num text-muted"
                          style={{ fontSize: 10, fontWeight: 400 }}
                        >
                          · {t.version}
                        </span>
                      </div>
                    </div>
                    <span className="cmd-link" style={{ fontSize: 11 }}>
                      editar →
                    </span>
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      display: "flex",
                      gap: 20,
                      marginTop: 10,
                      fontSize: 11,
                    }}
                  >
                    <span>
                      <strong className="cmd-num" style={{ color: "var(--ink)" }}>
                        {t.tareas}
                      </strong>{" "}
                      tareas
                    </span>
                    <span>
                      <strong className="cmd-num" style={{ color: "var(--ink)" }}>
                        {t.fotos}
                      </strong>{" "}
                      con foto
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px dashed var(--rule)",
                  }}
                >
                  <div
                    className="text-muted"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Personal de hoy
                  </div>
                  {t.hoy ? (
                    <div
                      className="flex items-center"
                      style={{ gap: 10 }}
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
                        {t.hoy
                          .split(" ")
                          .map((w) => w[0])
                          .join("")}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {t.hoy}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: 10 }}
                        >
                          Cajero ·{" "}
                          {open ? `${t.done}/${t.tareas} tareas` : "asignado"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-muted flex justify-between items-center"
                      style={{ fontSize: 12 }}
                    >
                      <span>— sin asignar —</span>
                      <span className="cmd-link" style={{ fontSize: 11 }}>
                        asignar →
                      </span>
                    </div>
                  )}
                </div>

                {open && (
                  <div style={{ marginTop: 16 }}>
                    <CmdProgress done={t.done} total={t.tareas} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly horario strip */}
        <div style={{ marginTop: 28 }}>
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Horario semanal
          </div>
          <div
            style={{
              border: "1px solid var(--rule)",
              background: "var(--paper-lt)",
            }}
          >
            {TURNOS_WEEKLY_HORARIO.map((r, i) => (
              <div
                key={r.turno}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1fr 1.2fr 1.2fr 1.6fr",
                  padding: "12px 16px",
                  borderBottom:
                    i < TURNOS_WEEKLY_HORARIO.length - 1
                      ? "1px solid var(--rule-soft)"
                      : "none",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>Turno {r.turno}</span>
                <span
                  className="cmd-num text-muted"
                >
                  {r.horario}
                </span>
                <span className="text-muted">{r.dias}</span>
                <span className="flex justify-between">
                  {r.plantilla}
                  <span className="cmd-link">ver →</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
