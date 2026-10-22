"use client";

import * as React from "react";
import type { KardexItem } from "@/lib/db/movements";
import { costoVentaPorDia, kardexToCsv, TIPO_LABEL, type KardexLinea, type KardexTotales, type MovTipo } from "@/lib/movimientos";
import { DIAS_KARDEX, diaCorto, type Periodo } from "@/lib/kardex-periodo";
import { VentasChart } from "./ventas-chart";
import { fmtCop, fmtNum } from "@/lib/kardex-format";

const MESES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Deterministic (no Intl) so SSR and client agree; Bogotá is UTC-5 year-round.
function fmtFecha(iso: string): string {
  const b = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mm = String(b.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${MESES_ABBR[b.getUTCMonth()]} ${hh}:${mm}`;
}

const TIPO_COLOR: Record<MovTipo, string> = {
  venta: "var(--ink)",
  gasto: "var(--amber)",
  ajuste: "var(--red)",
  import: "var(--green)",
  merma: "var(--red)",
};

const GRID = "110px 80px minmax(160px, 1.4fr) 100px 100px 110px 80px 100px minmax(90px, 0.6fr)";

const card: React.CSSProperties = { border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px", minWidth: 150, flex: 1 };
const kicker: React.CSSProperties = { fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" };
const big: React.CSSProperties = { fontSize: 22, lineHeight: 1.1, marginTop: 4, fontFamily: "var(--font-mono)" };
const inputSt: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)", background: "var(--paper)", padding: "6px 8px", border: "1.5px solid var(--ink)", minHeight: 0 };

function Cantidad({ n, item, signo }: { n: number; item: KardexItem; signo?: boolean }) {
  const piezas = item.pieza_qty && item.pieza_qty > 0 && item.pack_label ? n / item.pieza_qty : null;
  return (
    <span className="cmd-num">
      {signo && n > 0 ? "+" : ""}{fmtNum(n)} {item.unit}
      {piezas != null && Math.abs(piezas) >= 1 ? <span className="text-muted" style={{ fontSize: 10 }}> · {fmtNum(piezas, 1)} {item.pack_label}</span> : null}
    </span>
  );
}

export function KardexClient({ item, periodo, lineas, totales, truncado }: { item: KardexItem; periodo: Periodo; lineas: KardexLinea[]; totales: KardexTotales; truncado: boolean }) {
  const [ocultarPruebas, setOcultarPruebas] = React.useState(true);
  const [tipo, setTipo] = React.useState<"todos" | MovTipo>("todos");
  const pruebas = lineas.filter((l) => l.prueba).length;
  const visibles = lineas.filter((l) => (!ocultarPruebas || !l.prueba) && (tipo === "todos" || l.tipo === tipo));
  const valorStock = Math.round(item.stock_current * item.cost_cop);
  const ventasDia = React.useMemo(() => costoVentaPorDia(lineas, periodo.desde, periodo.hasta), [lineas, periodo.desde, periodo.hasta]);

  const exportCsv = () => {
    const csv = kardexToCsv(item, visibles, totales.saldoInicial);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kardex-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${periodo.desde}-${periodo.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "18px 24px 40px", display: "flex", flexDirection: "column", gap: 18, fontFamily: "var(--font-mono)" }}>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <form method="get" className="flex items-center flex-wrap" style={{ gap: 8 }}>
          {DIAS_KARDEX.map((d) => (
            <button key={d} type="submit" name="dias" value={d} className={`cmd-btn sm${periodo.dias === d ? "" : " ghost"}`}>
              {d} días
            </button>
          ))}
          <span style={{ width: 1, height: 22, background: "var(--rule)" }} />
          <label style={{ ...kicker, display: "flex", alignItems: "center", gap: 6 }}>
            Desde <input type="date" name="desde" defaultValue={periodo.desde} aria-label="Desde" style={inputSt} />
          </label>
          <label style={{ ...kicker, display: "flex", alignItems: "center", gap: 6 }}>
            Hasta <input type="date" name="hasta" defaultValue={periodo.hasta} aria-label="Hasta" style={inputSt} />
          </label>
          <button type="submit" className="cmd-btn ghost sm">Ver</button>
        </form>
        <div style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 11 }}>
          {diaCorto(periodo.desde, true)} → {diaCorto(periodo.hasta, true)}
        </span>
        <button type="button" className="cmd-btn ghost sm" onClick={exportCsv} disabled={visibles.length === 0}>
          Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <div style={card}>
          <div style={kicker}>Saldo inicial · {diaCorto(periodo.desde)}</div>
          <div style={big}><Cantidad n={totales.saldoInicial} item={item} /></div>
        </div>
        <div style={card}>
          <div style={kicker}>Entradas</div>
          <div style={{ ...big, color: "var(--green)" }}><Cantidad n={totales.entradas} item={item} signo /></div>
        </div>
        <div style={card}>
          <div style={kicker}>Salidas</div>
          <div style={{ ...big, color: "var(--red)" }}><Cantidad n={-totales.salidas} item={item} /></div>
          <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
            ventas {fmtNum(totales.ventas)} · mermas {fmtNum(totales.mermas)} · ajustes {totales.ajustes > 0 ? "+" : ""}{fmtNum(totales.ajustes)}
          </div>
        </div>
        <div style={card}>
          <div style={kicker}>Saldo final · {diaCorto(periodo.hasta)}</div>
          <div style={big}><Cantidad n={totales.saldoFinal} item={item} /></div>
          {Math.abs(totales.saldoFinal - item.stock_current) > 0.0005 ? (
            <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>hoy: {fmtNum(item.stock_current)} {item.unit}</div>
          ) : null}
        </div>
        <div style={card}>
          <div style={kicker}>Costo unitario · valor hoy</div>
          <div style={big}>${fmtNum(item.cost_cop, 2)}<span className="text-muted" style={{ fontSize: 11 }}>/{item.unit}</span></div>
          <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
            stock al costo {fmtCop(valorStock)}{item.cost_cop === 0 ? " · sin costo cargado" : ""}
          </div>
        </div>
      </div>

      <VentasChart dias={ventasDia} unidad={item.unit} piezaQty={item.pieza_qty} piezaLabel={item.pack_label} />

      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        {(["todos", "venta", "import", "ajuste", "merma", "gasto"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={`cmd-btn sm${tipo === t ? "" : " ghost"}`}>
            {t === "todos" ? "Todos" : TIPO_LABEL[t] + "s"}
          </button>
        ))}
        {pruebas > 0 ? (
          <label className="text-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <input type="checkbox" checked={ocultarPruebas} onChange={(e) => setOcultarPruebas(e.target.checked)} style={{ minHeight: 0 }} />
            ocultar {pruebas} movimiento{pruebas === 1 ? "" : "s"} de prueba
          </label>
        ) : null}
        <div style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 10.5 }}>
          {visibles.length} de {lineas.length} movimientos{totales.sinCosto ? ` · ${totales.sinCosto} sin costo registrado` : ""}{truncado ? " · periodo recortado, acórtalo" : ""}
        </span>
      </div>

      <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)", overflowX: "auto" }}>
        <div className="bg-paper" style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 14px", borderBottom: "1.5px solid var(--ink)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, minWidth: 980 }}>
          <span>Fecha · hora</span>
          <span>Tipo</span>
          <span>Detalle</span>
          <span style={{ textAlign: "right" }}>Entrada</span>
          <span style={{ textAlign: "right" }}>Salida</span>
          <span style={{ textAlign: "right" }}>Saldo</span>
          <span style={{ textAlign: "right" }}>Costo</span>
          <span style={{ textAlign: "right" }}>Valor</span>
          <span>Quién</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 14px", borderBottom: "1px dashed var(--rule)", fontSize: 11, minWidth: 980, color: "var(--ink-2)" }}>
          <span>{diaCorto(periodo.desde)}</span>
          <span />
          <span style={{ fontStyle: "italic" }}>Saldo inicial</span>
          <span /><span />
          <span className="cmd-num" style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(totales.saldoInicial)}</span>
          <span /><span /><span />
        </div>
        {visibles.length === 0 ? (
          <div className="text-muted" style={{ padding: 24, fontSize: 12, textAlign: "center" }}>Sin movimientos en este periodo.</div>
        ) : (
          visibles.map((l, i) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 14px", alignItems: "center", borderBottom: "1px dashed var(--rule-soft)", background: i % 2 ? "var(--paper-lt)" : "var(--paper)", fontSize: 11.5, minWidth: 980, opacity: l.prueba ? 0.6 : 1 }}>
              <span className="cmd-num" style={{ color: "var(--ink-2)" }}>{fmtFecha(l.fecha)}</span>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: TIPO_COLOR[l.tipo], border: `1px solid ${TIPO_COLOR[l.tipo]}`, padding: "2px 5px", justifySelf: "start" }}>{TIPO_LABEL[l.tipo]}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detalle}>{l.detalle}</span>
              <span className="cmd-num" style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>{l.entrada ? `+${fmtNum(l.entrada)}` : ""}</span>
              <span className="cmd-num" style={{ textAlign: "right", color: "var(--red)", fontWeight: 600 }}>{l.salida ? `−${fmtNum(l.salida)}` : ""}</span>
              <span className="cmd-num" style={{ textAlign: "right", fontWeight: 600, color: l.saldo < 0 ? "var(--red)" : "var(--ink)" }}>{fmtNum(l.saldo)}</span>
              <span className="cmd-num text-muted" style={{ textAlign: "right" }}>{l.costo == null ? "—" : fmtNum(l.costo, 2)}</span>
              <span className="cmd-num" style={{ textAlign: "right", color: l.valor < 0 ? "var(--red)" : l.valor > 0 ? "var(--green)" : "var(--muted)" }}>{l.costo == null ? "—" : fmtCop(l.valor)}</span>
              <span className="text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.usuario ?? "—"}</span>
            </div>
          ))
        )}
        <div className="bg-paper" style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 14px", borderTop: "1.5px solid var(--ink)", fontSize: 11.5, fontWeight: 600, minWidth: 980 }}>
          <span /><span />
          <span style={{ letterSpacing: ".12em", textTransform: "uppercase", fontSize: 9.5 }}>Totales del periodo</span>
          <span className="cmd-num" style={{ textAlign: "right", color: "var(--green)" }}>+{fmtNum(totales.entradas)}</span>
          <span className="cmd-num" style={{ textAlign: "right", color: "var(--red)" }}>−{fmtNum(totales.salidas)}</span>
          <span className="cmd-num" style={{ textAlign: "right" }}>{fmtNum(totales.saldoFinal)}</span>
          <span />
          <span className="cmd-num" style={{ textAlign: "right", color: totales.valorMovido < 0 ? "var(--red)" : "var(--green)" }}>{fmtCop(totales.valorMovido)}</span>
          <span />
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, maxWidth: 900 }}>
        El saldo de cada línea es el que dejó el sistema en ese momento. El valor usa el costo que tenía el insumo cuando se movió; los movimientos sin costo registrado (—) no suman al total. Si el saldo final no coincide con lo que hay en la barra, haz un conteo: la diferencia queda como ajuste con su nota.
      </p>
    </div>
  );
}
