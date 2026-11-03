"use client";

import * as React from "react";
import { totalContado } from "@/lib/caja/arqueo";
import { errorMovimiento, MOTIVO_CAJA, motivosDe, type MotivoCaja } from "@/lib/caja/movimientos";
import type { CajaDenominacion } from "@/lib/types";
import { IcoAlerta } from "./icons";
import { plata } from "./model";
import { FlowBar, FOTO_VACIA, FotoCaptura, Keypad, lineasPiezas, MontoGrande, PiezasPicker, piezasTexto, type FotoValor } from "./parts";
import type { NuevoMovimiento } from "./salida";

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

  // Every entrada can say which bills came in; sencillo always does.
  const [porMonto, setPorMonto] = React.useState(false);
  const sencillo = motivo === "sencillo" || !porMonto;
  const lineas: CajaDenominacion[] = lineasPiezas(piezas);
  const n = sencillo ? totalContado(lineas) : monto ? Number(monto) : 0;
  const detalle = sencillo ? { denominaciones: lineas } : {};
  const error = errorMovimiento({ tipo: "ingreso", monto: n, motivo, justificacion: porque, detalle });

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
              <PiezasPicker piezas={piezas} onChange={setPiezas} verbo="entra" tone="in" />
              {motivo !== "sencillo" && <button type="button" className="cj-btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setPorMonto(true)}>No sé los billetes · escribir el monto</button>}
            </>
          ) : (
            <>
              <MontoGrande label="¿Cuánto entra?" value={monto} tone="in" sub={MOTIVO_CAJA[motivo].hint} />
              <Keypad value={monto} onChange={setMonto} />
              <button type="button" className="cj-btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setPorMonto(false)}>Contar por billetes</button>
            </>
          )}
        </section>

        <aside className="cj-aside">
          <div className="cj-card" style={{ padding: "18px 20px" }}>
            <span className="cj-lab">Total que entra{sencillo ? " · se calcula solo" : ""}</span>
            <span className="cj-slab cj-in cj-total">+ {plata(n)}</span>
            {sencillo && lineas.length > 0 && <span className="cj-mute" style={{ fontSize: 13 }}>{piezasTexto(lineas)}</span>}
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
          <span className="cj-fine">{!n ? (sencillo ? "Cuenta los billetes y monedas que entran." : "Escribe el monto.") : error ? "Escribe el ¿por qué? para registrar." : `Queda firmado como ${actorName}.`}</span>
        </aside>
      </div>
    </>
  );
}

