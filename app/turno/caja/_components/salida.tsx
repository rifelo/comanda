"use client";

import * as React from "react";
import { errorMovimiento, MOTIVO_CAJA, motivosDe, PLATAFORMAS_DOMICILIO, sugerirCero, type DetalleMovimiento, type MotivoCaja } from "@/lib/caja/movimientos";
import type { CompraPorPagar } from "@/lib/caja/movimientos-db";
import { IcoAlerta, IcoCamara, IcoMotivo, IcoSigue } from "./icons";
import { compraLabel, plata, type MovPendiente } from "./model";
import { FlowBar, FOTO_VACIA, FotoCaptura, Keypad, MontoGrande, type FotoValor, type StepState } from "./parts";

export type NuevoMovimiento = Omit<MovPendiente, "clientRef" | "at" | "by">;

const ATAJOS = [5000, 10000, 20000, 50000];

/**
 * «− Nueva salida» in three steps: what the money is for, how much (on the
 * on-screen keypad, plus what each reason needs: platform and order of a
 * delivery, who takes the cash to the bank, the order being paid), and the
 * «¿por qué?» with its photo before «Registrar salida».
 */
export function SalidaFlow({ disponible, porPagar, actorName, online, onCancel, onRegistrar }: {
  disponible: number;
  porPagar: CompraPorPagar[];
  actorName: string;
  online: boolean;
  onCancel: () => void;
  onRegistrar: (m: NuevoMovimiento) => void;
}) {
  const [paso, setPaso] = React.useState<1 | 2 | 3>(1);
  const [motivo, setMotivo] = React.useState<MotivoCaja | null>(null);
  const [monto, setMonto] = React.useState("");
  const [detalle, setDetalle] = React.useState<DetalleMovimiento>({});
  const [compra, setCompra] = React.useState<CompraPorPagar | null>(null);
  const [porque, setPorque] = React.useState("");
  const [foto, setFoto] = React.useState<FotoValor>(FOTO_VACIA);

  const n = monto ? Number(monto) : 0;
  const steps = (p: number): Array<{ label: string; s: StepState }> =>
    ["Motivo", "Monto", "¿Por qué?"].map((label, i) => ({ label, s: i + 1 < p ? "done" : i + 1 === p ? "on" : "todo" }));
  const chip = motivo ? (
    <><IcoMotivo motivo={motivo} size={18} />{MOTIVO_CAJA[motivo].label}{compra ? ` · ${compra.proveedor ?? `pedido n.º ${compra.folio}`}` : ""}</>
  ) : null;

  if (paso === 1 || !motivo) {
    return (
      <>
        <FlowBar back="Cancelar" onBack={onCancel} title="− Nueva salida" tone="out" steps={steps(1)} />
        <div className="cj-flow">
          <span className="cj-lab">¿Para qué sale la plata?</span>
          <div className="cj-motivos">
            {motivosDe("salida").map((m) => (
              <button
                key={m}
                type="button"
                className="cj-motivo"
                data-otro={m === "otro" ? "1" : undefined}
                onClick={() => {
                  setMotivo(m);
                  if (m === "consignacion" && !detalle.quien) setDetalle((d) => ({ ...d, quien: actorName.split(" ")[0] }));
                  if (m !== "pago_pedido") setCompra(null);
                  setPaso(2);
                }}
              >
                <IcoMotivo motivo={m} size={40} w={1.8} />
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <b className="cj-slab">{MOTIVO_CAJA[m].label}</b>
                  <small>{MOTIVO_CAJA[m].hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  const regla = MOTIVO_CAJA[motivo].foto;
  const compraConFactura = !!compra?.conFactura;
  const error = errorMovimiento({ tipo: "salida", monto: n, motivo, justificacion: porque, detalle, foto: !!(foto.path || foto.data), compraConFactura });
  const cero = sugerirCero(n, disponible);
  const excede = n > disponible;

  if (paso === 2) {
    const sigueError = !n ? "Escribe el monto." : motivo === "consignacion" && !detalle.quien?.trim() ? "Escribe quién la lleva." : null;
    return (
      <>
        <FlowBar back="Atrás" onBack={() => setPaso(1)} title="− Nueva salida" tone="out" pick={chip} steps={steps(2)} />
        <div className="cj-split kp">
          <section className="cj-col">
            <MontoGrande label="¿Cuánto sale?" value={monto} tone="out" sub={`En el cajón debería haber ${plata(disponible)}`} />
            <span className="cj-lab">Atajos</span>
            <div className="cj-four">
              {ATAJOS.map((v) => (
                <button key={v} type="button" className="cj-btn" onClick={() => setMonto(String(v))}>{plata(v)}</button>
              ))}
            </div>

            {motivo === "domicilio" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="cj-lab">Opcional · plataforma u orden</span>
                <div className="cj-chips">
                  {PLATAFORMAS_DOMICILIO.map((p) => (
                    <button key={p} type="button" className="cj-chip" aria-pressed={detalle.plataforma === p} onClick={() => setDetalle((d) => ({ ...d, plataforma: d.plataforma === p ? undefined : p }))}>{p}</button>
                  ))}
                  <label className="cj-inline" style={{ flex: "1 1 200px" }}>
                    <span className="cj-lab" style={{ whiteSpace: "nowrap" }}>N.º orden</span>
                    <input value={detalle.orden ?? ""} onChange={(e) => setDetalle((d) => ({ ...d, orden: e.target.value.slice(0, 40) }))} aria-label="Número de orden" inputMode="numeric" />
                  </label>
                </div>
              </div>
            )}

            {motivo === "consignacion" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="cj-lab">¿Quién la lleva al banco? · obligatorio</span>
                <input className="cj-field sm" value={detalle.quien ?? ""} onChange={(e) => setDetalle((d) => ({ ...d, quien: e.target.value.slice(0, 80) }))} aria-label="Quién lleva la plata" />
              </label>
            )}

            {motivo === "pago_pedido" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="cj-lab">¿Qué pedido se paga?</span>
                <div className="cj-pedidos">
                  {porPagar.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="cj-pedido"
                      aria-pressed={compra?.id === c.id}
                      onClick={() => {
                        const on = compra?.id === c.id;
                        setCompra(on ? null : c);
                        if (!on && c.total && !monto) setMonto(String(c.total));
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b>{compraLabel(c.folio, c.proveedor)}</b>
                        <br />
                        <small>{c.conFactura ? "factura ya en el pedido ✓" : "sin foto de factura"}</small>
                      </span>
                      {c.total != null && <span className="cj-slab">{plata(c.total)}</span>}
                    </button>
                  ))}
                  <button type="button" className="cj-pedido" aria-pressed={!compra} onClick={() => setCompra(null)}>
                    <span style={{ flex: 1 }}><b>Sin pedido en el sistema</b><br /><small>Lo explicas en el ¿por qué? y tomas la foto de la factura.</small></span>
                  </button>
                </div>
              </div>
            )}

            <div className="cj-grow" />
            {sigueError && n > 0 && <span className="cj-warn amber"><IcoAlerta size={20} />{sigueError}</span>}
            <button type="button" className="cj-btn dark tall" disabled={!!sigueError} onClick={() => setPaso(3)}>Siguiente: ¿por qué? <IcoSigue /></button>
          </section>
          <Keypad value={monto} onChange={setMonto} />
        </div>
      </>
    );
  }

  const fotoLabel = MOTIVO_CAJA[motivo].fotoLabel;
  return (
    <>
      <FlowBar back="Atrás" onBack={() => setPaso(2)} title="− Nueva salida" tone="out" pick={chip} steps={steps(3)} />
      <div className="cj-split">
        <section className="cj-col">
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="cj-lab">¿Por qué? · obligatorio</span>
            <input className="cj-field" value={porque} onChange={(e) => setPorque(e.target.value.slice(0, 300))} aria-label="Por qué sale la plata" placeholder="Cuenta de qué es esta plata" />
          </label>
          {MOTIVO_CAJA[motivo].frases.length > 0 && (
            <>
              <span className="cj-lab">Frases rápidas</span>
              <div className="cj-chips">
                {MOTIVO_CAJA[motivo].frases.map((f) => (
                  <button key={f} type="button" className="cj-chip" aria-pressed={porque === f} onClick={() => setPorque(f)}>{f}</button>
                ))}
              </div>
            </>
          )}

          {compraConFactura ? (
            <div className="cj-warn green"><IcoCamara size={20} />La factura ya está en el pedido (se tomó al recibirlo). Puedes agregar otra foto si quieres.</div>
          ) : null}
          <FotoCaptura
            label={fotoLabel}
            obligatoria={regla === "obligatoria" && !compraConFactura}
            value={foto}
            onChange={setFoto}
            online={online}
            hint={regla === "obligatoria" && !compraConFactura ? "Sin foto todavía. Para pagos a proveedor no se puede registrar sin la factura." : regla === "confirma" ? "Sin comprobante todavía: queda por confirmar hasta que subas la foto." : "Sin foto todavía."}
          />

          {motivo === "pago_pedido" && (
            <div className="cj-inline" style={{ fontSize: 13 }}>
              <span className="cj-lab">Pedido</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{compra ? compraLabel(compra.folio, compra.proveedor) : "Sin pedido en el sistema"}</span>
              <button type="button" className="cj-btn xs" onClick={() => setPaso(2)}>Cambiar</button>
            </div>
          )}
        </section>

        <aside className="cj-aside">
          <div className="cj-card" style={{ padding: "18px 20px" }}>
            <span className="cj-lab">Resumen</span>
            <span className="cj-slab cj-out" style={{ fontSize: 44, lineHeight: 1 }}>− {plata(n)}</span>
            <div className="cj-resumen">
              <span className="cj-lab">Motivo</span><span>{MOTIVO_CAJA[motivo].label}</span>
              {detalle.plataforma || detalle.orden ? <><span className="cj-lab">Domicilio</span><span>{[detalle.plataforma, detalle.orden && `orden ${detalle.orden}`].filter(Boolean).join(" · ")}</span></> : null}
              {detalle.quien ? <><span className="cj-lab">La lleva</span><span>{detalle.quien}</span></> : null}
              <span className="cj-lab">Quién</span><span>{actorName}</span>
              <span className="cj-lab">Queda</span><span style={{ fontWeight: 700, color: excede ? "var(--red)" : undefined }}>{plata(disponible)} → {excede ? `− ${plata(n - disponible)}` : plata(disponible - n)}</span>
            </div>
          </div>
          {excede && <div className="cj-warn red"><IcoAlerta />El monto supera lo que debería haber en el cajón ({plata(disponible)}).</div>}
          {cero !== null && (
            <div className="cj-warn amber"><IcoAlerta /><span>¿Un cero de más? <button type="button" onClick={() => setMonto(String(cero))}>Corregir a {plata(cero)}</button></span></div>
          )}
          {error && porque.trim().length > 0 && <div className="cj-warn red"><IcoAlerta />{error}</div>}
          {regla === "confirma" && !foto.path && !foto.data && <div className="cj-warn amber"><IcoCamara size={20} />Quedará por confirmar hasta subir el comprobante.</div>}
          <div className="cj-grow" />
          <button
            type="button"
            className="cj-btn red big"
            disabled={!!error}
            onClick={() =>
              onRegistrar({
                tipo: "salida",
                monto: n,
                motivo,
                justificacion: porque.trim(),
                detalle: limpiar(detalle, motivo),
                compraId: motivo === "pago_pedido" ? compra?.id ?? null : null,
                compraLabel: motivo === "pago_pedido" && compra ? compraLabel(compra.folio, compra.proveedor) : null,
                compraConFactura: motivo === "pago_pedido" && compraConFactura,
                fotoPath: foto.path,
                fotoData: foto.path ? null : foto.data,
              })
            }
          >
            Registrar salida
          </button>
          <span className="cj-fine">{error ? (porque.trim() ? error : "Escribe el ¿por qué? para registrar.") : `Queda firmado como ${actorName}.`}</span>
        </aside>
      </div>
    </>
  );
}

/** Only what belongs to the reason travels in `detalle`. */
function limpiar(d: DetalleMovimiento, motivo: MotivoCaja): DetalleMovimiento {
  if (motivo === "domicilio") return { ...(d.plataforma ? { plataforma: d.plataforma } : {}), ...(d.orden?.trim() ? { orden: d.orden.trim() } : {}) };
  if (motivo === "consignacion") return { quien: d.quien?.trim() };
  return {};
}
