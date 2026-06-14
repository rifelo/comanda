"use client";

/**
 * Importación — CSV import of productos or ingredientes. Parse + validate
 * happen client-side (lib/importacion); the confirmed rows are upserted by the
 * importRows server action (which re-validates).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  parseCsvRecords,
  validateRows,
  IMPORT_COLUMNS,
  type ImportType,
} from "@/lib/importacion";
import { SectionCrumb } from "../_components/shared";
import { importRows } from "./actions";

const SAMPLE: Record<ImportType, string> = {
  productos: "name,sku,price_cop\nBurger Clásica,HB-100,24900\nLimonada,BJ-010,8900",
  ingredientes: "name,unit,cost_cop,stock_min\nPan brioche,und,1100,100\nQueso cheddar,kg,18000,4",
};

export function ImportacionClient() {
  const router = useRouter();
  const [type, setType] = React.useState<ImportType>("productos");
  const [text, setText] = React.useState("");
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { records } = React.useMemo(() => parseCsvRecords(text), [text]);
  const validated = React.useMemo(() => validateRows(type, records), [type, records]);
  const validCount = validated.filter((r) => r.data !== null).length;
  const errorCount = validated.length - validCount;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
    setResult(null);
  };

  const doImport = () => {
    setError(null);
    setResult(null);
    start(async () => {
      const r = await importRows({ type, records });
      if (r?.error) setError(r.error);
      else {
        setResult({ imported: r.imported ?? 0, skipped: r.skipped ?? 0 });
        router.refresh();
      }
    });
  };

  const inputSt: React.CSSProperties = { border: "1.5px solid var(--ink)", padding: "8px 10px", fontSize: 12, color: "var(--ink)", background: "var(--paper)", minHeight: 0 };

  return (
    <div>
      <SectionCrumb section="importacion" />
      <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
        {/* left: input */}
        <div>
          <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
            1 · Tipo de importación
          </div>
          <div className="flex" style={{ gap: 8, marginBottom: 18 }}>
            {(["productos", "ingredientes"] as ImportType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={type === t ? "cmd-btn sm" : "cmd-btn ghost sm"}
                onClick={() => { setType(t); setResult(null); }}
                style={{ textTransform: "capitalize" }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
            2 · Pega o sube un CSV
          </div>
          <div className="flex" style={{ gap: 10, marginBottom: 8, alignItems: "center" }}>
            <input aria-label="Archivo CSV" type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 11 }} />
            <button type="button" className="cmd-link text-muted" style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => { setText(SAMPLE[type]); setResult(null); }}>
              usar ejemplo
            </button>
          </div>
          <textarea
            aria-label="CSV"
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            placeholder={`Columnas: ${IMPORT_COLUMNS[type].join(", ")}`}
            rows={12}
            style={{ ...inputSt, width: "100%", fontFamily: "var(--font-mono)", boxSizing: "border-box" }}
          />
          <div className="text-muted" style={{ fontSize: 10, marginTop: 6 }}>
            Columnas esperadas: <strong>{IMPORT_COLUMNS[type].join(", ")}</strong>
            {type === "ingredientes" ? " (stock_min opcional)" : ""}
          </div>
        </div>

        {/* right: preview + confirm */}
        <div>
          <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
            3 · Previsualización
          </div>
          <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)", padding: 14, marginBottom: 14 }}>
            <div className="flex justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>Filas válidas</span>
              <span className="cmd-num" style={{ fontWeight: 600, color: "var(--green)" }}>{validCount}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: 12 }}>Con errores</span>
              <span className="cmd-num" style={{ fontWeight: 600, color: errorCount ? "var(--red)" : "var(--muted)" }}>{errorCount}</span>
            </div>
          </div>

          {validated.length > 0 ? (
            <div className="cmd-paper-lt" style={{ border: "1px solid var(--rule)", maxHeight: 260, overflowY: "auto", marginBottom: 14 }}>
              {validated.map((r) => (
                <div key={r.row} className="flex justify-between" style={{ padding: "6px 10px", borderBottom: "1px dashed var(--rule-soft)", fontSize: 11, background: r.error ? "rgba(176,58,46,0.06)" : "transparent" }}>
                  <span className="cmd-num text-muted">#{r.row}</span>
                  <span style={{ flex: 1, padding: "0 8px" }}>
                    {r.data ? Object.values(r.data).join(" · ") : <span className="text-muted">{records[r.row - 1] ? Object.values(records[r.row - 1]).join(" · ") : ""}</span>}
                  </span>
                  <span style={{ color: r.error ? "var(--red)" : "var(--green)" }}>{r.error ?? "✓"}</span>
                </div>
              ))}
            </div>
          ) : null}

          {result ? (
            <div role="status" style={{ border: "1.5px solid var(--green)", color: "var(--green)", padding: "10px 12px", fontSize: 12, marginBottom: 12 }}>
              ✓ Importadas {result.imported} fila(s){result.skipped ? ` · ${result.skipped} omitidas` : ""}.
            </div>
          ) : null}
          {error ? (
            <div role="alert" style={{ border: "1px solid var(--red)", color: "var(--red)", padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{error}</div>
          ) : null}

          <button
            type="button"
            className="cmd-btn w-full"
            disabled={pending || validCount === 0}
            onClick={doImport}
          >
            {pending ? "Importando…" : `Importar ${validCount} fila(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
