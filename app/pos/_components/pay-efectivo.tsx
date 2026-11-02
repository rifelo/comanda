"use client";

/**
 * Efectivo.dc.html — /pos/pay/efectivo.
 *
 * The keypad works exactly like the artboard's DCLogic: `received` starts at
 * the total (not typed yet), so a cash sale is tile → Efectivo → «Confirmar
 * exacto». The first digit or bill replaces it; «Exacto» puts the total back.
 * One confirm button reads the state: «Faltan $X» (disabled) · «Confirmar
 * exacto» · «Confirmar · cambio $X».
 */
import * as React from "react";
import { usePos, posStore, cancelTender, tenderAmount } from "../pos-store";
import { FlowHeader, SendError, canPay, confirmPayment, money, orderSubtitle } from "./pay-common";

const MAX = 99_999_999;
const BILLS = [5_000, 10_000, 20_000, 50_000];

export function EfectivoPage() {
  const s = usePos();
  const total = tenderAmount(s);
  // Until something is typed, «received» is the amount itself (a split target can change it).
  const [typedK, setK] = React.useState<{ received: number; typed: boolean }>({ received: 0, typed: false });
  const k = typedK.typed ? typedK : { received: total, typed: false };

  const digit = (d: string) => setK((cur) => {
    const base = cur.typed ? cur.received : 0;
    const next = Number(String(base) + d);
    return next > MAX ? cur : { received: next, typed: true };
  });
  const add = (n: number) => setK((cur) => ({ received: Math.min(MAX, (cur.typed ? cur.received : 0) + n), typed: true }));
  const clear = () => setK({ received: 0, typed: true });
  const exact = () => setK({ received: total, typed: true });
  const back1 = () => setK((cur) => ({ received: Math.floor((cur.typed ? cur.received : 0) / 10), typed: true }));

  const diff = k.received - total;
  const state: "short" | "exact" | "change" = diff < 0 ? "short" : diff === 0 ? "exact" : "change";
  const ok = canPay(s, total) && state !== "short";
  const confirm = () => {
    if (!ok) return;
    posStore.set({ tendered: k.received, sendError: null });
    confirmPayment();
  };

  // The register's keyboard: digits type, Backspace erases one, Enter confirms.
  const live = React.useRef({ digit, back1, confirm });
  React.useEffect(() => { live.current = { digit, back1, confirm }; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); live.current.digit(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); live.current.back1(); }
      else if (e.key === "Enter") { e.preventDefault(); live.current.confirm(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = s.sending
    ? "Registrando…"
    : state === "short"
      ? `Faltan ${money(-diff)}`
      : state === "exact"
        ? "Confirmar exacto"
        : `Confirmar · cambio ${money(diff)}`;

  return (
    <>
      <FlowHeader back={cancelTender} backLabel="Volver al pedido" title="Cobrar en efectivo" subtitle={orderSubtitle(s)}>
        <button type="button" className="btn ghost sm flow-alt" onClick={() => posStore.set({ payMethod: "transferencia", sendError: null })}><span className="flow-long">Cambiar a transferencia</span><span className="flow-short">Transferencia</span></button>
        <button type="button" className="btn ghost sm flow-alt" onClick={() => posStore.set({ payMethod: "datafono", sendError: null })}><span className="flow-long">Datáfono · otro pago</span><span className="flow-short">Datáfono</span></button>
      </FlowHeader>

      <div className="body pay-grid pay-cash">
        <section className="pay-main pay-col" aria-label="Montos">
          <div className="card pay-amt" style={{ gap: 10 }}>
            <span className="label" style={{ fontSize: 16 }}>Total a cobrar</span>
            <span className="huge sm">{money(total)}</span>
          </div>

          <div className="card pay-amt" style={{ gap: 10, border: "2px solid var(--brand)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span className="label" style={{ fontSize: 16, color: "var(--text)" }}>Recibido del cliente</span>
              <button className="btn ghost sm" type="button" onClick={clear} style={{ height: 44 }}>Borrar</button>
            </div>
            <span className="huge sm" aria-live="polite">{money(k.received)}</span>
          </div>

          {state === "short" && (
            <div className="card grow pay-state" style={{ background: "var(--late-soft)", borderColor: "var(--late-soft)", color: "var(--late)" }}>
              <span className="pay-state-t">Faltan</span>
              <span className="huge">{money(-diff)}</span>
              <span className="pay-state-s" style={{ opacity: 0.85 }}>Pide el resto o cambia a transferencia</span>
            </div>
          )}
          {state === "exact" && (
            <div className="card grow pay-state" style={{ background: "var(--ok-soft)", borderColor: "var(--ok-soft)", color: "var(--ok)" }}>
              <span className="pay-state-t">Pago exacto</span>
              <span className="huge">{money(0)}</span>
              <span className="pay-state-s" style={{ opacity: 0.85 }}>Sin cambio que entregar</span>
            </div>
          )}
          {state === "change" && (
            <div className="card grow pay-state" style={{ background: "var(--brand-soft)", borderColor: "var(--brand)" }}>
              <span className="pay-state-t">Cambio a entregar</span>
              <span className="huge">{money(diff)}</span>
              <span className="pay-state-s muted">Recibido − total</span>
            </div>
          )}
        </section>

        <section className="pay-side pay-col" aria-label="Teclado">
          <div className="bills" role="group" aria-label="Billetes rápidos">
            {BILLS.map((b) => (
              <button key={b} className="bill" type="button" onClick={() => add(b)}>+ {money(b)}</button>
            ))}
          </div>
          <div className="keypad" role="group" aria-label="Dígitos">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} className="key" type="button" onClick={() => digit(d)}>{d}</button>
            ))}
            <button className="key alt" type="button" onClick={() => digit("000")}>000</button>
            <button className="key" type="button" onClick={() => digit("0")}>0</button>
            <button className="key alt" type="button" onClick={exact}>Exacto</button>
          </div>
        </section>

        <div className="pay-act">
          <SendError error={s.sendError} />
          <button className="btn lg block pay-go" type="button" onClick={confirm} disabled={!ok}>{label}</button>
        </div>
      </div>
    </>
  );
}
