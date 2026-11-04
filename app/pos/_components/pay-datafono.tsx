"use client";

/**
 * Datafono.dc.html — /pos/pay/datafono. Record-only: the POS does not talk
 * to the Bold terminal, it registers that the card was charged (with the
 * optional approval number from the voucher). «Pago mixto» in the header
 * pays part here and the rest another way.
 */
import * as React from "react";
import { useCatalog, usePos, posStore, cancelTender, tenderAmount, startMixto } from "../pos-store";
import { Chk, FlowHeader, SendError, canPay, confirmPayment, money, orderSubtitle } from "./pay-common";

export function DatafonoPage() {
  const s = usePos();
  const catalog = useCatalog();
  const total = tenderAmount(s);
  const [chk, setChk] = React.useState([false, false]);
  const toggle = (i: number) => setChk((c) => c.map((v, k) => (k === i ? !v : v)));
  const ok = canPay(s, total);
  const liquidacion = catalog.pago.datafonoLiquidacion;
  const to = (m: "efectivo" | "transferencia") => posStore.set({ payMethod: m, sendError: null });

  return (
    <>
      <FlowHeader back={cancelTender} backLabel="Volver al pedido" title="Cobrar con datáfono" subtitle={orderSubtitle(s)}>
        <button type="button" className="btn ghost sm flow-alt" onClick={() => to("efectivo")}>Efectivo</button>
        <button type="button" className="btn ghost sm flow-alt" onClick={() => to("transferencia")}>Transferencia</button>
        {!s.split && <button type="button" className="btn ghost sm flow-alt" onClick={() => void startMixto()} disabled={s.sending}><span className="flow-long">Pago mixto</span><span className="flow-short">Mixto</span></button>}
      </FlowHeader>

      <div className="body pay-grid">
        <section className="card pay-main pay-poster" aria-labelledby="dt">
          <span id="dt" className="pay-poster-t">Cobra en el datáfono Bold</span>
          <span className="huge">{money(total)}</span>
          <span className="muted pay-poster-s" style={{ maxWidth: 540 }}>Digita este monto en el datáfono y espera el voucher «Aprobado». El POS no habla con el datáfono: aquí solo se registra que ya cobraste.</span>
          <div className="pay-pills">
            <span className="pill pay-pill">Tarjeta débito / crédito</span>
            {liquidacion && <span className="pill pay-pill">Llega a la cuenta en {liquidacion}</span>}
            <span className="pill pay-pill">No entra en el efectivo de caja</span>
          </div>
        </section>

        <section className="pay-side pay-col" aria-label="Registro del voucher">
          <span className="label" style={{ fontSize: 15 }}>Antes de confirmar</span>
          <Chk on={chk[0]} onToggle={() => toggle(0)}>El datáfono dice «Aprobado»</Chk>
          <Chk on={chk[1]} onToggle={() => toggle(1)}>El voucher dice exactamente {money(total)}</Chk>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
            <span className="label">Número de aprobación del voucher <span style={{ fontWeight: 400 }}>· opcional, sirve para cuadrar con Bold</span></span>
            <input
              className="field"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej.: 048213"
              maxLength={12}
              value={s.approvalCode}
              onChange={(e) => posStore.set({ approvalCode: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
              onKeyDown={(e) => { if (e.key === "Enter" && ok) confirmPayment(); }}
              style={{ fontSize: 24, fontVariantNumeric: "tabular-nums", letterSpacing: "0.06em" }}
            />
          </label>
        </section>

        <div className="pay-act">
          <SendError error={s.sendError} />
          <button className="btn lg block pay-go" type="button" onClick={confirmPayment} disabled={!ok}>{s.sending ? "Registrando…" : "Aprobado · registrar venta"}</button>
          <button className="btn ghost lg block" type="button" onClick={cancelTender} disabled={s.sending}>Rechazado · cobrar de otra forma</button>
          <span className="muted pay-help">Se registra como «Datáfono» y sale aparte en el arqueo y en el cierre del turno.</span>
        </div>
      </div>
    </>
  );
}
