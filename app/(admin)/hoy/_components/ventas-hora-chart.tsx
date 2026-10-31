"use client";

import { useState } from "react";
import { posMoney } from "@/lib/pos/types";
import type { HoraDia } from "@/lib/numeros/dia";

const PLOT_H = 168;
const PREVIO = "color-mix(in srgb, var(--muted) 45%, var(--paper-lt))";

/** A round axis step that leaves at most four gridlines above zero. */
function axisStep(max: number): number {
  for (const base of [10_000, 20_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000]) {
    if (max / base <= 4) return base;
  }
  return 10_000_000;
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Sales per hour: the day in ink, the same weekday of the previous week in
 * grey next to it. One series is the point, the other is context, so the
 * legend + position carry identity and every value is also in the tooltip
 * (hover, tap or keyboard focus) and in the table below.
 */
export function VentasHoraChart({
  horas,
  diaLabel,
  previoLabel,
  horaActual,
}: {
  horas: HoraDia[];
  diaLabel: string;
  previoLabel: string;
  /** Hour still running (only when looking at today). */
  horaActual: number | null;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...horas.map((h) => Math.max(h.total, h.previo)));
  const step = axisStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const peak = horas.reduce<HoraDia | null>((best, h) => (h.total > (best?.total ?? 0) ? h : best), null);
  const px = (v: number) => Math.round((v / top) * PLOT_H);
  const cur = active != null ? horas.find((h) => h.hora === active) ?? null : null;

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: 14, fontSize: 11, marginBottom: 10 }}>
        <span className="inline-flex items-center" style={{ gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, background: "var(--ink)", borderRadius: 2 }} />
          {diaLabel}
        </span>
        <span className="inline-flex items-center text-muted" style={{ gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, background: PREVIO, borderRadius: 2 }} />
          {previoLabel}
        </span>
      </div>

      <div className="flex" style={{ gap: 8 }}>
        {/* y axis */}
        <div className="cmd-num text-muted" style={{ position: "relative", width: 62, height: PLOT_H, fontSize: 10, flexShrink: 0 }}>
          {ticks.map((v) => (
            <span key={v} style={{ position: "absolute", right: 0, bottom: px(v) - 6, lineHeight: "12px" }}>
              {posMoney(v)}
            </span>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* plot */}
          <div style={{ position: "relative", height: PLOT_H }} onPointerLeave={() => setActive(null)}>
            {ticks.map((v) => (
              <div
                key={v}
                aria-hidden
                style={{ position: "absolute", left: 0, right: 0, bottom: px(v), borderTop: `1px solid ${v === 0 ? "var(--ink)" : "var(--rule-soft)"}` }}
              />
            ))}
            <div className="flex" style={{ position: "absolute", inset: 0 }}>
              {horas.map((h) => {
                const on = active === h.hora;
                return (
                  <button
                    key={h.hora}
                    type="button"
                    aria-label={`${hh(h.hora)}: ${posMoney(h.total)} en ${h.pedidos} pedidos; ${previoLabel} ${posMoney(h.previo)}`}
                    onPointerEnter={() => setActive(h.hora)}
                    onFocus={() => setActive(h.hora)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(h.hora)}
                    className="flex items-end justify-center"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 0,
                      height: "100%",
                      gap: 2,
                      padding: 0,
                      border: "none",
                      background: on ? "color-mix(in srgb, var(--ink) 7%, transparent)" : "transparent",
                      cursor: "default",
                      position: "relative",
                    }}
                  >
                    <span aria-hidden style={{ width: "32%", maxWidth: 14, height: px(h.previo), background: PREVIO, borderRadius: "3px 3px 0 0" }} />
                    <span
                      aria-hidden
                      style={{
                        width: "42%",
                        maxWidth: 22,
                        height: px(h.total),
                        background: "var(--ink)",
                        opacity: horaActual === h.hora ? 0.6 : 1,
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                    {peak && peak.hora === h.hora && peak.total > 0 && !cur ? (
                      <span
                        className="cmd-num"
                        style={{ position: "absolute", bottom: px(h.total) + 4, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: "var(--ink)" }}
                      >
                        {posMoney(h.total)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          {/* x axis */}
          <div className="flex cmd-num text-muted" style={{ fontSize: 10, marginTop: 5 }}>
            {horas.map((h) => (
              <span key={h.hora} style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: active === h.hora ? 700 : 400, color: active === h.hora ? "var(--ink)" : undefined }}>
                {h.hora}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* readout: the hovered hour, or how to read the chart */}
      <div aria-live="polite" style={{ minHeight: 34, marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--rule)", fontSize: 11.5 }}>
        {cur ? (
          <span>
            <span className="cmd-num text-muted">{hh(cur.hora)}–{hh(cur.hora + 1)}</span>{" "}
            <b className="cmd-num">{posMoney(cur.total)}</b> en {cur.pedidos} pedido{cur.pedidos === 1 ? "" : "s"}
            {horaActual === cur.hora ? " (hora en curso)" : ""}
            <span className="text-muted"> · {previoLabel}: <span className="cmd-num">{posMoney(cur.previo)}</span></span>
          </span>
        ) : (
          <span className="text-muted">
            {peak && peak.total > 0 ? `Mejor hora: ${hh(peak.hora)}–${hh(peak.hora + 1)}. ` : ""}Toca una hora para ver el detalle.
          </span>
        )}
      </div>

      <details style={{ marginTop: 6 }}>
        <summary className="text-muted" style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          Ver tabla
        </summary>
        <table className="cmd-num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, marginTop: 6 }}>
          <thead>
            <tr className="text-muted" style={{ textAlign: "right", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 0" }}>Hora</th>
              <th style={{ fontWeight: 500, padding: "4px 0" }}>Pedidos</th>
              <th style={{ fontWeight: 500, padding: "4px 0" }}>{diaLabel}</th>
              <th style={{ fontWeight: 500, padding: "4px 0" }}>{previoLabel}</th>
            </tr>
          </thead>
          <tbody>
            {horas.map((h) => (
              <tr key={h.hora} style={{ borderTop: "1px solid var(--rule-soft)", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "4px 0" }}>{hh(h.hora)}</td>
                <td style={{ padding: "4px 0" }}>{h.pedidos}</td>
                <td style={{ padding: "4px 0" }}>{posMoney(h.total)}</td>
                <td className="text-muted" style={{ padding: "4px 0" }}>{posMoney(h.previo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
