"use client";

/**
 * 02 · Ingredientes — 4-level tree (Categoría → Subcat. → Principal → Sub-ing).
 * Client component to handle expand/collapse of sub-ingredient rows.
 */
import * as React from "react";
import {
  ING_TREE,
  INGS,
  type IngredienteTreeRow,
  fmtCOP,
} from "@/lib/mock/productos";
import { SectionCrumb, StockBar, CmdMiniLabel } from "../_components/shared";

function flattenTree(rows: IngredienteTreeRow[]): IngredienteTreeRow[] {
  return rows.flatMap((r) => [
    r,
    ...(r.expanded && r.children ? flattenTree(r.children) : []),
  ]);
}

function IngTree({
  active,
  onPick,
}: {
  active: string;
  onPick: (id: string) => void;
}) {
  const flat = flattenTree(ING_TREE);
  return (
    <div className="flex flex-col" style={{ gap: 1 }}>
      {flat.map((row) => {
        const isActive = active === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onPick(row.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              textAlign: "left",
              padding: "5px 8px",
              paddingLeft: 8 + (row.indent || 0) * 14,
              background: isActive ? "var(--ink)" : "transparent",
              color: isActive
                ? "var(--paper-lt)"
                : row.leaf
                  ? "var(--ink-2)"
                  : "var(--ink)",
              border: "none",
              fontSize: 11,
              borderRadius: 2,
              minHeight: 0,
              cursor: "pointer",
            }}
          >
            {row.children ? (
              <span style={{ fontSize: 9, opacity: 0.6 }}>
                {row.expanded ? "▾" : "▸"}
              </span>
            ) : row.leaf ? (
              <span style={{ width: 8, color: "var(--muted)" }}>·</span>
            ) : (
              <span style={{ width: 8 }} />
            )}
            <span style={{ flex: 1, fontWeight: row.root ? 600 : 400 }}>
              {row.label}
            </span>
            {row.count !== undefined ? (
              <span
                className="cmd-num"
                style={{ fontSize: 10, opacity: 0.7 }}
              >
                {row.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const GRID = "22px 1.4fr 1fr 60px 90px 130px 90px 90px";

export function IngredientesClient() {
  const [cat, setCat] = React.useState("all");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    'Pan brioche 4"': true,
  });

  const kpis = [
    { label: "Ingredientes activos", val: "142" },
    { label: "En stock bajo", val: "7", tone: "var(--amber)" },
    { label: "Merma > 5%", val: "4", tone: "var(--red)" },
    { label: "Costo prom. plato", val: "$ 9.420" },
  ];

  return (
    <div>
      <SectionCrumb
        section="ingredientes"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Importar
            </button>
            <button type="button" className="cmd-btn sm">
              + Nuevo ingrediente
            </button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          minHeight: "calc(100vh - 120px)",
        }}
      >
        <div
          className="cmd-paper-lt"
          style={{
            borderRight: "1px dashed var(--rule)",
            padding: "14px 12px",
          }}
        >
          <CmdMiniLabel>Árbol jerárquico</CmdMiniLabel>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "0 4px 8px",
            }}
          >
            Categoría → Subcat. → Principal → Subingrediente
          </div>
          <IngTree active={cat} onPick={setCat} />
          <button
            type="button"
            className="cmd-link"
            style={{
              padding: "10px 8px 0",
              fontSize: 11,
              color: "var(--muted)",
              minHeight: 0,
              background: "none",
              border: "none",
            }}
          >
            + nueva categoría
          </button>
        </div>

        <div style={{ padding: "16px 22px 24px" }}>
          {/* KPI strip */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {kpis.map((k) => (
              <div
                key={k.label}
                style={{
                  borderLeft: `2px solid ${k.tone || "var(--ink)"}`,
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
                  {k.label}
                </div>
                <div
                  className="cmd-num font-slab"
                  style={{ fontSize: 26, lineHeight: 1, marginTop: 4 }}
                >
                  {k.val}
                </div>
              </div>
            ))}
          </div>

          {/* table */}
          <div
            className="cmd-paper-lt"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            <div
              className="bg-paper"
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 10,
                padding: "8px 12px",
                borderBottom: "1.5px solid var(--ink)",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 600,
              }}
            >
              <span />
              <span>Ingrediente</span>
              <span>Categoría</span>
              <span style={{ textAlign: "center" }}>Unidad</span>
              <span style={{ textAlign: "right" }}>Stock</span>
              <span>Stock vs mínimo</span>
              <span style={{ textAlign: "right" }}>Merma</span>
              <span style={{ textAlign: "right" }}>Costo / U</span>
            </div>

            {INGS.map((ing, i) => {
              const isExp = expanded[ing.name];
              return (
                <React.Fragment key={ing.name}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      gap: 10,
                      padding: "10px 12px",
                      alignItems: "center",
                      borderBottom: "1px dashed var(--rule-soft)",
                      background:
                        i % 2 ? "var(--paper-lt)" : "var(--paper)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        ing.sub &&
                        setExpanded((s) => ({
                          ...s,
                          [ing.name]: !isExp,
                        }))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: ing.sub ? "pointer" : "default",
                        color: ing.sub ? "var(--ink)" : "var(--rule)",
                        fontSize: 10,
                        minHeight: 0,
                      }}
                    >
                      {ing.sub ? (isExp ? "▾" : "▸") : "·"}
                    </button>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {ing.name}
                      </div>
                      {ing.sub ? (
                        <div
                          className="text-muted"
                          style={{ fontSize: 10, marginTop: 2 }}
                        >
                          contiene {ing.sub.length} sub-ingredientes
                        </div>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      {ing.group}
                    </div>
                    <div
                      className="text-muted cmd-num"
                      style={{
                        textAlign: "center",
                        fontSize: 11,
                      }}
                    >
                      {ing.unit}
                    </div>
                    <div
                      className="cmd-num"
                      style={{
                        textAlign: "right",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {ing.stock}
                    </div>
                    <StockBar
                      value={ing.stock}
                      min={ing.min}
                      max={Math.max(ing.min * 2.5, ing.stock * 1.1)}
                      unit={ing.unit}
                    />
                    <div
                      className="cmd-num"
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        color:
                          ing.merma >= 5
                            ? "var(--red)"
                            : ing.merma >= 2
                              ? "var(--amber)"
                              : "var(--muted)",
                      }}
                    >
                      {ing.merma}%
                    </div>
                    <div
                      className="cmd-num"
                      style={{ textAlign: "right", fontSize: 12 }}
                    >
                      ${fmtCOP(ing.cost)}
                    </div>
                  </div>
                  {isExp && ing.sub
                    ? ing.sub.map((s) => (
                        <div
                          key={s}
                          style={{
                            display: "grid",
                            gridTemplateColumns: GRID,
                            gap: 10,
                            padding: "7px 12px 7px 28px",
                            alignItems: "center",
                            borderBottom: "1px dashed var(--rule-soft)",
                            background: "var(--paper-dk)",
                            fontSize: 11,
                            color: "var(--ink-2)",
                          }}
                        >
                          <span style={{ color: "var(--muted)" }}>└</span>
                          <span>{s}</span>
                          <span style={{ color: "var(--muted)" }}>
                            sub-ingrediente
                          </span>
                          <span
                            style={{
                              textAlign: "center",
                              color: "var(--muted)",
                            }}
                          >
                            und
                          </span>
                          <span
                            className="cmd-num"
                            style={{ textAlign: "right" }}
                          >
                            —
                          </span>
                          <span
                            style={{
                              color: "var(--muted)",
                              fontSize: 10,
                            }}
                          >
                            vinculado al padre
                          </span>
                          <span
                            className="cmd-num"
                            style={{ textAlign: "right" }}
                          >
                            —
                          </span>
                          <span
                            className="cmd-num"
                            style={{ textAlign: "right" }}
                          >
                            —
                          </span>
                        </div>
                      ))
                    : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
