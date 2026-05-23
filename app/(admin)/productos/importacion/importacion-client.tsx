"use client";

/**
 * 09 · Importación — 3-step wizard:
 *  (1) tipo + plantilla → (2) cargar archivo + preview → (3) confirmar.
 */
import * as React from "react";
import { PARSED_ROWS, fmtCOP } from "@/lib/mock/productos";
import { Stamp } from "@/components/comanda/primitives";
import { SectionCrumb } from "../_components/shared";

type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Tipo · plantilla" },
  { n: 2, label: "Cargar archivo" },
  { n: 3, label: "Confirmar" },
];

export function ImportacionClient() {
  const [step, setStep] = React.useState<Step>(2);
  const validRows = PARSED_ROWS.filter((r) => r.ok).length;
  const errorRows = PARSED_ROWS.length - validRows;

  return (
    <div>
      <SectionCrumb
        section="importacion"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Cancelar
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px 28px" }}>
        {/* stepper */}
        <div
          className="cmd-paper-lt"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            marginBottom: 24,
            border: "1.5px solid var(--ink)",
          }}
        >
          {STEPS.map((s, i) => {
            const active = step === s.n;
            const done = step > s.n;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => setStep(s.n)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--paper-lt)" : "var(--ink)",
                  border: "none",
                  borderRight:
                    i < STEPS.length - 1
                      ? "1.5px solid var(--ink)"
                      : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: `1.5px solid ${active ? "var(--paper-lt)" : "var(--ink)"}`,
                    background: done ? "var(--green)" : "transparent",
                    color: done
                      ? "var(--paper-lt)"
                      : active
                        ? "var(--paper-lt)"
                        : "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                  className="font-slab"
                >
                  {done ? "✓" : s.n}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      opacity: 0.8,
                    }}
                  >
                    Paso {s.n} de 3
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}
                  >
                    {s.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {step === 1 ? <Step1 /> : null}
        {step === 2 ? (
          <Step2
            validRows={validRows}
            errorRows={errorRows}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? (
          <Step3
            validRows={validRows}
            errorRows={errorRows}
            onBack={() => setStep(2)}
          />
        ) : null}
      </div>
    </div>
  );
}

