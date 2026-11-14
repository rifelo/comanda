"use client";

/**
 * «Premio Mi Pa'Yo» — over Pedidos, on a saved unpaid order (mig 0086). The
 * customer opens Mi Pa'Yo › Premios on their phone and reads a 4-digit code;
 * the cashier types the @ and the code, picks the reward and the drink, and
 * the drink goes to $0 while the points come off. No owner approval: the
 * points pay for it.
 */
import * as React from "react";
import type { PosOrder } from "@/lib/pos/types";
import { folioTag } from "@/lib/pos/pending";
import { PREMIOS, motivoNoAplica, type Premio } from "@/lib/clientes/premios";
import { canjearPremio, type CanjearPremioResult } from "../actions";
import { posStore, refreshOrdenes, refreshPendientes } from "../pos-store";
import { useEscape } from "./cancelar";
import { IconClose, money, orderName } from "./ordenes";

export function PremioOverlay({ o, onClose }: { o: PosOrder; onClose: () => void }) {
  useEscape(onClose);
  const catalog = posStore.get().catalog;
  const bebidas = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; price: number; printsLabel: boolean; qty: number }>();
    for (const it of o.items) {
      if (it.kind !== "item" || !it.productoId) continue;
      const p = catalog.byId[it.productoId];
      if (!p) continue;
      const cur = seen.get(p.id);
      if (cur) cur.qty += it.qty;
      else seen.set(p.id, { id: p.id, name: p.name, price: p.price, printsLabel: p.printsLabel, qty: it.qty });
    }
    return [...seen.values()].filter((b) => b.printsLabel);
  }, [o.items, catalog]);

  const [premio, setPremio] = React.useState<Premio>(PREMIOS[PREMIOS.length - 1]);
  const [productoId, setProductoId] = React.useState<string | null>(null);
  const [instagram, setInstagram] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<Extract<CanjearPremioResult, { ok: true }> | null>(null);

  const elegida = bebidas.find((b) => b.id === productoId) ?? null;
  const noAplica = elegida ? motivoNoAplica(premio, elegida, elegida.qty) : null;
  const ok = !!elegida && !noAplica && instagram.trim().length > 1 && codigo.replace(/\D/g, "").length === 4;

  const canjear = async () => {
    if (!ok || !productoId) return;
    setBusy(true);
    setError(null);
    const r = await canjearPremio({ ordenId: o.id, productoId, premioId: premio.id, instagram, codigo }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setHecho(r);
    void refreshOrdenes();
    void refreshPendientes();
  };

  if (hecho) {
    return (
      <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="pz" style={{ maxWidth: 560 }}>
          <h2 id="pz" className="h1">Premio canjeado</h2>
          <p style={{ fontSize: 17, margin: 0 }}><b>{hecho.etiqueta}</b> va por la casa.</p>
          <p className="muted" style={{ fontSize: 15, margin: 0 }}>
            El pedido queda en <b>{money(hecho.total)}</b>. A @{instagram.replace(/^@/, "")} le quedan <b>{hecho.quedan}</b> puntos.
          </p>
          <button type="button" className="btn lg" onClick={onClose}>Listo</button>
        </section>
      </div>
    );
  }

  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="pz" style={{ maxWidth: 680, maxHeight: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="grow">
            <h2 id="pz" className="h1">Premio Mi Pa&apos;Yo · {folioTag(o.folio)}</h2>
            <span className="muted" style={{ fontSize: 15 }}>{[orderName(o), money(o.total)].filter(Boolean).join(" · ")} · el cliente te muestra su código</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose /></button>
        </div>

        <div className="seg" role="group" aria-label="Premio">
          {PREMIOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={premio.id === p.id} onClick={() => setPremio(p)}>
              {p.puntos} pts · {p.titulo}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">¿Cuál bebida va por la casa?</span>
          {bebidas.length ? (
            <div className="chips" role="group" aria-label="Bebida">
              {bebidas.map((b) => (
                <button key={b.id} type="button" className="chip reason" aria-pressed={productoId === b.id} onClick={() => setProductoId(b.id)}>
                  {b.qty} × {b.name} · {money(b.price)}
                </button>
              ))}
            </div>
          ) : (
            <span className="muted">Este pedido no tiene bebidas preparadas.</span>
          )}
          {noAplica && <span role="alert" className="ped-alert">{noAplica}</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Instagram</span>
            <input className="field" type="text" autoCapitalize="none" autoCorrect="off" value={instagram} maxLength={80}
              onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" style={{ height: 52, fontSize: 18 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Código de 4 dígitos</span>
            <input className="field" type="text" inputMode="numeric" value={codigo} maxLength={4}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} placeholder="0000" style={{ height: 52, fontSize: 22, letterSpacing: "0.2em" }} />
          </label>
        </div>

        {error && <div role="alert" className="ped-alert">{error}</div>}

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn ghost lg" onClick={onClose} style={{ flex: 1 }}>Volver</button>
          <button type="button" className="btn lg" onClick={() => void canjear()} disabled={!ok || busy} style={{ flex: 1 }}>{busy ? "Canjeando…" : `Canjear ${premio.puntos} puntos`}</button>
        </div>
      </section>
    </div>
  );
}
