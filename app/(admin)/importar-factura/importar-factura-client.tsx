"use client";

/**
 * Importar factura — upload a purchase invoice photo, let Claude extract the
 * line items, review/edit them, then bulk-create ingredientes. Packs derive
 * their per-unit cost automatically (lineCost ÷ packQty), reusing the same
 * "comprado por paquete" rule as the inventario form.
 */
import * as React from "react";
import { unitCostFromPack } from "@/lib/cost";
import { UNITS, type InvoiceItem, type Unit } from "@/lib/ai/invoice-types";
import { extractInvoiceAction, importIngredientesBatch } from "./actions";

const fmt = (n: number) =>
  "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

interface CategoryOption {
  id: string;
  label: string;
}

// A category choice is encoded as: "" (none) | "<uuid>" (existing) | "new:Label".
interface Row {
  include: boolean;
  rawText: string;
  name: string;
  categoryChoice: string;
  newLabel: string | null; // AI-suggested label when it didn't match an existing one
  unit: Unit;
  isPack: boolean;
  packQty: string;
  lineCost: string;
  stockCurrent: string;
  note: string;
}

function rowsFromItems(items: InvoiceItem[], categorias: CategoryOption[]): Row[] {
  const matchCategory = (label: string): string | null => {
    if (!label) return null;
    const lc = label.toLowerCase();
    const hit = categorias.find((c) => {
      const leaf = c.label.split("·").pop()?.trim().toLowerCase();
      return leaf === lc || c.label.toLowerCase() === lc;
    });
    return hit?.id ?? null;
  };
  return items.map((it) => {
    const existing = matchCategory(it.category);
    const newLabel = existing ? null : it.category || null;
    return {
      include: true,
      rawText: it.rawText,
      name: it.name,
      categoryChoice: existing ?? (newLabel ? `new:${newLabel}` : ""),
      newLabel,
      unit: it.unit,
      isPack: it.isPack,
      packQty: it.packQty != null ? String(it.packQty) : "",
      lineCost: String(it.lineCost),
      stockCurrent: String(it.isPack && it.packQty ? it.packQty : 1),
      note: it.note,
    };
  });
}

function rowUnitCost(r: Row): number {
  const line = Number(r.lineCost) || 0;
  const qty = Number(r.packQty) || 0;
  return r.isPack && qty > 0 ? unitCostFromPack(line, qty) : line;
}