function Step1() {
  const tipos = [
    {
      name: "Productos",
      tmpl: "productos-template.xlsx",
      desc: "Carga masiva de productos del catálogo: nombre, SKU, categoría, precio, costo, stock inicial.",
    },
    {
      name: "Ingredientes",
      tmpl: "ingredientes-template.xlsx",
      desc: "Carga masiva de ingredientes y sub-ingredientes con unidades, stock mínimo, merma estimada.",
    },
  ];
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}
    >
      {tipos.map((t, i) => (
        <div
          key={t.name}
          className="cmd-paper-lt"
          style={{ border: "1.5px solid var(--ink)", padding: 20 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Tipo
              </div>
              <div
                className="font-slab"
                style={{ fontSize: 22, marginTop: 2 }}
              >
                {t.name}
              </div>
            </div>
            <input
              type="radio"
              name="tipo"
              defaultChecked={i === 0}
              aria-label={`Importar ${t.name}`}
            />
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            {t.desc}
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 10,
              borderTop: "1px dashed var(--rule)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              className="cmd-num text-muted"
              style={{ fontSize: 11 }}
            >
              ↓ {t.tmpl}
            </span>
            <button
              type="button"
              className="cmd-link"
              style={{
                fontSize: 11,
                background: "none",
                border: "none",
                padding: 0,
                minHeight: 0,
              }}
            >
              Descargar plantilla
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step2({
  validRows,
  errorRows,
  onBack,
  onNext,
}: {
  validRows: number;
  errorRows: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      {/* dropzone */}
      <div
        className="cmd-paper-lt"
        style={{
          border: "2px dashed var(--ink)",
          padding: 28,
          display: "flex",
          alignItems: "center",
          gap: 22,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div
          className="bg-paper relative"
          style={{
            width: 64,
            height: 80,
            border: "1.5px solid var(--ink)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              right: 8,
              height: 2,
              background: "var(--green)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 8,
              right: 14,
              height: 2,
              background: "var(--rule)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 8,
              right: 18,
              height: 2,
              background: "var(--rule)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              fontSize: 8,
              background: "var(--green)",
              color: "var(--paper-lt)",
              padding: "1px 4px",
              letterSpacing: "0.1em",
            }}
          >
            XLSX
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Archivo cargado
          </div>
          <div className="font-slab" style={{ fontSize: 22, marginTop: 2 }}>
            productos_mayo_2026.xlsx
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-2)",
              marginTop: 4,
            }}
          >
            {PARSED_ROWS.length} filas detectadas · UTF-8 · 24 KB
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="cmd-btn ghost sm">
            Reemplazar
          </button>
          <button type="button" className="cmd-btn sm">
            Re-validar
          </button>
        </div>
      </div>

      {/* summary */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <SummaryCard label="Total filas" value={PARSED_ROWS.length} />
        <SummaryCard
          label="Válidas"
          value={validRows}
          color="var(--green)"
        />
        <SummaryCard
          label="Errores"
          value={errorRows}
          color="var(--red)"
        />
      </div>

      {/* preview table */}
      <div
        className="cmd-paper-lt"
        style={{ border: "1.5px solid var(--ink)" }}
      >
        <div
          className="bg-paper"
          style={{
            display: "grid",
            gridTemplateColumns: "32px 90px 1.4fr 1fr 90px 90px 70px",
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
          <span />
          <span>SKU</span>
          <span>Nombre</span>
          <span>Categoría</span>
          <span style={{ textAlign: "right" }}>Precio</span>
          <span style={{ textAlign: "right" }}>Costo</span>
          <span style={{ textAlign: "right" }}>Stock</span>
        </div>
        {PARSED_ROWS.map((r, i) => (
          <div
            key={`${r.sku}-${r.name}`}
            style={{
              display: "grid",
              gridTemplateColumns:
                "32px 90px 1.4fr 1fr 90px 90px 70px",
              gap: 10,
              padding: "9px 14px",
              alignItems: "center",
              borderBottom: "1px dashed var(--rule-soft)",
              background: r.ok
                ? i % 2
                  ? "var(--paper-lt)"
                  : "var(--paper)"
                : "rgba(176,58,46,0.07)",
            }}
          >
            <span
              style={{
                color: r.ok ? "var(--green)" : "var(--red)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {r.ok ? "✓" : "✕"}
            </span>
            <span
              className="cmd-num"
              style={{
                fontSize: 11,
                color: r.sku ? "var(--ink)" : "var(--red)",
              }}
            >
              {r.sku || "—"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</span>
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
              {r.cat}
            </span>
            <span
              className="cmd-num"
              style={{ textAlign: "right", fontSize: 12 }}
            >
              ${fmtCOP(r.price)}
            </span>
            <span
              className="cmd-num"
              style={{
                textAlign: "right",
                fontSize: 12,
                color: r.cost == null ? "var(--red)" : "var(--ink)",
              }}
            >
              {r.cost == null ? "—" : `$${fmtCOP(r.cost)}`}
            </span>
            <span
              className="cmd-num"
              style={{ textAlign: "right", fontSize: 12 }}
            >
              {r.stock}
            </span>
            {!r.ok && r.err ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "6px 0 0 32px",
                  fontSize: 11,
                  color: "var(--red)",
                  fontStyle: "italic",
                }}
              >
                ↳ {r.err}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          className="cmd-btn ghost sm"
          onClick={onBack}
        >
          ‹ Volver
        </button>
        <button type="button" className="cmd-btn sm" onClick={onNext}>
          Continuar → confirmar
        </button>
      </div>
    </div>
  );
}

function Step3({
  validRows,
  errorRows,
  onBack,
}: {
  validRows: number;
  errorRows: number;
  onBack: () => void;
}) {
  return (
    <div style={{ maxWidth: 720 }}>
      <div
        className="cmd-noise cmd-paper-lt relative"
        style={{ border: "1.5px solid var(--ink)", padding: 26 }}
      >
        <div style={{ position: "absolute", top: -10, right: 22 }}>
          <Stamp rotate={-4}>preview</Stamp>
        </div>
        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Resumen de importación
        </div>
        <h2
          className="font-slab"
          style={{ fontSize: 28, margin: "4px 0 18px" }}
        >
          {validRows} productos listos para importar
        </h2>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
            paddingBottom: 18,
            borderBottom: "1px dashed var(--rule)",
          }}
        >
          <Summary mini label="Crear nuevos" value={5} />
          <Summary mini label="Actualizar existentes" value={0} />
          <Summary
            mini
            label="Omitir (errores)"
            value={errorRows}
            color="var(--red)"
          />
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "var(--ink-2)",
            lineHeight: 1.6,
          }}
        >
          Los {errorRows} registros con errores se exportarán a un archivo
          aparte (<span className="cmd-num">errores_2026-05-15.xlsx</span>)
          para corrección manual. La importación es reversible durante los
          próximos 60 minutos.
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="cmd-btn ghost sm"
            onClick={onBack}
          >
            ‹ Volver
          </button>
          <button type="button" className="cmd-btn red">
            Confirmar importación
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "var(--ink)",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
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
      <div className="cmd-num font-slab" style={{ fontSize: 28, color }}>
        {value}
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
  mini?: boolean;
}) {
  return (
    <div>
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
        style={{ fontSize: 30, color: color ?? "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
