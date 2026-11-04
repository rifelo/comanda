"use client";

/**
 * «Pago mixto» — /pos/pedidos/<id>/mixto (Claude Design canvas «POS · Pago
 * mixto», MM7SGGv6mUZ2TZbffUvPtU). One order paid with several methods:
 * cash + transfer + datáfono. Each part is an orden_pagos row saved the moment
 * it is added; the server marks the order paid when the parts reach the total
 * and the register moves on to «Venta registrada».
 *
 * Only cash may be more than what is left (the difference is change); a
 * transfer or datáfono part can't pass it.
 */
import * as React from "react";
import { PAY_METHOD_LABEL, type OrderPayment } from "@/lib/pos/types";
import { usePos, ticketTotal, payMixtoPart, quitarPagoMixto, closeMixto, type PayMethod } from "../pos-store";
import { FlowHeader, SendError, money, orderSubtitle } from "./pay-common";
import { useEscape } from "./cancelar";

const MAX = 99_999_999;
const BILLS = [5_000, 10_000, 20_000, 50_000];
const METHODS: PayMethod[] = ["efectivo", "transferencia", "datafono"];

function MethodIcon({ m }: { m: PayMethod }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (m === "efectivo") return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>;
  if (m === "transferencia") return <svg {...common}><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></svg>;
  return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
}

function detalle(p: OrderPayment): string {
  if (p.method === "efectivo") return p.change > 0 && p.tendered ? `Recibió ${money(p.tendered)} · cambio ${money(p.change)}` : "Entra al efectivo de la caja";
  if (p.method === "datafono") return `${p.approvalCode ? `Aprobación ${p.approvalCode} · ` : ""}no entra al efectivo`;
  return "Verificada · no entra al efectivo";
}

