"use client";

/**
 * Movimientos — filterable audit log of stock changes, backed by
 * `ingrediente_movements`. Filtering/search is client-side over the fetched
 * page; "Exportar CSV" downloads the current view; stock fixes go
 * through «Corregir» in /inventario (classified by reason).
 */
import * as React from "react";
import {
  filterMovimientos,
  movimientosToCsv,
  type MovimientoRow,
  type MovFiltro,
  type MovTipo,
} from "@/lib/movimientos";
import Link from "next/link";
import { DIAS_KARDEX, diaCorto, type Periodo } from "@/lib/kardex-periodo";
import { PageHeader } from "@/components/ui/top-bar";
import { Chip } from "../../_components/chip";

const GRID = "150px 1.4fr 130px 90px 1fr 90px";

const TIPO_META: Record<MovTipo, { label: string; bd: string }> = {
  venta: { label: "Venta", bd: "var(--ink)" },
  gasto: { label: "Gasto", bd: "var(--amber)" },
  ajuste: { label: "Ajuste", bd: "var(--red)" },
  import: { label: "Importación", bd: "var(--green)" },
  merma: { label: "Merma", bd: "var(--red)" },
  preparacion: { label: "Preparación", bd: "var(--blue, var(--ink))" },
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

export function HistorialClient({
  movimientos,
  ingredientes,
  ingredienteId,
  periodo,
  limit,
}: {
  movimientos: MovimientoRow[];
  ingredientes: IngredienteOpt[];
  /** Server-side filters already applied to `movimientos` (from the URL). */
  ingredienteId: string | null;
  periodo: Periodo | null;
  limit: number;
}) {
  const [filter, setFilter] = React.useState<MovFiltro>("todos");
  const [q, setQ] = React.useState("");

  const filtered = filterMovimientos(movimientos, { tipo: filter, query: q });
  const acotado = Boolean(ingredienteId || periodo);
  const itemActual = ingredienteId ? ingredientes.find((i) => i.id === ingredienteId) ?? null : null;

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
      <PageHeader
        title="Movimientos"
        className="border-b border-line"
        actions={
          <>
            <button type="button" className="cmd-btn ghost sm" onClick={exportCsv} disabled={filtered.length === 0}>
              Exportar CSV
            </button>
            {/* Stock fixes go through «Corregir» so each one is classified (conteo, merma, compra, receta). */}
            <Link href="/inventario" className="cmd-btn sm" style={{ textDecoration: "none" }}>
              Corregir stock
            </Link>
          </>
        }
      />

      <div className="px-4 sm:px-7 py-5">
        {/* Server-side filters: a plain GET form (router.push with only a changed query no-ops on this Next). */}
        <form method="get" className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
          <select name="ingrediente" defaultValue={ingredienteId ?? ""} aria-label="Ítem" style={{ fontSize: 16, color: "var(--text)", background: "var(--surface)", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, minHeight: 44, maxWidth: "100%" }}>
            <option value="">Todos los ítems</option>
            {ingredientes.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
            ))}
          </select>
          {DIAS_KARDEX.map((d) => (
            <button key={d} type="submit" name="dias" value={d} className={`cmd-btn sm${periodo?.dias === d ? "" : " ghost"}`}>{d} días</button>
          ))}
          <input type="date" name="desde" defaultValue={periodo?.desde ?? ""} aria-label="Desde" style={{ fontSize: 16, color: "var(--text)", background: "var(--surface)", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, minHeight: 44 }} />
          <input type="date" name="hasta" defaultValue={periodo?.hasta ?? ""} aria-label="Hasta" style={{ fontSize: 16, color: "var(--text)", background: "var(--surface)", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, minHeight: 44 }} />
          <button type="submit" className="cmd-btn ghost sm">Ver</button>
          {acotado ? (
            <Link href="/inventario/movimientos" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Quitar filtros</Link>
          ) : null}
          {itemActual ? (
            <Link href={`/inventario/${itemActual.id}${periodo ? `?desde=${periodo.desde}&hasta=${periodo.hasta}` : ""}`} className="cmd-btn sm" style={{ textDecoration: "none" }}>
              Kardex de {itemActual.name} →
            </Link>
          ) : null}
          {periodo ? (
            <span className="text-muted" style={{ fontSize: 11 }}>{diaCorto(periodo.desde, true)} → {diaCorto(periodo.hasta, true)}</span>
          ) : null}
        </form>
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
          <Chip active={filter === "merma"} danger onClick={() => setFilter("merma")}>Mermas</Chip>
        </div>

        <div className="bg-surface border border-line rounded-card" style={{ overflowX: "auto" }}>
          <div
            className="bg-paper"
            style={{ display: "grid", gridTemplateColumns: GRID, minWidth: 760, gap: 12, padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}
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
                style={{ display: "grid", gridTemplateColumns: GRID, minWidth: 760, gap: 12, padding: "10px 14px", alignItems: "flex-start", borderBottom: "1px dashed var(--rule-soft)", background: i % 2 ? "var(--paper-lt)" : "var(--paper)" }}
              >
                <div className="cmd-num" style={{ fontSize: 11, color: "var(--ink-2)" }}>{fmtFecha(m.created_at)}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {m.ingrediente_id ? (
                    <Link href={`/inventario/${m.ingrediente_id}`} title="Ver kardex" style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--rule)" }}>
                      {m.ingrediente_name}
                    </Link>
                  ) : (
                    m.ingrediente_name
                  )}
                </div>
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
            Mostrando {filtered.length} de {movimientos.length} movimientos{movimientos.length >= limit ? ` · solo los ${limit} más recientes: acota el periodo o el ítem` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
