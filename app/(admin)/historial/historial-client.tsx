"use client";

/**
 * Movimientos — filterable audit log of stock changes, backed by
 * `ingrediente_movements`. Filtering/search is client-side over the fetched
 * page; "Exportar CSV" downloads the current view; "+ Ajuste manual" records
 * a real signed adjustment.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  filterMovimientos,
  movimientosToCsv,
  type MovimientoRow,
  type MovFiltro,
  type MovTipo,
} from "@/lib/movimientos";
import { SectionCrumb } from "../_components/shared";
import { Chip } from "../_components/chip";
import { registrarAjuste } from "./actions";

const GRID = "150px 1.4fr 130px 90px 1fr 90px";

const TIPO_META: Record<MovTipo, { label: string; bd: string }> = {
  venta: { label: "Venta", bd: "var(--ink)" },
  gasto: { label: "Gasto", bd: "var(--amber)" },
  ajuste: { label: "Ajuste manual", bd: "var(--red)" },
  import: { label: "Importación", bd: "var(--green)" },
};

const MESES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Deterministic formatter (no Intl/locale) so SSR and the client render byte
// -identical strings — `toLocaleString` diverges between Node's and the
// browser's ICU, causing hydration mismatches. Bogotá is UTC-5 year-round.
function fmtFecha(iso: string): string {
  const b = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mm = String(b.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${MESES_ABBR[b.getUTCMonth()]} ${hh}:${mm}`;
}

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

type IngredienteOpt = { id: string; name: string; unit: string };

function AjusteDrawer({
  ingredientes,
  onClose,
}: {
  ingredientes: IngredienteOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [ingId, setIngId] = React.useState("");
  const [delta, setDelta] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const save = () => {
    const n = Number(delta);
    if (!ingId) return setError("Elige un ingrediente.");
    if (!Number.isFinite(n) || n === 0) return setError("El ajuste no puede ser 0.");
    setError(null);
    start(async () => {
      const r = await registrarAjuste({ ingrediente_id: ingId, delta: n, note });
      if (r?.error) setError(r.error);
      else {
        onClose();
        router.refresh();
      }
    });
  };

  const inputSt: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "8px 10px",
    border: "1.5px solid var(--ink)",
    outline: "none",
    minHeight: 0,
  };
  const labelSt: React.CSSProperties = {
    display: "block",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(30,25,18,.32)" }} />
      <div
        className="cmd-paper-lt"
        style={{ position: "relative", zIndex: 1, width: 420, maxWidth: "100%", height: "100%", borderLeft: "1.5px solid var(--ink)", display: "flex", flexDirection: "column" }}
      >
        <div className="bg-paper" style={{ padding: "18px 22px 14px", borderBottom: "1.5px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Movimientos · 04
            </div>
            <div className="font-slab" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>
              Ajuste manual
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted" style={{ background: "none", border: "1px solid var(--rule)", fontSize: 12, padding: "4px 9px", cursor: "pointer", minHeight: 0 }}>
            ✕ cerrar
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Ingrediente *</label>
            <select aria-label="Ingrediente" value={ingId} onChange={(e) => setIngId(e.target.value)} style={{ ...inputSt, appearance: "none", cursor: "pointer" }}>
              <option value="">Elige un ingrediente…</option>
              {ingredientes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Δ Cantidad (negativo = merma / salida) *</label>
            <input aria-label="Delta" type="number" step="any" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2.5" style={inputSt} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Nota</label>
            <input aria-label="Nota" value={note} onChange={(e) => setNote(e.target.value)} placeholder="motivo del ajuste" style={inputSt} />
          </div>
          {error ? (
            <div role="alert" style={{ color: "var(--red)", fontSize: 12 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div className="bg-paper" style={{ padding: "14px 22px 18px", borderTop: "1.5px solid var(--ink)", display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} className="cmd-btn ghost" style={{ flex: 1 }} disabled={pending}>
            Cancelar
          </button>
          <button type="button" onClick={save} className="cmd-btn" style={{ flex: 2 }} disabled={pending}>
            {pending ? "Registrando…" : "Registrar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HistorialClient({
  movimientos,
  ingredientes,
}: {
  movimientos: MovimientoRow[];
  ingredientes: IngredienteOpt[];
}) {
  const [filter, setFilter] = React.useState<MovFiltro>("todos");
  const [q, setQ] = React.useState("");
  const [drawer, setDrawer] = React.useState(false);

  const filtered = filterMovimientos(movimientos, { tipo: filter, query: q });

  const exportCsv = () => {
    const csv = movimientosToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "movimientos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {drawer ? <AjusteDrawer ingredientes={ingredientes} onClose={() => setDrawer(false)} /> : null}
      <SectionCrumb
        section="historial"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm" onClick={exportCsv} disabled={filtered.length === 0}>
              Exportar CSV
            </button>
            <button type="button" className="cmd-btn sm" onClick={() => setDrawer(true)} disabled={ingredientes.length === 0}>
              + Ajuste manual
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 16 }}>
          <div className="cmd-paper-lt" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--ink)", minWidth: 240 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar ingrediente o nota…"
              aria-label="Buscar"
              style={{ border: "none", background: "transparent", fontSize: 11, outline: "none", flex: 1, color: "var(--ink)", padding: 0, minHeight: 0 }}
            />
          </div>
          <span style={{ width: 1, height: 22, background: "var(--rule)" }} />
          <Chip active={filter === "todos"} onClick={() => setFilter("todos")}>Todos</Chip>
          <Chip active={filter === "venta"} onClick={() => setFilter("venta")}>Ventas</Chip>
          <Chip active={filter === "gasto"} onClick={() => setFilter("gasto")}>Gastos</Chip>
          <Chip active={filter === "ajuste"} danger onClick={() => setFilter("ajuste")}>Ajustes</Chip>
          <Chip active={filter === "import"} onClick={() => setFilter("import")}>Importaciones</Chip>
        </div>

        <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)" }}>
          <div
            className="bg-paper"
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "8px 14px", borderBottom: "1.5px solid var(--ink)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}
          >
            <span>Fecha · hora</span>
            <span>Ingrediente</span>
            <span>Tipo</span>
            <span style={{ textAlign: "right" }}>Δ</span>
            <span>Usuario · nota</span>
            <span style={{ textAlign: "right" }}>Saldo</span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-muted" style={{ padding: 24, fontSize: 12, textAlign: "center" }}>
              {movimientos.length === 0
                ? "Sin movimientos de inventario todavía."
                : "Ningún movimiento coincide con el filtro."}
            </div>
          ) : (
            filtered.map((m, i) => (
              <div
                key={m.id}
                style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 14px", alignItems: "flex-start", borderBottom: "1px dashed var(--rule-soft)", background: i % 2 ? "var(--paper-lt)" : "var(--paper)" }}
              >
                <div className="cmd-num" style={{ fontSize: 11, color: "var(--ink-2)" }}>{fmtFecha(m.created_at)}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.ingrediente_name}</div>
                <div><TipoBadge tipo={m.type} /></div>
                <div className="cmd-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: m.delta > 0 ? "var(--green)" : "var(--red)" }}>
                  {m.delta > 0 ? "+" : ""}{m.delta}
                </div>
                <div style={{ fontSize: 11 }}>
                  <div style={{ color: "var(--ink-2)" }}>{m.by_name ?? "—"}</div>
                  {m.note ? (
                    <div className="text-muted" style={{ fontStyle: "italic", marginTop: 2 }}>↳ {m.note}</div>
                  ) : null}
                </div>
                <div className="cmd-num text-muted" style={{ textAlign: "right", fontSize: 12 }}>{m.balance_after}</div>
              </div>
            ))
          )}

          <div className="bg-paper text-muted" style={{ padding: "10px 14px", borderTop: "1px dashed var(--rule)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Mostrando {filtered.length} de {movimientos.length} movimientos
          </div>
        </div>
      </div>
    </div>
  );
}
