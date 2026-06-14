"use client";

/**
 * Notificaciones — stock alerts derived from ingrediente stock vs. its reorder
 * threshold (stock_min). Admins set the threshold inline; a threshold of 0
 * disables the low-stock alert for that item.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import type { AlertasView, AlertaRow } from "@/lib/notificaciones";
import type { StockLevel } from "@/lib/cost";
import { SectionCrumb } from "../_components/shared";
import { updateStockMin } from "./actions";

const GRID = "1.6fr 1fr 110px 120px 140px";

const LEVEL_META: Record<StockLevel, { label: string; color: string }> = {
  sin: { label: "Sin stock", color: "var(--red)" },
  bajo: { label: "Bajo", color: "var(--amber)" },
  ok: { label: "OK", color: "var(--green)" },
};

function LevelBadge({ level }: { level: StockLevel }) {
  const m = LEVEL_META[level];
  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${m.color}`,
        color: m.color,
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

function ThresholdInput({ row }: { row: AlertaRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [val, setVal] = React.useState(String(row.stock_min));
  const [error, setError] = React.useState(false);

  // Resync on server change (no effect — render-time prev-prop pattern).
  const [prev, setPrev] = React.useState(row.stock_min);
  if (row.stock_min !== prev) {
    setPrev(row.stock_min);
    setVal(String(row.stock_min));
  }

  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      setVal(String(row.stock_min));
      return;
    }
    if (n === row.stock_min) return;
    setError(false);
    start(async () => {
      const r = await updateStockMin({ ingrediente_id: row.id, stock_min: n });
      if (r?.error) {
        setError(true);
        setVal(String(row.stock_min));
      } else router.refresh();
    });
  };

  return (
    <input
      aria-label={`Umbral ${row.name}`}
      type="number"
      min="0"
      step="any"
      value={val}
      disabled={pending}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{
        width: 90,
        textAlign: "right",
        border: `1px solid ${error ? "var(--red)" : "var(--rule)"}`,
        padding: "4px 8px",
        fontSize: 12,
        color: "var(--ink)",
        background: "var(--paper)",
        minHeight: 0,
        opacity: pending ? 0.5 : 1,
      }}
    />
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="cmd-paper-lt" style={{ border: `1.5px solid ${color}`, padding: 14, flex: 1 }}>
      <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="cmd-num font-slab" style={{ fontSize: 34, lineHeight: 1, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}

export function NotificacionesClient({ view }: { view: AlertasView }) {
  const { rows, counts } = view;
  const [onlyAlerts, setOnlyAlerts] = React.useState(false);
  const shown = onlyAlerts ? rows.filter((r) => r.level !== "ok") : rows;

  return (
    <div>
      <SectionCrumb
        section="notificaciones"
        right={
          <button
            type="button"
            className={onlyAlerts ? "cmd-btn sm" : "cmd-btn ghost sm"}
            onClick={() => setOnlyAlerts((v) => !v)}
          >
            {onlyAlerts ? "● Solo alertas" : "○ Solo alertas"}
          </button>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        <div className="flex" style={{ gap: 14, marginBottom: 18 }}>
          <Kpi label="Sin stock" value={counts.sin} color="var(--red)" />
          <Kpi label="Stock bajo" value={counts.bajo} color="var(--amber)" />
          <Kpi label="En nivel" value={counts.ok} color="var(--green)" />
        </div>

        <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)" }}>
          <div
            className="bg-paper"
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "8px 14px", borderBottom: "1.5px solid var(--ink)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}
          >
            <span>Ingrediente</span>
            <span>Categoría</span>
            <span>Estado</span>
            <span style={{ textAlign: "right" }}>Stock actual</span>
            <span style={{ textAlign: "right" }}>Umbral mínimo</span>
          </div>

          {shown.length === 0 ? (
            <div className="text-muted" style={{ padding: 24, fontSize: 12, textAlign: "center" }}>
              {counts.total === 0
                ? "No hay ingredientes en inventario todavía."
                : "Sin alertas — todo el inventario está en nivel."}
            </div>
          ) : (
            shown.map((r, i) => (
              <div
                key={r.id}
                style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 14px", alignItems: "center", borderBottom: "1px dashed var(--rule-soft)", background: i % 2 ? "var(--paper-lt)" : "var(--paper)" }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{r.category_label ?? "—"}</div>
                <div><LevelBadge level={r.level} /></div>
                <div className="cmd-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                  {r.stock_current} <span className="text-muted" style={{ fontSize: 10, fontWeight: 400 }}>{r.unit}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <ThresholdInput row={r} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="text-muted" style={{ marginTop: 10, fontSize: 10, letterSpacing: "0.06em" }}>
          El umbral mínimo dispara la alerta de stock bajo. Pon 0 para silenciar
          un ingrediente.
        </div>
      </div>
    </div>
  );
}
