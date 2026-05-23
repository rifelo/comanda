"use client";

/**
 * 10 · Modificadores — collapsible groups with options + POS preview rail.
 */
import * as React from "react";
import { MODIF_GROUPS, type ModifGroup, fmtCOP } from "@/lib/mock/productos";
import { Stamp } from "@/components/comanda/primitives";
import { SectionCrumb } from "../_components/shared";
import { NotifToggle } from "../_components/chip";

export function ModificadoresClient() {
  const [groups, setGroups] = React.useState<ModifGroup[]>(MODIF_GROUPS);
  const toggle = (i: number) =>
    setGroups((s) =>
      s.map((g, j) => (j === i ? { ...g, expanded: !g.expanded } : g)),
    );

  return (
    <div>
      <SectionCrumb
        section="modificadores"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Vincular a producto
            </button>
            <button type="button" className="cmd-btn sm">
              + Nuevo grupo
            </button>
          </>
        }
      />

      <div
        style={{
          padding: "20px 28px",
          display: "grid",
          gridTemplateColumns: "1fr 260px",
          gap: 22,
        }}
      >
        <div className="flex flex-col" style={{ gap: 14 }}>
          {groups.map((g, i) => (
            <div
              key={g.name}
              className="cmd-paper-lt"
              style={{ border: "1.5px solid var(--ink)" }}
            >
              <div
                className="bg-paper"
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr 120px 100px 100px 60px",
                  gap: 12,
                  padding: "14px 16px",
                  alignItems: "center",
                  borderBottom: g.expanded
                    ? "1px dashed var(--rule)"
                    : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={!!g.expanded}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "var(--ink)",
                    fontSize: 14,
                    minHeight: 0,
                  }}
                >
                  {g.expanded ? "▾" : "▸"}
                </button>
                <div>
                  <div
                    className="font-slab"
                    style={{ fontSize: 18, lineHeight: 1.1 }}
                  >
                    {g.name}
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      fontSize: 10,
                      marginTop: 4,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {g.options.length} opciones ·{" "}
                    {g.options.filter((o) => o.on).length} activas
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--ink)",
                    padding: "3px 8px",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    textAlign: "center",
                  }}
                >
                  {g.type === "single" ? "○ Una opción" : "☑ Multi"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-2)",
                    textAlign: "center",
                  }}
                >
                  {g.required ? (
                    <Stamp size={9} rotate={-2} color="var(--red)">
                      requerido
                    </Stamp>
                  ) : (
                    <span
                      className="text-muted"
                      style={{
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        fontSize: 10,
                      }}
                    >
                      opcional
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-2)",
                    textAlign: "right",
                  }}
                >
                  <span
                    className="cmd-num"
                    style={{ fontWeight: 600 }}
                  >
                    {g.linked}
                  </span>{" "}
                  productos
                </div>
                <div
                  className="text-muted"
                  style={{
                    textAlign: "right",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  ···
                </div>
              </div>

              {g.expanded ? (
                <div>
                  {g.options.map((o, j) => (
                    <div
                      key={`${o.name}-${j}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "32px 1fr 100px 120px 80px",
                        gap: 12,
                        padding: "10px 16px 10px 48px",
                        alignItems: "center",
                        borderBottom:
                          j < g.options.length - 1
                            ? "1px dashed var(--rule-soft)"
                            : "none",
                        background:
                          j % 2 ? "transparent" : "rgba(235,226,207,0.34)",
                      }}
                    >
                      <span
                        className="text-muted"
                        style={{ fontSize: 14, cursor: "grab" }}
                        aria-label="reordenar opción"
                      >
                        ⋮⋮
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {o.name}
                      </div>
                      <div
                        className="cmd-num"
                        style={{
                          fontSize: 12,
                          color:
                            o.delta > 0
                              ? "var(--green)"
                              : "var(--muted)",
                          textAlign: "right",
                        }}
                      >
                        {o.delta > 0
                          ? `+ $${fmtCOP(o.delta)}`
                          : "sin recargo"}
                      </div>
                      <NotifToggle
                        initialOn={o.on}
                        label={o.on ? "Disponible" : "Agotado"}
                      />
                      <div
                        className="text-muted"
                        style={{
                          textAlign: "right",
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        ···
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-muted"
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      borderTop: "1px dashed var(--rule)",
                      padding: "10px 16px 10px 48px",
                      fontSize: 11,
                      cursor: "pointer",
                      textAlign: "left",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      minHeight: 0,
                    }}
                  >
                    + agregar opción
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* right rail */}
        <aside>
          <div
            className="cmd-paper-lt"
            style={{
              border: "1px dashed var(--rule)",
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Resumen
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-2)",
                marginTop: 8,
                lineHeight: 1.7,
              }}
            >
              <div>
                <span className="cmd-num" style={{ fontWeight: 600 }}>
                  {groups.length}
                </span>{" "}
                grupos definidos
              </div>
              <div>
                <span className="cmd-num" style={{ fontWeight: 600 }}>
                  {groups.reduce((s, g) => s + g.options.length, 0)}
                </span>{" "}
                opciones totales
              </div>
              <div>
                <span className="cmd-num" style={{ fontWeight: 600 }}>
                  {groups.reduce((s, g) => s + g.linked, 0)}
                </span>{" "}
                vínculos a productos
              </div>
            </div>
          </div>
          <div
            className="cmd-paper-lt"
            style={{ border: "1px dashed var(--rule)", padding: 14 }}
          >
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Preview en POS
            </div>
            <div
              className="bg-paper"
              style={{
                border: "1px solid var(--ink)",
                padding: 12,
                fontSize: 12,
              }}
            >
              <div
                className="font-slab"
                style={{ fontSize: 16, lineHeight: 1.2 }}
              >
                Doble Tocineta
              </div>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div
                  className="text-muted"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Punto de la carne · req.
                </div>
                {["Término medio", "Tres cuartos", "Bien cocida"].map((x) => (
                  <div
                    key={x}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      padding: "3px 0",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        border: "1px solid var(--ink)",
                        borderRadius: 99,
                        display: "inline-block",
                      }}
                    />
                    {x}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11 }}>
                <div
                  className="text-muted"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Extras
                </div>
                {(
                  [
                    ["Queso cheddar extra", 3500],
                    ["Tocineta extra", 4500],
                  ] as const
                ).map(([x, p]) => (
                  <div
                    key={x}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      padding: "3px 0",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          border: "1px solid var(--ink)",
                          display: "inline-block",
                        }}
                      />
                      {x}
                    </span>
                    <span
                      className="cmd-num"
                      style={{ color: "var(--green)" }}
                    >
                      + ${fmtCOP(p)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
