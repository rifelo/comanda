"use client";

/**
 * 07 · Conteo de Inventario — split sistema vs físico with live Δ.
 */
import * as React from "react";
import { CONTEO_ITEMS, type ConteoItem } from "@/lib/mock/productos";
import { CmdProgress, Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, StockBadge } from "../_components/shared";

const GRID = "1.4fr 60px 1fr 1fr 110px 140px";

export function ConteoClient() {
  const [items, setItems] = React.useState<ConteoItem[]>(CONTEO_ITEMS);
  const counted = items.filter((i) => i.fisico != null).length;
  const totalDiff = items.reduce(
    (s, i) => s + (i.fisico != null ? i.fisico - i.sys : 0),
    0,
  );

  return (
    <div>
      <SectionCrumb
        section="conteo"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Guardar borrador
            </button>
            <button type="button" className="cmd-btn red sm">
              Aplicar ajuste · {counted} items
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        {/* header strip */}
        <div
          className="cmd-noise cmd-paper-lt relative"
          style={{
            border: "1.5px solid var(--ink)",
            padding: "14px 18px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr) 200px",
            gap: 18,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Folio conteo
            </div>
            <div
              className="cmd-num font-slab"
              style={{ fontSize: 22, marginTop: 2 }}
            >
              #C-2026-0142
            </div>
          </div>
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Inicio
            </div>
            <div className="cmd-num" style={{ fontSize: 14, marginTop: 4 }}>
              15·MAY · 07:00
            </div>
          </div>
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Avance
            </div>
            <div style={{ marginTop: 4 }}>
              <CmdProgress done={counted} total={items.length} />
              <div
                className="text-muted"
                style={{ fontSize: 10, marginTop: 4 }}
              >
                {counted} de {items.length} contados
              </div>
            </div>
          </div>
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Δ Total acumulado
            </div>
            <div
              className="cmd-num font-slab"
              style={{
                fontSize: 22,
                color: totalDiff < 0 ? "var(--red)" : "var(--green)",
                marginTop: 2,
              }}
            >
              {totalDiff > 0 ? "+" : ""}
              {totalDiff.toFixed(1)}
            </div>
          </div>
          <div style={{ position: "absolute", top: -10, right: 18 }}>
            <Stamp rotate={-4}>borrador</Stamp>
          </div>
        </div>

        {/* split table */}
        <div
          className="cmd-paper-lt"
          style={{ border: "1.5px solid var(--ink)" }}
        >
          <div
            className="bg-paper"
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              borderBottom: "1.5px solid var(--ink)",
            }}
          >
            <Header>Ingrediente</Header>
            <Header align="center" pad="8px 8px">
              Und.
            </Header>
            <Header
              align="center"
              style={{
                borderLeft: "1px dashed var(--rule)",
                background: "var(--paper-lt)",
              }}
            >
              ◀ Sistema Comanda
            </Header>
            <Header
              align="center"
              style={{
                borderLeft: "1.5px solid var(--ink)",
                background: "var(--paper)",
              }}
            >
              Conteo físico ▶
            </Header>
            <Header align="right">Diferencia Δ</Header>
            <Header>Estado</Header>
          </div>

          {items.map((it, i) => {
            const diff = it.fisico != null ? it.fisico - it.sys : null;
            const diffColor =
              diff == null
                ? "var(--muted)"
                : Math.abs(diff) < 0.1
                  ? "var(--green)"
                  : diff > 0
                    ? "var(--green)"
                    : "var(--red)";
            return (
              <div
                key={it.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  alignItems: "center",
                  background:
                    i % 2 ? "var(--paper-lt)" : "var(--paper)",
                  borderBottom: "1px dashed var(--rule-soft)",
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {it.name}
                </div>
                <div
                  className="text-muted"
                  style={{
                    padding: "12px 8px",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {it.unit}
                </div>
                <div
                  className="cmd-paper-lt"
                  style={{
                    padding: "12px 14px",
                    textAlign: "center",
                    borderLeft: "1px dashed var(--rule)",
                  }}
                >
                  <span
                    className="cmd-num"
                    style={{ fontSize: 15, fontWeight: 500 }}
                  >
                    {it.sys}
                  </span>
                </div>
                <div
                  className="bg-paper"
                  style={{
                    padding: "8px 14px",
                    borderLeft: "1.5px solid var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    value={it.fisico ?? ""}
                    aria-label={`Conteo físico de ${it.name}`}
                    onChange={(e) =>
                      setItems((s) =>
                        s.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                fisico:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                    className="cmd-num cmd-paper-lt"
                    style={{
                      width: 90,
                      textAlign: "center",
                      border: "1.5px solid var(--ink)",
                      padding: "6px 8px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--ink)",
                      outline: "none",
                      minHeight: 0,
                    }}
                  />
                </div>
                <div
                  className="cmd-num"
                  style={{
                    padding: "12px 14px",
                    textAlign: "right",
                    fontSize: 14,
                    fontWeight: 700,
                    color: diffColor,
                  }}
                >
                  {diff == null
                    ? "—"
                    : `${diff > 0 ? "+" : ""}${diff.toFixed(diff % 1 === 0 ? 0 : 1)}`}
                </div>
                <div style={{ padding: "12px 14px" }}>
                  {diff == null ? (
                    <span
                      className="text-muted"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      pendiente
                    </span>
                  ) : Math.abs(diff) < 0.1 ? (
                    <StockBadge status="ok" />
                  ) : Math.abs(diff) / Math.max(it.sys, 1) > 0.05 ? (
                    <Stamp size={9} rotate={-3} color="var(--red)">
                      revisar
                    </Stamp>
                  ) : (
                    <StockBadge status="bajo" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Header({
  children,
  align = "left",
  pad = "8px 14px",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  pad?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="text-muted"
      style={{
        padding: pad,
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontWeight: 600,
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
