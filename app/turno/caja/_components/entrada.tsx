"use client";

import * as React from "react";
import { totalContado } from "@/lib/caja/arqueo";
import { errorMovimiento, MOTIVO_CAJA, motivosDe, type MotivoCaja } from "@/lib/caja/movimientos";
import type { CajaDenominacion } from "@/lib/types";
import { IcoAlerta } from "./icons";
import { plata } from "./model";
import { Contador, FlowBar, FOTO_VACIA, FotoCaptura, Keypad, MontoGrande, type FotoValor } from "./parts";
import type { NuevoMovimiento } from "./salida";

const BILLETES = [50000, 20000, 10000, 5000, 2000];
const MONEDAS = [1000, 500, 200, 100, 50];

/**
 * «+ Nueva entrada». Sencillo is counted piece by piece (it changes what
 * the drawer can give as change, and the total adds itself); the other
 * reasons use the keypad. «¿Por qué?» with quick phrases and an optional
 * photo, then «Registrar entrada».
 */
export function EntradaFlow({ actorName, online, onCancel, onRegistrar }: { actorName: string; online: boolean; onCancel: () => void; onRegistrar: (m: NuevoMovimiento) => void }) {
  const [motivo, setMotivo] = React.useState<MotivoCaja>("sencillo");
  const [piezas, setPiezas] = React.useState<Record<number, number>>({});
  const [monto, setMonto] = React.useState("");
  const [porque, setPorque] = React.useState("");
  const [foto, setFoto] = React.useState<FotoValor>(FOTO_VACIA);

  const sencillo = motivo === "sencillo";
  const lineas: CajaDenominacion[] = [...BILLETES, ...MONEDAS].map((valor) => ({ valor, cantidad: piezas[valor] ?? 0 })).filter((l) => l.cantidad > 0);
  const n = sencillo ? totalContado(lineas) : monto ? Number(monto) : 0;
  const detalle = sencillo ? { denominaciones: lineas } : {};
  const error = errorMovimiento({ tipo: "ingreso", monto: n, motivo, justificacion: porque, detalle });

  const fila = (valor: number) => {
    const c = piezas[valor] ?? 0;
    return (
      <div key={valor} className="cj-den" data-on={c > 0 ? "1" : undefined}>
        <span className="cj-slab cj-den-v">{plata(valor)}</span>
        <Contador value={c} onChange={(v) => setPiezas((p) => ({ ...p, [valor]: v }))} label={`${valor >= 2000 ? "billetes" : "monedas"} de ${plata(valor)}`} editable={false} />
        <span className="cj-den-sub">{c ? plata(c * valor) : "$ 0"}</span>
      </div>
    );
  };

  return (
    <>
      <FlowBar back="Cancelar" onBack={onCancel} title="+ Nueva entrada" tone="in">
        <span className="cj-lab" style={{ marginLeft: "auto" }}>Motivo</span>
        <div className="cj-chips" role="group" aria-label="Motivo">
          {motivosDe("ingreso").map((m) => (
            <button key={m} type="button" aria-pressed={motivo === m} className="cj-chip" style={{ minHeight: 48 }} onClick={() => setMotivo(m)}>{MOTIVO_CAJA[m].label}</button>
          ))}
        </div>
      </FlowBar>
      <div className={`cj-split ${sencillo ? "" : "kp"}`}>
        <section className="cj-col">
          {sencillo ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span className="cj-lab">¿Qué sencillo entra? · cuenta por denominación</span>
                <span className="cj-mute" style={{ fontSize: 12 }}>Esto cambia la base del cajón.</span>
              </div>
              <div className="cj-den-cols">
                <div className="cj-den-col"><span className="cj-lab">Billetes</span>{BILLETES.map(fila)}</div>
                <div className="cj-den-col"><span className="cj-lab">Monedas</span>{MONEDAS.map(fila)}</div>
              </div>
            </>
          ) : (
            <>
              <MontoGrande label="¿Cuánto entra?" value={monto} tone="in" sub={MOTIVO_CAJA[motivo].hint} />
              <Keypad value={monto} onChange={setMonto} />
            </>
          )}
        </section>

        <aside className="cj-aside">
          <div className="cj-card" style={{ padding: "18px 20px" }}>
            <span className="cj-lab">Total que entra{sencillo ? " · se calcula solo" : ""}</span>
            <span className="cj-slab cj-in cj-total">+ {plata(n)}</span>
            {sencillo && lineas.length > 0 && <span className="cj-mute" style={{ fontSize: 13 }}>{lineas.map((l) => `${l.cantidad} × ${plata(l.valor).replace("$ ", "")}`).join(" · ")}</span>}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="cj-lab">¿Por qué? · obligatorio</span>
            <input className="cj-field" value={porque} onChange={(e) => setPorque(e.target.value.slice(0, 300))} aria-label="Por qué entra la plata" placeholder="Cuenta de dónde viene" />
          </label>
          {MOTIVO_CAJA[motivo].frases.length > 0 && (
            <div className="cj-chips">
              {MOTIVO_CAJA[motivo].frases.map((f) => (
                <button key={f} type="button" className="cj-chip" style={{ minHeight: 48, fontSize: 14 }} aria-pressed={porque === f} onClick={() => setPorque(f)}>{f}</button>
              ))}
            </div>
          )}
          <FotoCaptura label={MOTIVO_CAJA[motivo].fotoLabel} value={foto} onChange={setFoto} online={online} />
          {error && n > 0 && porque.trim().length > 0 && <div className="cj-warn red"><IcoAlerta />{error}</div>}
          <div className="cj-grow" />
          <button
            type="button"
            className="cj-btn green big"
            disabled={!!error}
            onClick={() => onRegistrar({ tipo: "ingreso", monto: n, motivo, justificacion: porque.trim(), detalle, compraId: null, compraLabel: null, compraConFactura: false, fotoPath: foto.path, fotoData: foto.path ? null : foto.data })}
          >
            Registrar entrada
          </button>
          <span className="cj-fine">{!n ? (sencillo ? "Cuenta las piezas que entran." : "Escribe el monto.") : error ? "Escribe el ¿por qué? para registrar." : `Queda firmado como ${actorName}.`}</span>
        </aside>
      </div>
    </>
  );
}

