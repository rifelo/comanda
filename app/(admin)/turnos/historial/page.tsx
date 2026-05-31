"use client";

import { useState } from "react";
import { TurnosHeader } from "../../_components/turnos-header";
import {
  Folio,
  PhotoPlaceholder,
  Stamp,
} from "@/components/comanda/primitives";
import {
  HISTORIAL_EVIDENCIA,
  HISTORIAL_HORAS,
  HISTORIAL_PAST,
  type HistorialEstado,
} from "@/lib/mock/turnos";

function estadoColor(e: HistorialEstado) {
  return e === "cerrado"
    ? "var(--green)"
    : e === "incompleto"
      ? "var(--amber)"
      : "var(--ink)";
}

export default function TurnosHistorialPage() {
  const [sel, setSel] = useState(2);
  const cur = HISTORIAL_PAST[sel];

  return (
    <div>
      <TurnosHeader
        kicker="DANIEL'S BURGER · TURNOS PASADOS"
        title="Historial"
      >
        <button type="button" className="cmd-btn ghost sm">
          Filtrar ▾
        </button>
        <button type="button" className="cmd-btn ghost sm">
          ↓ Exportar
        </button>
      </TurnosHeader>

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
              gap: 0,
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
          {HISTORIAL_PAST.map((p, i) => {
            const active = i === sel;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(i)}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1.4fr .8fr .8fr .6fr",
                  gap: 0,
                  padding: "14px 24px 14px 32px",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderBottom: "1px solid var(--rule-soft)",
                  borderLeft: `3px solid ${active ? "var(--red)" : "transparent"}`,
                  background: active ? "var(--paper-lt)" : "transparent",
                  color: "var(--ink)",
                }}
              >
                <span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {p.fecha}
                  </span>
                  <span
                    className="text-muted"
                    style={{
                      fontSize: 10,
                      display: "block",
                      textTransform: "capitalize",
                    }}
                  >
                    Turno {p.turno} · {p.folio}
                  </span>
                </span>
                <span style={{ fontSize: 12 }}>{p.who}</span>
                <span
                  className="cmd-num"
                  style={{ textAlign: "right", fontSize: 12 }}
                >
                  {p.done}/{p.total}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    color: estadoColor(p.estado),
                    textTransform: "uppercase",
                  }}
                >
                  {p.estado}
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
                {cur.fecha} · TURNO {cur.turno.toUpperCase()} · {cur.folio}
              </div>
              <div
                className="font-slab"
                style={{ fontSize: 22, marginTop: 4 }}
              >
                {cur.who}
              </div>
            </div>
            <Stamp rotate={-5} size={9} color={estadoColor(cur.estado)}>
              {cur.estado}
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
              { l: "Tareas", v: `${cur.done}/${cur.total}` },
              { l: "Fotos", v: cur.fotos },
              { l: "Novedades", v: cur.nov },
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
            Evidencia fotográfica
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}
          >
            {HISTORIAL_EVIDENCIA.slice(0, cur.fotos).map((label, i) => (
              <div key={i} style={{ border: "1px solid var(--ink)" }}>
                <PhotoPlaceholder w="100%" h={78} label={label} />
                <div
                  className="text-muted flex justify-between"
                  style={{
                    padding: 5,
                    fontSize: 8,
                    letterSpacing: "0.12em",
                  }}
                >
                  <span className="cmd-num">{HISTORIAL_HORAS[i]}</span>
                  <span>
                    {cur.who
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {cur.nov > 0 && (
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
                Novedades · {cur.nov}
              </div>
              <div
                style={{
                  border: "1px solid var(--rule)",
                  padding: 10,
                  background: "var(--paper-lt)",
                }}
              >
                <div
                  className="flex justify-between"
                  style={{ marginBottom: 4 }}
                >
                  <Folio n="N-44" />
                  <span
                    className="cmd-num text-muted"
                    style={{ fontSize: 10 }}
                  >
                    11:42
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: "var(--ink-2)",
                  }}
                >
                  Se acabó la Coca-Cola Light. Llamé al proveedor, llega
                  mañana 9am.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
