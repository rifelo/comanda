"use client";

/**
 * 08 · Listas de Precios — matrix table; each cell is editable + shows Δ%.
 */
import { PRICE_LISTS, PRICE_PRODUCTS, fmtCOP } from "@/lib/mock/productos";
import { SectionCrumb, Thumb } from "../_components/shared";

function PriceCell({
  value,
  base,
}: {
  value: number | null;
  base: number | null;
}) {
  const delta =
    base != null && value != null ? ((value - base) / base) * 100 : null;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <input
        defaultValue={value != null ? fmtCOP(value) : ""}
        placeholder="—"
        className="cmd-num"
        aria-label="Precio"
        style={{
          textAlign: "right",
          border: "1px solid var(--rule)",
          padding: "6px 8px",
          fontSize: 13,
          fontWeight: 500,
          background: "transparent",
          color: "var(--ink)",
          outline: "none",
          width: "100%",
          minHeight: 0,
        }}
      />
      {delta != null && Math.abs(delta) > 0.5 ? (
        <span
          className="cmd-num"
          style={{
            fontSize: 9,
            color: delta > 0 ? "var(--green)" : "var(--red)",
            textAlign: "right",
            letterSpacing: "0.06em",
          }}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(0)}%
        </span>
      ) : null}
    </div>
  );
}

export function PreciosClient() {
  const cols = PRICE_LISTS.length;
  const gridTemplate = `1.6fr 110px repeat(${cols}, 1fr)`;

  return (
    <div>
      <SectionCrumb
        section="precios"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Reglas · descuentos
            </button>
            <button type="button" className="cmd-btn ghost sm">
              + Nueva lista
            </button>
            <button type="button" className="cmd-btn sm">
              Publicar cambios
            </button>
          </>
        }
      />

      <div style={{ padding: "18px 28px 28px" }}>
        {/* header strip */}
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 10, marginBottom: 14 }}
        >
          <span
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Listas activas
          </span>
          {PRICE_LISTS.map((l) => (
            <div
              key={l.id}
              className="cmd-paper-lt"
              style={{
                border: "1px solid var(--ink)",
                padding: "5px 10px",
                fontSize: 11,
              }}
            >
              <strong>{l.name}</strong>
              <span
                className="text-muted ml-2"
                style={{ fontSize: 10 }}
              >
                {l.sub}
              </span>
            </div>
          ))}
        </div>

        <div
          className="cmd-paper-lt"
          style={{
            border: "1.5px solid var(--ink)",
            overflow: "hidden",
          }}
        >
          {/* matrix header */}
          <div
            className="bg-paper"
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplate,
              borderBottom: "1.5px solid var(--ink)",
            }}
          >
            <div
              className="text-muted"
              style={{
                padding: "12px 14px",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Producto
            </div>
            <div
              className="text-muted"
              style={{
                padding: "12px 14px",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Categoría
            </div>
            {PRICE_LISTS.map((l, i) => (
              <div
                key={l.id}
                style={{
                  padding: "12px 14px",
                  borderLeft:
                    i === 0
                      ? "1.5px solid var(--ink)"
                      : "1px dashed var(--rule)",
                  background:
                    i === 0 ? "var(--paper-lt)" : "var(--paper)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {l.name}
                </div>
                <div
                  className="text-muted"
                  style={{
                    fontSize: 9,
                    marginTop: 2,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {l.sub}
                </div>
              </div>
            ))}
          </div>
          {PRICE_PRODUCTS.map((p, i) => (
            <div
              key={p.name}
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                borderBottom: "1px dashed var(--rule-soft)",
                background:
                  i % 2 ? "var(--paper-lt)" : "var(--paper)",
              }}
            >
              <div
                className="flex items-center"
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  gap: 10,
                }}
              >
                <Thumb w={26} h={26} label={p.name.split(" ")[0]} />
                {p.name}
              </div>
              <div
                className="flex items-center"
                style={{
                  padding: "10px 14px",
                  fontSize: 11,
                  color: "var(--ink-2)",
                }}
              >
                {p.cat}
              </div>
              {p.precios.map((price, j) => (
                <div
                  key={j}
                  className="flex items-center"
                  style={{
                    padding: "8px 12px",
                    borderLeft:
                      j === 0
                        ? "1.5px solid var(--ink)"
                        : "1px dashed var(--rule)",
                    background:
                      j === 0 ? "var(--paper-dk)" : "transparent",
                  }}
                >
                  <PriceCell
                    value={price}
                    base={j === 0 ? null : p.precios[0]}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          className="text-muted"
          style={{
            marginTop: 12,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            Tip · pega columnas desde Excel directamente sobre cualquier celda
          </span>
          <span>
            {PRICE_PRODUCTS.length} productos · {PRICE_LISTS.length} listas · sin guardar
          </span>
        </div>
      </div>
    </div>
  );
}
