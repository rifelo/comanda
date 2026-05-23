"use client";

/**
 * 05 · Movimientos — filterable audit log of stock changes.
 */
import * as React from "react";
import { MOVS, type MovTipo } from "@/lib/mock/productos";
import { SectionCrumb } from "../_components/shared";
import { Chip } from "../_components/chip";

const GRID = "130px 1.4fr 130px 90px 1fr 90px";

const TIPO_META: Record<MovTipo, { label: string; bd: string }> = {
  venta: { label: "Venta", bd: "var(--ink)" },
  gasto: { label: "Gasto", bd: "var(--amber)" },
  ajuste: { label: "Ajuste manual", bd: "var(--red)" },
  import: { label: "Importación", bd: "var(--green)" },
};

function TipoBadge({ tipo }: { tipo: MovTipo }) {
  const m = TIPO_META[tipo];
  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${m.bd}`,
        color: m.bd,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "2px 6px",
        lineHeight: 1.3,
      }}
    >
      {m.label}
    </span>
  );
}

export function HistorialClient() {
  const [filter, setFilter] = React.useState<"all" | MovTipo>("all");
  const [q, setQ] = React.useState("");

  const filtered = MOVS.filter((m) => {
    if (filter !== "all" && m.tipo !== filter) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      if (!m.item.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  return (
    <div>
      <SectionCrumb
        section="historial"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Exportar CSV
            </button>
            <button type="button" className="cmd-btn sm">
              + Ajuste manual
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        {/* filter bar */}
        <div
          className="flex items-center flex-wrap"
          style={{ gap: 10, marginBottom: 16 }}
        >
          <div
            className="cmd-paper-lt"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--ink)",
              padding: "6px 10px",
            }}
          >
            <span
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Desde
            </span>
            <span className="cmd-num" style={{ fontSize: 11 }}>
              14·MAY 00:00
            </span>
            <span style={{ color: "var(--rule)", margin: "0 6px" }}>→</span>
            <span
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Hasta
            </span>
            <span className="cmd-num" style={{ fontSize: 11 }}>
              15·MAY 23:59
            </span>
          </div>
          <div
            className="cmd-paper-lt"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              border: "1px solid var(--ink)",
              minWidth: 240,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar item…"
              aria-label="Buscar item"
              style={{
                border: "none",
                background: "transparent",
                fontSize: 11,
                outline: "none",
                flex: 1,
                color: "var(--ink)",
                padding: 0,
                minHeight: 0,
              }}
            />
          </div>
          <span
            style={{ width: 1, height: 22, background: "var(--rule)" }}
          />
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Todos
          </Chip>
          <Chip
            active={filter === "venta"}
            onClick={() => setFilter("venta")}
          >
            Ventas
          </Chip>
          <Chip
            active={filter === "gasto"}
            onClick={() => setFilter("gasto")}
          >
            Gastos
          </Chip>
          <Chip
            active={filter === "ajuste"}
            danger
            onClick={() => setFilter("ajuste")}
          >
            Ajustes
          </Chip>
          <Chip
            active={filter === "import"}
            onClick={() => setFilter("import")}
          >
            Importaciones
          </Chip>
        </div>

        <div
          className="cmd-paper-lt"
          style={{ border: "1.5px solid var(--ink)" }}
        >
          <div
            className="bg-paper"
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: 12,
              padding: "8px 14px",
              borderBottom: "1.5px solid var(--ink)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            <span>Fecha · hora</span>
            <span>Item</span>
            <span>Tipo</span>
            <span style={{ textAlign: "right" }}>Δ</span>
            <span>Usuario · nota</span>
            <span style={{ textAlign: "right" }}>Saldo</span>
          </div>
          {filtered.map((m, i) => (
            <div
              key={`${m.date}-${m.item}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                padding: "10px 14px",
                alignItems: "flex-start",
                borderBottom: "1px dashed var(--rule-soft)",
                background:
                  i % 2 ? "var(--paper-lt)" : "var(--paper)",
              }}
            >
              <div
                className="cmd-num"
                style={{ fontSize: 11, color: "var(--ink-2)" }}
              >
                {m.date}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.item}</div>
              <div>
                <TipoBadge tipo={m.tipo} />
              </div>
              <div
                className="cmd-num"
                style={{
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 600,
                  color: m.delta > 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {m.delta > 0 ? "+" : ""}
                {m.delta}
              </div>
              <div style={{ fontSize: 11 }}>
                <div style={{ color: "var(--ink-2)" }}>{m.user}</div>
                {m.note ? (
                  <div
                    className="text-muted"
                    style={{ fontStyle: "italic", marginTop: 2 }}
                  >
                    ↳ {m.note}
                  </div>
                ) : null}
              </div>
              <div
                className="cmd-num text-muted"
                style={{ textAlign: "right", fontSize: 12 }}
              >
                {m.bal}
              </div>
            </div>
          ))}
          <div
            className="bg-paper text-muted"
            style={{
              padding: "10px 14px",
              borderTop: "1px dashed var(--rule)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span>
              Mostrando {filtered.length} movimientos · sede Norte
            </span>
            <span>Cargar más ↓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
