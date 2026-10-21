"use client";

import * as React from "react";
import Link from "next/link";
import { fmtCOP } from "@/lib/mock/productos";
import { MARGEN_MIN, totalPendientes, type CostosPendientes } from "@/lib/db/costos-pendientes";

const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/**
 * «Costos por revisar»: the reasons a margin on this page can't be trusted
 * yet. Collapsed to one line when everything is clean; the owner expands it
 * to see which ingredient to price, which product to fix.
 */
export function CostosPanel({ c, compact = false }: { c: CostosPendientes; compact?: boolean }) {
  const n = totalPendientes(c);
  const [open, setOpen] = React.useState(!compact && n > 0);
  if (n === 0 && c.sinReceta.length === 0) {
    return (
      <div className="text-muted" style={{ padding: "8px 28px", fontSize: 11, borderBottom: "1px dashed var(--rule)", fontFamily: "var(--font-mono)" }}>
        ✓ Costos al día: ningún insumo sin costo, ningún producto a precio 0 ni bajo {MARGEN_MIN} %, ningún stock negativo.
      </div>
    );
  }
  const parts = [
    c.sinCosto.length ? `${c.sinCosto.length} insumo${c.sinCosto.length === 1 ? "" : "s"} sin costo` : null,
    c.precioCero.length ? `${c.precioCero.length} a precio 0` : null,
    c.bajoMargen.length ? `${c.bajoMargen.length} bajo ${MARGEN_MIN} %` : null,
    c.negativos.length ? `${c.negativos.length} en negativo` : null,
    c.sinReceta.length ? `${c.sinReceta.length} sin receta` : null,
  ].filter(Boolean);
  const col: React.CSSProperties = { flex: "1 1 220px", minWidth: 0 };
  const h: React.CSSProperties = { fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 };
  const li: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, padding: "3px 0", borderBottom: "1px dashed var(--rule-soft)" };
  return (
    <div className="cmd-paper-lt" style={{ borderBottom: "1.5px solid var(--ink)", fontFamily: "var(--font-mono)" }} data-testid="costos-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 28px", background: "none", border: "none", color: "var(--ink)", cursor: "pointer", textAlign: "left", minHeight: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: n ? "var(--red)" : "var(--muted)" }}>⚠ Costos por revisar · {n}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{parts.join(" · ")}</span>
        <span style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 11 }}>{open ? "ocultar ▴" : "ver ▾"}</span>
      </button>
      {open ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "4px 28px 16px" }}>
          {c.sinCosto.length ? (
            <div style={col}>
              <div style={h}>Insumos sin costo (en recetas)</div>
              {c.sinCosto.map((i) => (
                <div key={i.id} style={li}>
                  <Link href={`/inventario/kardex/${i.id}`} style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--rule)" }}>{i.name}</Link>
                  <span className="text-muted">{i.recetas} receta{i.recetas === 1 ? "" : "s"}</span>
                </div>
              ))}
              <div className="text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>Cárgales precio y presentación en <Link href="/inventario" style={{ color: "inherit" }}>Inventario</Link>: sus recetas se recalculan solas.</div>
            </div>
          ) : null}
          {c.bajoMargen.length ? (
            <div style={col}>
              <div style={h}>Bajo {MARGEN_MIN} % de margen</div>
              {c.bajoMargen.map((p) => (
                <div key={p.id} style={li}>
                  <Link href={`/recetas?producto=${p.id}`} style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--rule)" }}>{p.name}</Link>
                  <span className="cmd-num" style={{ color: p.margin_pct < 30 ? "var(--red)" : "var(--amber)", whiteSpace: "nowrap" }}>{p.margin_pct} % · {fmtCOP(p.cost_cop)}/{fmtCOP(p.price_cop)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {c.precioCero.length || c.sinReceta.length ? (
            <div style={col}>
              {c.precioCero.length ? (
                <>
                  <div style={h}>A precio 0 (se venden regalados)</div>
                  {c.precioCero.map((p) => (
                    <div key={p.id} style={li}><span>{p.name}</span><span className="text-muted">{p.sku}</span></div>
                  ))}
                </>
              ) : null}
              {c.sinReceta.length ? (
                <>
                  <div style={{ ...h, marginTop: c.precioCero.length ? 12 : 0 }}>Sin receta (no descuentan inventario)</div>
                  {c.sinReceta.map((p) => (
                    <div key={p.id} style={li}><span>{p.name}</span><span className="text-muted">{p.sku}</span></div>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {c.negativos.length ? (
            <div style={col}>
              <div style={h}>Stock negativo (vendido sin haber entrado)</div>
              {c.negativos.map((i) => (
                <div key={i.id} style={li}>
                  <Link href={`/inventario/kardex/${i.id}`} style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--rule)" }}>{i.name}</Link>
                  <span className="cmd-num" style={{ color: "var(--red)" }}>{fmtQty(i.stock)} {i.unit}</span>
                </div>
              ))}
              <div className="text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>Se corrige con un conteo aprobado en <Link href="/inventario/conteos" style={{ color: "inherit" }}>Conteos del equipo</Link>.</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
