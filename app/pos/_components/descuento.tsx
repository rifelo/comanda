"use client";

/**
 * «Pedir descuento» — over Pedidos, on a saved unpaid order (mig 0085). The
 * cashier picks a special price for one product or a percentage off the whole
 * order, says why, and sends it to the owner by WhatsApp. Nothing changes on
 * the order until the owner approves it; the card shows the request meanwhile.
 */
import * as React from "react";
import type { PosOrder } from "@/lib/pos/types";
import { folioTag } from "@/lib/pos/pending";
import { aplicarDescuentos, lineasDeOrden, mensajeAprobacion, type DescuentoRegla } from "@/lib/pos/descuentos";
import { pedirDescuento, type PedirDescuentoResult } from "../actions";
import { posStore, refreshOrdenes, refreshPendientes } from "../pos-store";
import { useEscape } from "./cancelar";
import { IconClose, money, orderName } from "./ordenes";

const MOTIVOS = ["Pedido grande", "Cliente frecuente", "Cortesía", "Error en el pedido"] as const;
const digits = (v: string) => v.replace(/[^\d]/g, "");

export function DescuentoOverlay({ o, onClose }: { o: PosOrder; onClose: () => void }) {
  useEscape(onClose);
  const catalog = posStore.get().catalog;
  const productos = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; price: number; qty: number }>();
    for (const it of o.items) {
      if (it.kind !== "item" || !it.productoId) continue;
      const p = catalog.byId[it.productoId];
      if (!p) continue;
      const cur = seen.get(p.id);
      if (cur) cur.qty += it.qty;
      else seen.set(p.id, { id: p.id, name: p.name, price: p.price, qty: it.qty });
    }
    return [...seen.values()];
  }, [o.items, catalog]);

  const [tipo, setTipo] = React.useState<"precio" | "porcentaje">("precio");
  const [productoId, setProductoId] = React.useState<string | null>(productos.length === 1 ? productos[0].id : null);
  const [valor, setValor] = React.useState("");
  const [motivo, setMotivo] = React.useState<string | null>(null);
  const [detalle, setDetalle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<Extract<PedirDescuentoResult, { ok: true }> | null>(null);

  const n = Number(digits(valor) || "NaN");
  const regla: DescuentoRegla | null =
    tipo === "precio"
      ? productoId && Number.isFinite(n) ? { tipo: "precio", productoId, precio: n } : null
      : Number.isFinite(n) && n > 0 && n <= 100 ? { tipo: "porcentaje", porcentaje: n } : null;
  const aprobado = (o.descuentos ?? []).some((d) => d.estado === "aprobado");
  const preview = regla && !aprobado ? aplicarDescuentos(lineasDeOrden(catalog, o.items), [regla]).total : null;
  const motivoTxt = [motivo, detalle.trim()].filter(Boolean).join(": ");
  const ok = !!regla && motivoTxt.length >= 3 && (preview === null || preview < o.total);

  const enviar = async () => {
    if (!regla || !ok) return;
    setBusy(true);
    setError(null);
    const r = await pedirDescuento({ ...regla, ordenId: o.id, motivo: motivoTxt }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setHecho(r);
    void refreshOrdenes();
    void refreshPendientes();
  };

  if (hecho) {
    const link = `${window.location.origin}/descuentos/${hecho.id}`;
    const texto = mensajeAprobacion({ folio: hecho.folio, etiqueta: hecho.etiqueta, antes: hecho.antes, despues: hecho.despues, motivo: motivoTxt, pide: hecho.pide, link });
    const wa = hecho.whatsapp ? `https://wa.me/${hecho.whatsapp}?text=${encodeURIComponent(texto)}` : null;
    return (
      <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="dx" style={{ maxWidth: 560 }}>
          <h2 id="dx" className="h1">Solicitud lista</h2>
          <p style={{ fontSize: 16, margin: 0 }}>
            <b>{hecho.etiqueta}</b> · {money(hecho.antes)} → <b>{money(hecho.despues)}</b>
          </p>
          <p className="muted" style={{ fontSize: 15, margin: 0 }}>
            Mientras el dueño no lo apruebe, el pedido sigue con el precio normal. Cuando lo apruebe, el total cambia solo en esta pantalla.
          </p>
          {wa ? (
            <a className="btn lg" href={wa} target="_blank" rel="noreferrer" onClick={() => window.setTimeout(onClose, 300)}>Enviar al dueño por WhatsApp</a>
          ) : (
            <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: "14px 18px", fontSize: 15 }}>
              No hay un WhatsApp de aprobaciones en Ajustes › Sede. Avísale al dueño: lo ve en Comanda › Descuentos.
              <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => void navigator.clipboard?.writeText(texto)}>Copiar mensaje</button>
            </div>
          )}
          <button type="button" className="btn ghost lg" onClick={onClose}>Listo</button>
        </section>
      </div>
    );
  }

  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="dx" style={{ maxWidth: 680, maxHeight: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="grow">
            <h2 id="dx" className="h1">Pedir descuento · {folioTag(o.folio)}</h2>
            <span className="muted" style={{ fontSize: 15 }}>{[orderName(o), money(o.total)].filter(Boolean).join(" · ")} · lo aprueba el dueño</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose /></button>
        </div>

        <div className="seg" role="group" aria-label="Tipo de descuento">
          <button type="button" aria-pressed={tipo === "precio"} onClick={() => { setTipo("precio"); setValor(""); }}>Precio especial</button>
          <button type="button" aria-pressed={tipo === "porcentaje"} onClick={() => { setTipo("porcentaje"); setValor(""); }}>% a todo el pedido</button>
        </div>

        {tipo === "precio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label">¿Qué producto?</span>
            <div className="chips" role="group" aria-label="Producto">
              {productos.map((p) => (
                <button key={p.id} type="button" className="chip reason" aria-pressed={productoId === p.id} onClick={() => setProductoId(p.id)}>
                  {p.qty} × {p.name} · {money(p.price)}
                </button>
              ))}
            </div>
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">{tipo === "precio" ? "Nuevo precio por unidad" : "Porcentaje de descuento"}</span>
          <input className="field" type="text" inputMode="numeric" value={valor} maxLength={tipo === "precio" ? 9 : 3}
            onChange={(e) => setValor(digits(e.target.value))} placeholder={tipo === "precio" ? "2000" : "10"} style={{ height: 52, fontSize: 20 }} />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">¿Por qué?</span>
          <div className="chips" role="group" aria-label="Motivo">
            {MOTIVOS.map((m) => (
              <button key={m} type="button" className="chip reason" aria-pressed={motivo === m} onClick={() => setMotivo(motivo === m ? null : m)}>{m}</button>
            ))}
          </div>
          <input className="field" type="text" value={detalle} maxLength={140} onChange={(e) => setDetalle(e.target.value)} placeholder="Detalle: ej. grupo de 20, negociado con el dueño" style={{ height: 48 }} />
        </div>

        {preview !== null && (
          <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: "14px 18px", fontSize: 17, display: "flex", justifyContent: "space-between" }}>
            <span>Total</span>
            <span>{money(o.total)} → <b>{money(preview)}</b></span>
          </div>
        )}
        {error && <div role="alert" className="ped-alert">{error}</div>}

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn ghost lg" onClick={onClose} style={{ flex: 1 }}>Volver</button>
          <button type="button" className="btn lg" onClick={() => void enviar()} disabled={!ok || busy} style={{ flex: 1 }}>{busy ? "Enviando…" : "Pedir aprobación"}</button>
        </div>
      </section>
    </div>
  );
}
