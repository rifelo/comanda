import { RECETA, fmtCOP } from "@/lib/mock/productos";
import { Scribble, Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, Thumb } from "../_components/shared";

export const metadata = { title: "Productos · Recetas · co-manda" };

export default function RecetasPage() {
  const totalCosto = RECETA.ings.reduce((s, x) => s + x.total, 0);
  const margen = ((RECETA.price - totalCosto) / RECETA.price) * 100;
  const ok = margen >= 55;

  return (
    <div>
      <SectionCrumb
        section="recetas"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Duplicar
            </button>
            <button type="button" className="cmd-btn ghost sm">
              Historial
            </button>
            <button type="button" className="cmd-btn sm">
              Guardar receta
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px 28px" }}>
        {/* product header */}
        <div
          className="cmd-noise cmd-paper-lt relative"
          style={{
            border: "1.5px solid var(--ink)",
            padding: 18,
            display: "grid",
            gridTemplateColumns: "80px 1fr 220px",
            gap: 18,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Thumb w={80} h={80} label={RECETA.product} />
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {RECETA.cat} · {RECETA.sku}
            </div>
            <div
              className="font-slab"
              style={{ fontSize: 28, marginTop: 2, lineHeight: 1.05 }}
            >
              {RECETA.product}
            </div>
            <div
              style={{ marginTop: 6, fontSize: 11, color: "var(--ink-2)" }}
            >
              Receta versión 3 · editada por <strong>Andrés R.</strong> · 14·MAY 16:08
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Precio de venta
            </div>
            <div
              className="cmd-num font-slab"
              style={{ fontSize: 32, lineHeight: 1, marginTop: 2 }}
            >
              ${fmtCOP(RECETA.price)}
            </div>
            <button
              type="button"
              className="cmd-link"
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 6,
                minHeight: 0,
                padding: 0,
                background: "none",
                border: "none",
              }}
            >
              editar precio
            </button>
          </div>
          <div style={{ position: "absolute", top: -8, right: 18 }}>
            <Stamp rotate={4}>vigente · v3</Stamp>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            gap: 20,
          }}
        >
          {/* ingredients table */}
          <div
            className="cmd-paper-lt"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            <div
              className="bg-paper"
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 80px 70px 100px 100px 32px",
                gap: 10,
                padding: "8px 14px",
                borderBottom: "1.5px solid var(--ink)",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 600,
              }}
            >
              <span>Ingrediente</span>
              <span style={{ textAlign: "right" }}>Cantidad</span>
              <span>Unidad</span>
              <span style={{ textAlign: "right" }}>Costo / U</span>
              <span style={{ textAlign: "right" }}>Costo total</span>
              <span />
            </div>
            {RECETA.ings.map((g, i) => (
              <div
                key={`${g.name}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.6fr 80px 70px 100px 100px 32px",
                  gap: 10,
                  padding: "10px 14px",
                  alignItems: "center",
                  borderBottom: "1px dashed var(--rule-soft)",
                  background:
                    i % 2 ? "var(--paper-lt)" : "var(--paper)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {g.name}
                  </div>
                  {g.note ? (
                    <div style={{ marginTop: 2 }}>
                      <Scribble size={12} rotate={-2}>
                        {g.note}
                      </Scribble>
                    </div>
                  ) : null}
                </div>
                <input
                  className="cmd-num bg-paper"
                  defaultValue={g.qty}
                  style={{
                    textAlign: "right",
                    border: "1px solid var(--rule)",
                    padding: "4px 6px",
                    fontSize: 12,
                    width: "100%",
                    color: "var(--ink)",
                    minHeight: 0,
                  }}
                />
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {g.unit}
                </div>
                <div
                  className="cmd-num text-muted"
                  style={{ textAlign: "right", fontSize: 12 }}
                >
                  ${fmtCOP(g.cost)}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ${fmtCOP(g.total)}
                </div>
                <div
                  className="text-muted"
                  style={{
                    textAlign: "right",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </div>
              </div>
            ))}
            <div
              className="bg-paper"
              style={{
                padding: "14px",
                borderTop: "1px dashed var(--rule)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14, color: "var(--muted)" }}>+</span>
                <input
                  placeholder="Agregar ingrediente · buscar por nombre o SKU"
                  className="cmd-paper-lt"
                  style={{
                    border: "1px solid var(--rule)",
                    padding: "7px 10px",
                    fontSize: 12,
                    width: "100%",
                    color: "var(--ink)",
                    outline: "none",
                    minHeight: 0,
                  }}
                />
                <button type="button" className="cmd-btn ghost sm">
                  Agregar
                </button>
              </div>
            </div>
          </div>

          {/* summary cards */}
          <div className="flex flex-col" style={{ gap: 14 }}>
            <SummaryCard label="Costo total de la receta" caption="basado en costos actuales de inventario">
              ${fmtCOP(totalCosto)}
            </SummaryCard>
            <SummaryCard label="Precio de venta" caption="lista base · sin descuentos">
              ${fmtCOP(RECETA.price)}
            </SummaryCard>
            <div
              className="cmd-paper-lt relative"
              style={{
                border: `1.5px solid ${ok ? "var(--green)" : "var(--red)"}`,
                padding: 14,
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
                Margen de ganancia
              </div>
              <div
                className="cmd-num font-slab"
                style={{
                  fontSize: 38,
                  lineHeight: 1,
                  marginTop: 4,
                  color: ok ? "var(--green)" : "var(--red)",
                }}
              >
                {margen.toFixed(1)}%
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 10, marginTop: 4 }}
              >
                {ok
                  ? "✓ sobre umbral mínimo (55%)"
                  : "⚠ bajo umbral mínimo (55%)"}
              </div>
              <div style={{ position: "absolute", top: -10, right: 12 }}>
                <Stamp
                  rotate={-4}
                  color={ok ? "var(--green)" : "var(--red)"}
                >
                  {ok ? "rentable" : "revisar"}
                </Stamp>
              </div>
            </div>
            <div
              className="bg-paper"
              style={{ border: "1px dashed var(--rule)", padding: 12 }}
            >
              <div
                className="text-muted"
                style={{
                  fontSize: 10,
                  marginBottom: 6,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Aplicar a
              </div>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  fontSize: 11,
                  marginBottom: 4,
                  minHeight: 0,
                }}
              >
                <input type="checkbox" defaultChecked /> Norte · Chapinero · Centro
              </label>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  fontSize: 11,
                  minHeight: 0,
                }}
              >
                <input type="checkbox" /> Replicar cambios en variantes
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cmd-paper-lt"
      style={{ border: "1.5px solid var(--ink)", padding: 14 }}
    >
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="cmd-num font-slab"
        style={{ fontSize: 30, lineHeight: 1, marginTop: 4 }}
      >
        {children}
      </div>
      <div
        className="text-muted"
        style={{ fontSize: 10, marginTop: 4 }}
      >
        {caption}
      </div>
    </div>
  );
}
