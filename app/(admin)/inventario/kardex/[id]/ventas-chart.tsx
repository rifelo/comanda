"use client";

import * as React from "react";
import type { VentaDia } from "@/lib/movimientos";
import { diaCorto } from "@/lib/kardex-periodo";

const DIAS_SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** 1234567 → "1.234.567" (es-CO grouping, no Intl so SSR and client agree). */
function miles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function cop(n: number): string {
  return `${n < 0 ? "−" : ""}$${miles(Math.abs(n))}`;
}
function cant(n: number): string {
  const r = Math.round(n * 10) / 10;
  const [i, d] = Math.abs(r).toString().split(".");
  return `${r < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${d ? `,${d}` : ""}`;
}
/** Round the axis top up to a 1/2/5 step so the gridline label reads clean. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

const kicker: React.CSSProperties = { fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" };
const H = 150;

/**
 * Cost of sales per day for one insumo: one bar per Bogotá day, height = what
 * the sold quantity cost at the movement's stamped unit cost. Hover (or tap) a
 * day for its numbers. Single series, so no legend: the heading names it.
 */
export function VentasChart({ dias: todos, unidad, piezaQty, piezaLabel }: { dias: VentaDia[]; unidad: string; piezaQty: number | null; piezaLabel: string | null }) {
  const [hover, setHover] = React.useState<number | null>(null);
  // Start at the first day with a sale: before that there is nothing to draw
  // (POS sales only deduct stock since 16-sep), and empty weeks squeeze the bars.
  const primero = todos.findIndex((d) => d.cantidad !== 0);
  const dias = primero > 0 ? todos.slice(primero) : todos;
  const total = dias.reduce((s, d) => s + d.costo, 0);
  const cantidad = dias.reduce((s, d) => s + d.cantidad, 0);
  const conVenta = dias.filter((d) => d.cantidad > 0).length;
  const sinCosto = dias.reduce((s, d) => s + d.sinCosto, 0);
  const max = niceMax(Math.max(0, ...dias.map((d) => d.costo)));
  const pico = dias.reduce<VentaDia | null>((a, d) => (d.costo > (a?.costo ?? 0) ? d : a), null);
  const h = hover == null ? null : dias[hover];
  const piezas = (n: number) => (piezaQty && piezaQty > 0 && piezaLabel ? ` · ${cant(n / piezaQty)} ${piezaLabel}` : "");
  // About five date labels at most, so they never collide on a phone.
  const paso = dias.length <= 10 ? 1 : Math.ceil(dias.length / 5);

  return (
    <section style={{ border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px 12px" }} aria-label="Costo de venta por día">
      <div className="flex flex-wrap items-end" style={{ gap: "10px 28px", marginBottom: 12 }}>
        <div>
          <div style={kicker}>Costo de venta del periodo</div>
          <div style={{ fontSize: 26, lineHeight: 1.1, marginTop: 4 }} className="cmd-num">{cop(total)}</div>
        </div>
        <div>
          <div style={kicker}>Cantidad vendida</div>
          <div style={{ fontSize: 15, marginTop: 4 }} className="cmd-num">{cant(cantidad)} {unidad}<span className="text-muted" style={{ fontSize: 11 }}>{piezas(cantidad)}</span></div>
        </div>
        <div>
          <div style={kicker}>Promedio por día con venta</div>
          <div style={{ fontSize: 15, marginTop: 4 }} className="cmd-num">{conVenta ? cop(total / conVenta) : "—"}</div>
        </div>
        {pico && pico.costo > 0 ? (
          <div>
            <div style={kicker}>Día más alto</div>
            <div style={{ fontSize: 15, marginTop: 4 }} className="cmd-num">{cop(pico.costo)} <span className="text-muted" style={{ fontSize: 11 }}>{diaCorto(pico.dia)}</span></div>
          </div>
        ) : null}
        <div style={{ flex: 1 }} />
        <div className="text-muted" style={{ fontSize: 10.5, minHeight: 30, textAlign: "right" }} aria-live="polite">
          {h ? (
            <>
              <div style={{ color: "var(--ink)", fontSize: 11.5 }}>{DIAS_SEM[new Date(`${h.dia}T12:00:00Z`).getUTCDay()]} {diaCorto(h.dia, true)}</div>
              <div className="cmd-num">{cop(h.costo)} · {cant(h.cantidad)} {unidad}{piezas(h.cantidad)}{h.sinCosto ? ` · ${h.sinCosto} sin costo` : ""}</div>
            </>
          ) : (
            <span>Pasa el mouse o toca una barra para ver el día</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8 }}>
        <div className="cmd-num text-muted" style={{ height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 9.5, textAlign: "right" }}>
          <span>{cop(max)}</span>
          <span>{cop(max / 2)}</span>
          <span>$0</span>
        </div>
        <div>
          <div style={{ position: "relative", height: H }} onMouseLeave={() => setHover(null)}>
            <div style={{ position: "absolute", inset: 0, borderTop: "1px dashed var(--rule-soft)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px dashed var(--rule-soft)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTop: "1px solid var(--rule)" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch" }}>
              {dias.map((d, i) => {
                const alto = d.costo > 0 ? Math.max(2, (d.costo / max) * H) : 0;
                return (
                  <button
                    key={d.dia}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onClick={() => setHover(i)}
                    aria-label={`${diaCorto(d.dia, true)}: ${cop(d.costo)}, ${cant(d.cantidad)} ${unidad}`}
                    style={{ flex: 1, minWidth: 0, minHeight: 0, padding: "0 1px", background: hover === i ? "var(--paper-dk)" : "transparent", border: 0, display: "flex", alignItems: "flex-end", cursor: "pointer" }}
                  >
                    <span style={{ display: "block", width: "100%", maxWidth: 28, margin: "0 auto", height: alto, background: "var(--amber)", borderRadius: "4px 4px 0 0", opacity: hover == null || hover === i ? 1 : 0.55 }} />
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 4, overflow: "hidden" }} aria-hidden>
            {dias.map((d, i) => (
              <span key={d.dia} className="text-muted" style={{ flex: 1, minWidth: 0, fontSize: 9.5, whiteSpace: "nowrap", overflow: "visible" }}>
                {i % paso === 0 ? diaCorto(d.dia) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
        Lo que costó el insumo que se fue en ventas, al costo que tenía cuando se vendió. Las ventas canceladas o cambiadas se restan.
        {primero > 0 ? ` Sin ventas registradas antes del ${diaCorto(dias[0].dia)}.` : ""}
        {sinCosto ? ` ${sinCosto} venta${sinCosto === 1 ? "" : "s"} sin costo registrado no suman.` : ""}
      </p>
    </section>
  );
}
