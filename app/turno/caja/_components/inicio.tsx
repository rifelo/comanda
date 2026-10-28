"use client";

import * as React from "react";
import { MOTIVO_CAJA, porConfirmar } from "@/lib/caja/movimientos";
import { IcoAbajo, IcoArriba, IcoCajon, IcoCheck, IcoMas, IcoMenos, IcoMotivo, IcoNube, IcoReloj, IcoAlerta } from "./icons";
import { hora, plata, type MovVista } from "./model";

export interface LineaEstado {
  tone: "ok" | "pend" | "bad" | "mute";
  text: string;
  sub?: string;
  onClick?: () => void;
}

/**
 * Caja's home on the tablet: what the drawer should hold right now (and how
 * it's computed), the state of the turno, «+ Entrada» / «− Salida», the
 * arqueo, and today's movements — each opens its detail.
 */
export function Inicio({ esperado, desglose, estado, arqueo, rows, tz, online, notaBase, onEntrada, onSalida, onOpen }: {
  esperado: number;
  desglose: { baseInicial: number; efectivo: number; pagos: number; ingresos: number; salidas: number; nIngresos: number; nSalidas: number; enEspera: number; desde: string | null };
  estado: LineaEstado[];
  arqueo: { label: string; sub: string; hot: boolean; onClick: () => void };
  rows: MovVista[];
  tz: string;
  online: boolean;
  notaBase: { at: string; text: string } | null;
  onEntrada: () => void;
  onSalida: () => void;
  onOpen: (key: string) => void;
}) {
  const [abierto, setAbierto] = React.useState(true);
  const pendientes = rows.filter((r) => !r.espera && porConfirmar({ motivo: r.motivo, fotoPath: r.tieneFoto ? "x" : null, compraConFactura: r.compraConFactura, anulado: !!r.anuladoAt })).length;
  const vivos = rows.filter((r) => !r.anuladoAt).length;

  return (
    <div className="cj-body">
      <section className="cj-col">
        <div className="cj-card">
          <span className="cj-lab">Debería haber en el cajón</span>
          <span className="cj-slab cj-big">{plata(esperado)}</span>
          <button type="button" className="cj-toggle" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
            {abierto ? <IcoArriba /> : <IcoAbajo />} CÓMO SE CALCULA
          </button>
          {abierto && (
            <div className="cj-desglose">
              <span>Base con la que abrió</span><span>{plata(desglose.baseInicial)}</span>
              <span>+ Ventas en efectivo (POS{desglose.pagos ? ` · ${desglose.pagos}` : ""})</span><span>{plata(desglose.efectivo)}</span>
              <span className="cj-in">+ Entradas ({desglose.nIngresos})</span><span className="cj-in">{plata(desglose.ingresos)}</span>
              <span className="cj-out">− Salidas ({desglose.nSalidas})</span><span className="cj-out">{plata(desglose.salidas)}</span>
            </div>
          )}
          {desglose.enEspera > 0 && <span className="cj-mute" style={{ fontSize: 12 }}>Incluye {desglose.enEspera} movimiento{desglose.enEspera === 1 ? "" : "s"} en espera.{!online ? " Las ventas en efectivo son las últimas que recibió la tablet." : ""}</span>}
        </div>

        <div className="cj-card soft">
          <span className="cj-lab">Estado del turno</span>
          {estado.map((e) => {
            const Ico = e.tone === "ok" ? IcoCheck : e.tone === "bad" ? IcoAlerta : IcoReloj;
            const body = (
              <>
                <Ico size={20} />
                <span>{e.text} {e.sub && <small>· {e.sub}</small>}</span>
              </>
            );
            return e.onClick ? (
              <button key={e.text} type="button" className={`cj-estado ${e.tone}`} style={{ border: "none", background: "transparent", padding: 0, minHeight: 44, textAlign: "left", textDecoration: "underline" }} onClick={e.onClick}>{body}</button>
            ) : (
              <div key={e.text} className={`cj-estado ${e.tone === "mute" ? "" : e.tone}`} style={e.tone === "mute" ? { color: "var(--cj-mute)" } : undefined}>{body}</div>
            );
          })}
        </div>

        <div className="cj-two">
          <button type="button" className="cj-slab cj-mainbtn in" onClick={onEntrada}><IcoMas size={30} w={3} />Entrada</button>
          <button type="button" className="cj-slab cj-mainbtn out" onClick={onSalida}><IcoMenos size={30} w={3} />Salida</button>
        </div>
        <button type="button" className="cj-arqueo" data-hot={arqueo.hot ? "1" : undefined} onClick={arqueo.onClick}>
          <span className="cj-arqueo-l"><IcoCajon /><span className="cj-slab">{arqueo.label}</span></span>
          <small>{arqueo.sub}</small>
        </button>
      </section>

      <section className="cj-col">
        <div className="cj-listhead">
          <h2 className="cj-slab cj-h2">Movimientos de hoy</h2>
          <span className="cj-mute" style={{ fontSize: 12 }}>{vivos} movimiento{vivos === 1 ? "" : "s"}{pendientes ? ` · ${pendientes} por confirmar` : ""}</span>
        </div>
        <div className="cj-list">
          {rows.length === 0 && <div className="cj-empty">Hoy no ha entrado ni salido plata de la caja.<br />Cuando pagues un domicilio, lleves a consignar o agregues sencillo, regístralo aquí con su ¿por qué?.</div>}
          {rows.map((r) => {
            const falta = !r.espera ? porConfirmar({ motivo: r.motivo, fotoPath: r.tieneFoto ? "x" : null, compraConFactura: r.compraConFactura, anulado: !!r.anuladoAt }) : null;
            const tone = r.espera ? "espera" : falta ? "pend" : undefined;
            return (
              <button key={r.key} type="button" className="cj-row" data-tone={tone} data-anulado={r.anuladoAt ? "1" : undefined} onClick={() => onOpen(r.key)}>
                <span className="cj-row-hora">{hora(r.at, tz)}</span>
                <span className="cj-ico"><IcoMotivo motivo={r.motivo} /></span>
                <span className="cj-row-main">
                  <span className="cj-row-t">{MOTIVO_CAJA[r.motivo].label} {r.by && <span>· {r.by.split(" ")[0]}</span>}</span>
                  <span className="cj-row-q">“{r.justificacion}”{r.compraLabel ? ` · ${r.compraLabel}` : ""}</span>
                  {r.espera ? (
                    r.error ? <span className="cj-row-s bad"><IcoAlerta size={14} />No se pudo registrar · tócalo para ver</span> : <span className="cj-row-s espera"><IcoNube size={14} />{online ? "Enviando…" : "Guardado en la tablet · se envía al volver el internet"}</span>
                  ) : r.anuladoAt ? (
                    <span className="cj-row-s bad">Anulado{r.anuladoMotivo ? ` · ${r.anuladoMotivo}` : ""}</span>
                  ) : falta ? (
                    <span className="cj-row-s pend">Por confirmar · {falta}</span>
                  ) : r.tieneFoto && (r.motivo === "consignacion" || r.motivo === "pago_pedido") ? (
                    <span className="cj-row-s ok">{r.motivo === "consignacion" ? "Comprobante subido ✓" : "Factura ✓"}</span>
                  ) : null}
                </span>
                <span className={`cj-slab cj-row-monto ${r.tipo === "ingreso" ? "cj-in" : "cj-out"}`}>{r.tipo === "ingreso" ? "+" : "−"} {plata(r.monto)}</span>
              </button>
            );
          })}
          {notaBase && (
            <div className="cj-note">
              <span style={{ width: 52, fontWeight: 700 }}>{hora(notaBase.at, tz)}</span>
              {notaBase.text}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
