"use client";

import * as React from "react";
import { Folio, PhotoPlaceholder, Stamp } from "@/components/comanda/primitives";

type Row = {
  id: string;
  date: string;
  dateLabel: string;
  template_id: string;
  template_name: string;
  status: "open" | "closed";
  done: number;
  novedades: number;
  opener: string;
};

type Task = {
  id: string;
  title: string;
  due_time: string | null;
  requires_photo: boolean;
};

function estadoLabel(r: Row): "cerrado" | "incompleto" | "en curso" {
  if (r.status === "closed") return "cerrado";
  if (r.status === "open" && r.done === 0) return "incompleto";
  return "en curso";
}

function estadoColor(e: ReturnType<typeof estadoLabel>): string {
  return e === "cerrado"
    ? "var(--green)"
    : e === "incompleto"
      ? "var(--amber)"
      : "var(--ink)";
}

export function HistorialClient({
  rows,
  initialTasks,
}: {
  rows: Row[];
  initialTasks: Task[];
}) {
  const [sel, setSel] = React.useState(0);
  const cur = rows[sel] ?? null;

  // Empty repo (no shifts): just render the empty list.
  if (rows.length === 0) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Sin turnos registrados todavía.
        </p>
      </div>
    );
  }

  const estado = estadoLabel(cur);
  const total = initialTasks.length;
  const done = cur.done;

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: "1fr 1.1fr", gap: 0 }}
    >
      {/* list */}
      <div style={{ borderRight: "1px dashed var(--rule)" }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "1.4fr .8fr .8fr .6fr",
            padding: "10px 24px 10px 32px",
            background: "var(--ink)",
            color: "var(--paper-lt)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span>Fecha · turno</span>
          <span>Personal</span>
          <span style={{ textAlign: "right" }}>Avance</span>
          <span style={{ textAlign: "right" }}>Estado</span>
        </div>
        {rows.map((p, i) => {
          const active = i === sel;
          const e = estadoLabel(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSel(i)}
              className="grid items-center"
              style={{
                gridTemplateColumns: "1.4fr .8fr .8fr .6fr",
                padding: "14px 24px 14px 32px",
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                borderBottom: "1px solid var(--rule-soft)",
                borderLeft: `3px solid ${active ? "var(--red)" : "transparent"}`,
                background: active ? "var(--paper-lt)" : "transparent",
                color: "var(--ink)",
                minHeight: 0,
              }}
            >
              <span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.dateLabel}</span>
                <span
                  className="text-muted"
                  style={{
                    fontSize: 10,
                    display: "block",
                    textTransform: "capitalize",
                  }}
                >
                  Turno {p.template_name} · DR-{p.id.slice(0, 4).toUpperCase()}
                </span>
              </span>
              <span style={{ fontSize: 12 }}>{p.opener}</span>
              <span
                className="cmd-num"
                style={{ textAlign: "right", fontSize: 12 }}
              >
                {p.done}/{total || "—"}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  color: estadoColor(e),
                  textTransform: "uppercase",
                }}
              >
                {e}
              </span>
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div style={{ padding: "20px 32px" }}>
        <div className="flex justify-between items-start">
          <div>
            <div
              className="text-muted"
              style={{ fontSize: 10, letterSpacing: "0.14em" }}
            >
              {cur.dateLabel} · TURNO {cur.template_name.toUpperCase()} · DR-
              {cur.id.slice(0, 4).toUpperCase()}
            </div>
            <div className="font-slab" style={{ fontSize: 22, marginTop: 4 }}>
              {cur.opener}
            </div>
          </div>
          <Stamp rotate={-5} size={9} color={estadoColor(estado)}>
            {estado}
          </Stamp>
        </div>

        <div
          className="flex"
          style={{
            gap: 24,
            marginTop: 14,
            paddingBottom: 16,
            borderBottom: "1px dashed var(--rule)",
          }}
        >
          {[
            { l: "Tareas", v: `${done}/${total}` },
            { l: "Fotos", v: 0 },
            { l: "Novedades", v: cur.novedades },
          ].map((s) => (
            <div key={s.l}>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {s.l}
              </div>
              <div
                className="cmd-num font-slab"
                style={{ fontSize: 22, marginTop: 2 }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: "16px 0 10px",
          }}
        >
          Tareas del turno · {done}/{total}
        </div>
        <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
          {initialTasks.length === 0 ? (
            <div
              className="text-muted"
              style={{ padding: 16, fontSize: 11, textAlign: "center" }}
            >
              Sin checklist registrado para este turno.
            </div>
          ) : (
            initialTasks.map((t, i) => {
              const completed = i < done;
              return (
                <div
                  key={t.id}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: "22px 44px 1fr auto",
                    gap: 10,
                    padding: "8px 12px",
                    borderBottom:
                      i < initialTasks.length - 1
                        ? "1px solid var(--rule-soft)"
                        : "none",
                    opacity: completed ? 1 : 0.6,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `1.5px solid ${completed ? "var(--green)" : "var(--rule)"}`,
                      background: completed ? "var(--green)" : "transparent",
                      color: "var(--paper-lt)",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {completed ? "✓" : ""}
                  </span>
                  <span className="cmd-num text-muted" style={{ fontSize: 10 }}>
                    {t.due_time ?? "—"}
                  </span>
                  <span style={{ fontSize: 12 }}>{t.title}</span>
                  {t.requires_photo ? (
                    <span
                      className="inline-flex items-center"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        gap: 4,
                        color: completed ? "var(--green)" : "var(--muted)",
                      }}
                    >
                      📷 {completed ? "verificada" : "sin foto"}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: "16px 0 10px",
          }}
        >
          Evidencia fotográfica
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ border: "1px solid var(--rule)" }}>
              <PhotoPlaceholder w="100%" h={78} label="sin foto" />
            </div>
          ))}
        </div>

        {cur.novedades > 0 ? (
          <>
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: "18px 0 10px",
              }}
            >
              Novedades · {cur.novedades}
            </div>
            <div
              style={{
                border: "1px solid var(--rule)",
                padding: 10,
                background: "var(--paper-lt)",
              }}
            >
              <div className="flex justify-between" style={{ marginBottom: 4 }}>
                <Folio n="N-44" />
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10 }}
                >
                  —
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: "var(--ink-2)",
                }}
              >
                Ver detalle en `/hoy/{cur.date}`.
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