export function ImportarFacturaClient({
  categorias,
}: {
  categorias: CategoryOption[];
}) {
  const [phase, setPhase] = React.useState<"upload" | "review" | "done">("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [missingKey, setMissingKey] = React.useState(false);
  const [result, setResult] = React.useState<{
    created: number;
    skipped: { name: string; error: string }[];
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onPick = (f: File | null) => {
    setError(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const onExtract = () => {
    if (!file) return;
    setError(null);
    setMissingKey(false);
    const fd = new FormData();
    fd.append("image", file);
    startTransition(async () => {
      const res = await extractInvoiceAction(fd);
      if (!res.ok) {
        setError(res.error);
        setMissingKey(!!res.missingKey);
        return;
      }
      setRows(rowsFromItems(res.items, categorias));
      setPhase("review");
    });
  };

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const onImport = () => {
    setError(null);
    const payload = {
      rows: rows
        .filter((r) => r.include && r.name.trim())
        .map((r) => {
          const isUuid = r.categoryChoice && !r.categoryChoice.startsWith("new:");
          return {
            name: r.name.trim(),
            categoryId: isUuid ? r.categoryChoice : null,
            newCategoryLabel: r.categoryChoice.startsWith("new:")
              ? r.categoryChoice.slice(4)
              : null,
            unit: r.unit,
            isPack: r.isPack,
            packQty: r.isPack ? Number(r.packQty) || null : null,
            lineCost: Number(r.lineCost) || 0,
            stockCurrent: Number(r.stockCurrent) || 0,
          };
        }),
    };
    if (payload.rows.length === 0) {
      setError("Selecciona al menos un producto.");
      return;
    }
    startTransition(async () => {
      const res = await importIngredientesBatch(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ created: res.created, skipped: res.skipped });
      setPhase("done");
    });
  };

  const includedCount = rows.filter((r) => r.include).length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--font-slab)", fontSize: 26, color: "var(--ink)" }}>
          Importar factura<span style={{ color: "var(--red)" }}>.</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
          Sube la foto de una factura de compra. La IA lee los renglones, calcula
          el costo por unidad (incluyendo paquetes) y tú confirmas antes de
          crear los ingredientes.
        </div>
      </header>

      {error && (
        <div style={{ ...box, borderColor: "var(--red)", color: "var(--red)", marginBottom: 14 }}>
          {error}
          {missingKey && (
            <div style={{ marginTop: 6, color: "var(--ink-2)", fontSize: 11 }}>
              Agrega <code>ANTHROPIC_API_KEY</code> a las variables de entorno
              (.env.local y en Vercel) y vuelve a intentar.
            </div>
          )}
        </div>
      )}

      {phase === "upload" && (
        <div style={box}>
          <label style={labelSt}>Factura (foto)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            style={{ display: "block", marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa de la factura"
              style={{ maxWidth: 280, maxHeight: 360, border: "1px solid var(--rule)", marginBottom: 12, display: "block" }}
            />
          )}
          <button
            className="cmd-btn red"
            disabled={!file || pending}
            onClick={onExtract}
            style={{ opacity: file && !pending ? 1 : 0.5 }}
          >
            {pending ? "Leyendo factura…" : "Leer factura con IA"}
          </button>
        </div>
      )}

      {phase === "review" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>
              {rows.length} renglones · {includedCount} seleccionados
            </div>
            <button className="cmd-btn ghost" disabled={pending} onClick={() => { setPhase("upload"); setRows([]); }}>
              ← Otra factura
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1.5px solid var(--ink)" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--paper-lt)", textAlign: "left" }}>
                  {["", "Nombre", "Categoría", "Unidad", "Paquete", "Precio línea", "Costo/u", "Stock"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--rule)", opacity: r.include ? 1 : 0.45 }}>
                    <td style={td}>
                      <input type="checkbox" checked={r.include} disabled={pending}
                        onChange={(e) => patch(i, { include: e.target.checked })}
                        style={{ accentColor: "var(--ink)" }} />
                    </td>
                    <td style={td}>
                      <input value={r.name} disabled={pending}
                        onChange={(e) => patch(i, { name: e.target.value })}
                        title={r.rawText} style={{ ...inp, minWidth: 180 }} />
                    </td>
                    <td style={td}>
                      <select value={r.categoryChoice} disabled={pending}
                        onChange={(e) => patch(i, { categoryChoice: e.target.value })}
                        style={{ ...inp, minWidth: 150 }}>
                        <option value="">— sin categoría —</option>
                        {r.newLabel && <option value={`new:${r.newLabel}`}>＋ Crear: {r.newLabel}</option>}
                        {categorias.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={r.unit} disabled={pending}
                        onChange={(e) => patch(i, { unit: e.target.value as Unit })}
                        style={{ ...inp, minWidth: 70 }}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={r.isPack} disabled={pending}
                          onChange={(e) => patch(i, { isPack: e.target.checked })}
                          style={{ accentColor: "var(--ink)" }} />
                        {r.isPack ? (
                          <input value={r.packQty} disabled={pending} inputMode="numeric"
                            placeholder="x?" onChange={(e) => patch(i, { packQty: e.target.value.replace(/[^\d.]/g, "") })}
                            style={{ ...inp, width: 48 }} />
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>no</span>
                        )}
                      </label>
                    </td>
                    <td style={td}>
                      <input value={r.lineCost} disabled={pending} inputMode="numeric"
                        onChange={(e) => patch(i, { lineCost: e.target.value.replace(/[^\d]/g, "") })}
                        style={{ ...inp, width: 90 }} />
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: "var(--ink)" }}>{fmt(rowUnitCost(r))}</td>
                    <td style={td}>
                      <input value={r.stockCurrent} disabled={pending} inputMode="numeric"
                        onChange={(e) => patch(i, { stockCurrent: e.target.value.replace(/[^\d.]/g, "") })}
                        style={{ ...inp, width: 56 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14 }}>
            <button className="cmd-btn red" disabled={pending || includedCount === 0} onClick={onImport}
              style={{ opacity: pending || includedCount === 0 ? 0.5 : 1 }}>
              {pending ? "Creando…" : `Crear ${includedCount} ingredientes`}
            </button>
          </div>
        </>
      )}

      {phase === "done" && result && (
        <div style={box}>
          <div style={{ fontFamily: "var(--font-slab)", fontSize: 22, color: "var(--green)", marginBottom: 8 }}>
            ✓ {result.created} ingredientes creados
          </div>
          {result.skipped.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", marginBottom: 4 }}>
                {result.skipped.length} omitidos:
              </div>
              <ul style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)", margin: 0, paddingLeft: 18 }}>
                {result.skipped.map((s, i) => (
                  <li key={i}>{s.name} — {s.error}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <a className="cmd-btn" href="/inventario" style={{ textDecoration: "none" }}>Ver inventario</a>
            <button className="cmd-btn ghost" onClick={() => {
              setPhase("upload"); setFile(null); setPreview(null); setRows([]); setResult(null);
            }}>Importar otra</button>
          </div>
        </div>
      )}
    </div>
  );
}

const box: React.CSSProperties = {
  border: "1.5px solid var(--ink)",
  background: "var(--paper-lt)",
  padding: "16px 18px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
const labelSt: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 6,
};
const th: React.CSSProperties = {
  padding: "8px 8px",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--muted)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "6px 8px", verticalAlign: "middle" };
const inp: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: "5px 7px",
  boxSizing: "border-box",
};
