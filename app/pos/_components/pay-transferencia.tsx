"use client";

/**
 * Transferencia.dc.html — /pos/pay/transferencia.
 *
 * The checklist is guidance, not a gate: «Llegó · registrar venta» works
 * from the first tap. «Aún no llega» sends a new ticket as a pending order
 * marked «Transferencia por verificar» (it is prepared all the same); an
 * order that is already stored just goes back.
 */
import * as React from "react";
import { useCatalog, usePos, posStore, cancelTender, savePending, tenderAmount } from "../pos-store";
import { Chk, FlowHeader, SendError, canPay, confirmPayment, money, orderSubtitle } from "./pay-common";

export function TransferenciaPage() {
  const s = usePos();
  const catalog = useCatalog();
  const total = tenderAmount(s);
  const [chk, setChk] = React.useState([false, false, false]);
  const toggle = (i: number) => setChk((c) => c.map((v, k) => (k === i ? !v : v)));
  const ok = canPay(s, total);
  const later = () => {
    if (s.sending) return;
    if (s.pending) cancelTender();
    else void savePending({ porVerificar: true });
  };
  const { transferenciaLlave: llave, transferenciaTitular: titular } = catalog.pago;

  return (
    <>
      <FlowHeader back={cancelTender} backLabel="Volver al pedido" title="Cobrar por transferencia" subtitle={orderSubtitle(s)}>
        <button type="button" className="btn ghost sm flow-alt" onClick={() => posStore.set({ payMethod: "efectivo", sendError: null })}><span className="flow-long">Cambiar a efectivo</span><span className="flow-short">Efectivo</span></button>
      </FlowHeader>

      <div className="body pay-grid">
        <section className="card pay-main pay-poster" aria-labelledby="vt" style={{ background: "var(--brand-soft)", border: "2px solid var(--brand)" }}>
          <span id="vt" className="pay-poster-t">Verifica la transferencia por</span>
          <span className="huge">{money(total)}</span>
          <span className="muted pay-poster-s" style={{ maxWidth: 520 }}>Mira la notificación en el celular de la caja. Confirma solo cuando el monto y la hora coincidan.</span>
          {(llave || titular) && (
            <div className="pay-pills">
              {llave && <span className="pill pay-pill" style={{ background: "var(--surface)" }}>Llave Bre-B: {llave}</span>}
              {titular && <span className="pill pay-pill" style={{ background: "var(--surface)" }}>A nombre de: {titular}</span>}
            </div>
          )}
        </section>

        <section className="pay-side pay-col" aria-label="Verificación">
          <span className="label" style={{ fontSize: 15 }}>Antes de confirmar</span>
          <Chk on={chk[0]} onToggle={() => toggle(0)}>Llegó la notificación</Chk>
          <Chk on={chk[1]} onToggle={() => toggle(1)}>El monto es exactamente {money(total)}</Chk>
          <Chk on={chk[2]} onToggle={() => toggle(2)}>La hora es de ahora, no de otro pedido</Chk>
        </section>

        <div className="pay-act">
          <SendError error={s.sendError} />
          <button className="btn lg block pay-go" type="button" onClick={confirmPayment} disabled={!ok}>{s.sending ? "Registrando…" : "Llegó · registrar venta"}</button>
          <button className="btn ghost lg block" type="button" onClick={later} disabled={s.sending}>Aún no llega · pagar después</button>
          {!s.pending && <span className="muted pay-help">El pedido queda en Pedidos como «Transferencia por verificar» y se prepara igual.</span>}
        </div>
      </div>
    </>
  );
}