export function MixtoPage() {
  const s = usePos();
  const [method, setMethod] = React.useState<PayMethod>("efectivo");
  const [typed, setTyped] = React.useState<number | null>(null);
  const [code, setCode] = React.useState("");
  const [leaving, setLeaving] = React.useState(false);

  const pending = s.pending;
  const total = pending?.total ?? 0;
  const paid = pending?.paid ?? 0;
  const pagos = pending?.pagos ?? [];
  const falta = ticketTotal(s);
  const entered = typed ?? falta;
  const isCash = method === "efectivo";
  const part = Math.min(entered, falta);
  const change = isCash ? Math.max(0, entered - falta) : 0;
  const over = !isCash && entered > falta;
  const busy = s.sending;
  const canAdd = !!pending && falta > 0 && entered > 0 && !over && !busy;

  const leave = () => {
    if (busy) return;
    if (paid > 0) setLeaving(true);
    else closeMixto("metodo");
  };
  useEscape(() => (leaving ? setLeaving(false) : leave()));

  const pick = (m: PayMethod) => { setMethod(m); setTyped(null); };
  const digit = (d: string) => setTyped((cur) => {
    const next = Number(String(cur ?? 0) + d);
    return next > MAX ? cur : next;
  });
  const back1 = () => setTyped((cur) => Math.floor((cur ?? 0) / 10));
  const add = async () => {
    if (!canAdd) return;
    const ok = await payMixtoPart({ method, amount: part, tendered: isCash ? entered : null, approvalCode: method === "datafono" ? code.trim() || null : null });
    if (!ok) return;
    setTyped(null);
    setCode("");
    // After a card or transfer part, the rest is usually cash.
    if (method !== "efectivo") setMethod("efectivo");
  };
  const quitar = (p: OrderPayment) => {
    if (busy) return;
    const extra = p.method === "efectivo" ? " Devuelve ese efectivo al cliente." : p.method === "datafono" ? " Anula el cobro en el datáfono." : " Devuelve la transferencia.";
    if (window.confirm(`¿Quitar el pago de ${money(p.amount)} en ${PAY_METHOD_LABEL[p.method].toLowerCase()}?${extra}`)) void quitarPagoMixto(p.id);
  };

  // The register's keyboard: digits type, Backspace erases one, Enter adds the part.
  const live = React.useRef({ digit, back1, add });
  React.useEffect(() => { live.current = { digit, back1, add }; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); live.current.digit(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); live.current.back1(); }
      else if (e.key === "Enter") { e.preventDefault(); void live.current.add(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!pending) {
    return (
      <>
        <FlowHeader back={() => closeMixto("pedidos")} backLabel="Volver a Pedidos" title="Pago mixto" />
        <div className="empty"><span style={{ fontSize: 17, fontWeight: 600 }}>Cargando el pedido…</span></div>
      </>
    );
  }

  const cierra = part >= falta;
  let hint: string;
  if (over) hint = `No puede pasar de lo que falta (${money(falta)}). Solo el efectivo da cambio.`;
  else if (isCash && change > 0) hint = `Esta parte: ${money(part)} · cambio ${money(change)}`;
  else if (isCash) hint = entered < falta ? `Después faltarán ${money(falta - entered)}` : "Cubre todo lo que falta";
  else if (method === "transferencia") hint = "Agrégala solo cuando llegue la notificación por este monto";
  else hint = "Cobra este monto en el datáfono y espera «Aprobado»";

  let label: string;
  if (busy) label = "Registrando…";
  else if (entered <= 0) label = "Escribe el monto";
  else if (over) label = "Monto mayor a lo que falta";
  else if (method === "datafono") label = `Aprobado · agregar ${money(part)}`;
  else if (method === "transferencia") label = `Llegó · agregar ${money(part)}`;
  else label = `Agregar ${money(part)} en efectivo${change > 0 ? ` · cambio ${money(change)}` : ""}`;
  if (cierra && canAdd) label += " y registrar";

  const quick = isCash
    ? BILLS.map((b) => ({ label: `+ ${money(b)}`, on: () => setTyped((cur) => Math.min(MAX, (cur ?? 0) + b)) }))
    : [
        { label: "Lo que falta", on: () => setTyped(null) },
        { label: "La mitad", on: () => setTyped(Math.max(100, Math.round(falta / 2 / 100) * 100)) },
      ];
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <>
      <FlowHeader back={leave} backLabel="Salir del pago mixto" title="Pago mixto" subtitle={orderSubtitle(s)}>
        {paid === 0 && (
          <button type="button" className="btn ghost sm flow-alt" onClick={() => closeMixto("metodo")} disabled={busy}>
            <span className="flow-long">Un solo método</span><span className="flow-short">Un método</span>
          </button>
        )}
      </FlowHeader>

      <div className="body pay-grid pay-mixto">
        <section className="pay-main pay-col" aria-label="Pagos de este pedido">
          <div className="card pay-amt" style={{ gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span className="label" style={{ fontSize: 16 }}>Total del pedido</span>
              <span style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
            </div>
            <div role="img" aria-label={`Pagado ${money(paid)} de ${money(total)}`} style={{ height: 12, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: 12, width: `${pct}%`, background: "var(--ok)", borderRadius: 6, transition: "width .25s" }} />
            </div>
            <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span>Pagado {money(paid)}</span>
              <span>{pagos.length === 1 ? "1 pago" : `${pagos.length} pagos`}</span>
            </div>
          </div>

          <div className="card" style={{ padding: "6px 22px", gap: 0, flex: "1 1 auto", minHeight: 120, overflowY: "auto" }}>
            {pagos.length === 0 ? (
              <div className="muted" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 20 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Aún no hay pagos</span>
                <span style={{ fontSize: 15, maxWidth: 360 }}>Elige cómo paga la primera parte. Cada parte se guarda apenas la agregas.</span>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {pagos.map((p) => (
                  <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MethodIcon m={p.method} /></span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 18, fontWeight: 700 }}>{PAY_METHOD_LABEL[p.method]}{p.customer ? ` · ${p.customer}` : ""}</span>
                      <span className="muted" style={{ fontSize: 14 }}>{detalle(p)}</span>
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(p.amount)}</span>
                    <button type="button" className="icon-btn" onClick={() => quitar(p)} disabled={busy} aria-label={`Quitar el pago en ${PAY_METHOD_LABEL[p.method].toLowerCase()} de ${money(p.amount)}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", background: "var(--late-soft)", borderColor: "var(--late-soft)", color: "var(--late)", padding: "16px 22px" }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Falta</span>
            <span style={{ fontSize: 40, fontWeight: 800, fontVariantNumeric: "tabular-nums" }} aria-live="polite">{money(falta)}</span>
          </div>
        </section>

        <section className="pay-side pay-col" aria-label="Agregar un pago">
          <div role="group" aria-label="¿Cómo paga esta parte?" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => pick(m)}
                style={{
                  height: 56, borderRadius: 14, fontSize: 16, fontWeight: 700, fontFamily: "inherit", color: "var(--text)", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: method === m ? "var(--brand-soft)" : "var(--surface)",
                  border: method === m ? "2px solid var(--brand)" : "1px solid var(--line)",
                }}
              >
                <MethodIcon m={m} />{PAY_METHOD_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="card" style={{ gap: 2, border: "2px solid var(--brand)", padding: "12px 18px" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{isCash ? "Recibido en efectivo" : `Monto en ${PAY_METHOD_LABEL[method].toLowerCase()}`}</span>
            <span className="mx-amt" aria-live="polite">{money(entered)}</span>
            <span style={{ fontSize: 14, color: over ? "var(--late)" : "var(--muted)", fontWeight: over ? 700 : 400 }}>{hint}</span>
          </div>

          <div className="bills" role="group" aria-label="Montos rápidos" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
            {quick.map((q) => <button key={q.label} type="button" className="bill" style={{ fontSize: 15 }} onClick={q.on}>{q.label}</button>)}
          </div>

          {method === "datafono" && (
            <input
              className="field"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="N.º de aprobación (opcional)"
              aria-label="Número de aprobación del voucher"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
            />
          )}

          <div className="keypad" role="group" aria-label="Dígitos">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} className="key" type="button" onClick={() => digit(d)}>{d}</button>
            ))}
            <button className="key alt" type="button" onClick={() => digit("000")}>000</button>
            <button className="key" type="button" onClick={() => digit("0")}>0</button>
            <button className="key alt" type="button" onClick={back1} aria-label="Borrar un dígito">Borrar</button>
          </div>
        </section>

        <div className="pay-act">
          <SendError error={s.sendError} />
          <button className="btn lg block pay-go" type="button" onClick={() => void add()} disabled={!canAdd}>{label}</button>
          <span className="muted pay-help">Solo la parte en efectivo entra al conteo de la caja.</span>
        </div>
      </div>

      {leaving && (
        <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) setLeaving(false); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="mx-leave" style={{ maxWidth: 520 }}>
            <h2 id="mx-leave" className="h2" style={{ margin: 0 }}>Este pedido ya tiene {money(paid)} pagados</h2>
            <p className="muted" style={{ margin: 0, fontSize: 16 }}>
              {pagos.map((p) => `${PAY_METHOD_LABEL[p.method]} ${money(p.amount)}`).join(" · ")}. Faltan {money(falta)}.
            </p>
            <button type="button" className="btn lg block strong" onClick={() => closeMixto("pedidos")}>Dejarlo pendiente con lo pagado</button>
            <button type="button" className="btn lg block ghost" onClick={() => setLeaving(false)}>Seguir cobrando</button>
            <span className="muted" style={{ fontSize: 14 }}>Queda en Pedidos con lo que falta. Para devolver un pago, quítalo con la × antes de salir.</span>
          </div>
        </div>
      )}
    </>
  );
}
