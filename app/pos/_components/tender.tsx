"use client";

import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { shareStatus } from "@/lib/pos/pagos";
import { useCatalog, usePos, posStore, modLinePrice, LOCAL_ORDER, cancelTender, completeSale, startSplit, stopSplit, pickShare, paySplit, ticketShares, tenderAmount, ticketTotal, PAY_METHODS, type PayMethod } from "../pos-store";
import { bogotaTime } from "@/lib/pos/pending";
import { C, F, Overlay } from "./theme";
import { ORDER_TYPES } from "./ticket";
import { methodLabel } from "./ordenes";

// ════════════════════════════════════════════════════════════════
// Tender — choose payment, cash keypad, confirm
// ════════════════════════════════════════════════════════════════
/** Handy cash amounts above the total: exact + round bills (COP). */
export function quickAmounts(total: number): number[] {
  const steps = [5000, 10000, 20000, 50000, 100000]; // Colombian bills
  const out = new Set<number>([total]);
  for (const st of steps) {
    const up = Math.ceil(total / st) * st;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 6);
}

export function TenderScreen() {
  const s = usePos();
  const catalog = useCatalog();
  const charging = s.pending?.mode === "charge";
  const split = s.split && charging;
  const shares = ticketShares(s);
  const paidSoFar = charging ? s.pending!.paid : 0;
  const remaining = ticketTotal(s);
  const total = tenderAmount(s);
  const target = s.splitTarget;
  const targetShare = split && target?.kind === "share" ? shares.find((sh) => sh.customer === target.customer) ?? null : null;
  const targetLabel = !split || !target ? null : target.kind === "rest" ? "el resto" : targetShare?.label ?? "";
  const isCash = s.payMethod === "efectivo";
  const tendered = s.tendered;
  const change = tendered !== null ? tendered - total : 0;
  const short = isCash && tendered !== null && tendered < total;
  const canConfirm = !s.sending && s.order.length > 0 && total > 0 && (!split || !!target) && (!isCash || (tendered !== null && tendered >= total));
  const confirm = () => { if (canConfirm) void (split ? paySplit() : completeSale()); };

  const setMethod = (m: PayMethod) => posStore.set({ payMethod: m, sendError: null });
  const setTendered = (n: number | null) => posStore.set({ tendered: n, sendError: null });
  const key = (k: string) => {
    const cur = tendered ?? 0;
    if (k === "⌫") return setTendered(cur >= 10 ? Math.floor(cur / 10) : null);
    if (k === "C") return setTendered(null);
    const next = Number(String(cur) + k);
    if (next <= 99_999_999) setTendered(next);
  };

  // Enter confirms, digits type into the keypad.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canConfirm) confirm();
      else if (isCash && /^[0-9]$/.test(e.key)) key(e.key);
      else if (isCash && e.key === "Backspace") key("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hdrBtn: React.CSSProperties = { height: 40, padding: "0 14px", borderRadius: 3, border: `1.5px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
  const confirmLabel = s.sending
    ? "Registrando…"
    : split
      ? !target
        ? "Elige a quién cobrar"
        : isCash && tendered !== null && !short
          ? `Cobrar a ${targetLabel} · cambio ${posMoney(change)}`
          : `Cobrar a ${targetLabel} · ${posMoney(total)}`
      : isCash && tendered !== null && !short
        ? `Confirmar · cambio ${posMoney(change)}`
        : `Confirmar cobro · ${posMoney(total)}`;

  return (
    <Overlay align="fill">
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="pos-hdr">
          <button onClick={cancelTender} style={hdrBtn}>← Volver</button>
          <span style={{ fontFamily: F.slab, fontSize: 22 }}>Cobrar<span style={{ color: C.red }}>.</span></span>
          <span style={{ fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.pending ? <>Pedido <span className="cmd-num" style={{ color: C.ink }}>{s.pending.folio}</span> · </> : null}
            {ORDER_TYPES.find((t) => t.id === s.orderType)?.label}{s.customerName ? ` · ${s.customerName}` : ""}
          </span>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {split ? (
              <button onClick={stopSplit} style={hdrBtn}>Cobrar todo junto</button>
            ) : shares.length >= 2 && s.online && !s.pending?.id.startsWith(LOCAL_ORDER) ? (
              // Paying in parts needs the order on the server.
              <button onClick={() => void startSplit()} disabled={s.sending} style={{ ...hdrBtn, border: `1.5px solid ${C.ink}` }}>Dividir por persona</button>
            ) : null}
          </div>
        </div>

        {/* Side by side; stacked on a narrow screen (POS_CSS). */}
        <div className="pos-tender-body">
          {/* summary */}
          <div className="pos-tender-sum">
            {split ? (
              <>
                <div className="pos-tender-total">
                  <div style={{ fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase" }}>Falta por cobrar</div>
                  <div className="cmd-num pos-tender-amt" style={{ fontFamily: F.slab, lineHeight: 1.05, color: C.ink, marginTop: 4 }}>{posMoney(remaining)}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>de <span className="cmd-num">{posMoney(s.pending!.total)}</span>{paidSoFar > 0 ? <> · pagado <span className="cmd-num" style={{ color: C.green }}>{posMoney(paidSoFar)}</span></> : null}</div>
                </div>
                <div className="pos-scroll" aria-label="Partes de la cuenta" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {shares.map((sh) => {
                    const st = shareStatus(sh, s.pending?.pagos ?? [], false);
                    const on = target?.kind === "share" && target.customer === sh.customer;
                    return (
                      <button key={sh.label} onClick={() => pickShare({ kind: "share", customer: sh.customer })} disabled={st.done} aria-pressed={on} aria-label={`Cobrar a ${sh.label}`} style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 6, cursor: st.done ? "default" : "pointer", fontFamily: F.mono,
                        border: `1.5px solid ${on ? C.ink : st.done ? C.green : C.rule}`, background: on ? C.ink : C.paper, color: on ? C.paperLt : C.ink, opacity: st.done ? 0.75 : 1,
                        display: "flex", flexDirection: "column", gap: 3,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sh.label}</span>
                          <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{posMoney(sh.amount)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: on ? C.paperLt : C.ink2, opacity: on ? 0.8 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sh.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`).join(" + ")}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: st.done ? C.green : on ? C.paperLt : C.amber }}>
                          {st.done ? `✓ pagado${st.last ? ` · ${methodLabel(st.last.method)} · ${bogotaTime(st.last.createdAt)}` : ""}` : "○ pendiente"}
                        </div>
                      </button>
                    );
                  })}
                  {remaining > 0 && (
                    <button onClick={() => pickShare({ kind: "rest" })} aria-pressed={target?.kind === "rest"} style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: 6, cursor: "pointer", fontFamily: F.mono,
                      border: `1.5px dashed ${target?.kind === "rest" ? C.ink : C.rule}`, background: target?.kind === "rest" ? C.ink : "transparent", color: target?.kind === "rest" ? C.paperLt : C.ink2,
                      display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline",
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Cobrar el resto</span>
                      <span className="cmd-num" style={{ fontSize: 14, fontWeight: 700 }}>{posMoney(remaining)}</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="pos-tender-total">
                  <div style={{ fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase" }}>{charging && paidSoFar > 0 ? "Falta por cobrar" : "Total a cobrar"}</div>
                  <div className="cmd-num pos-tender-amt" style={{ fontFamily: F.slab, lineHeight: 1.05, color: C.ink, marginTop: 4 }}>{posMoney(total)}</div>
                  {charging && paidSoFar > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>de <span className="cmd-num">{posMoney(s.pending!.total)}</span> · pagado <span className="cmd-num" style={{ color: C.green }}>{posMoney(paidSoFar)}</span></div>}
                </div>
                <div className="pos-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 20px" }}>
                  {s.order.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${C.ruleSoft}`, fontSize: 12.5 }}>
                      <span style={{ color: C.ink2, minWidth: 0 }}><span className="cmd-num" style={{ color: C.muted }}>{l.qty}×</span> {l.name}{l.customer ? <span style={{ color: C.red, fontSize: 10, marginLeft: 6 }}>{l.customer}</span> : null}</span>
                      <span className="cmd-num" style={{ color: C.ink, flexShrink: 0 }}>{posMoney(modLinePrice(l, catalog) * l.qty)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* tender */}
          <div className="pos-scroll pos-tender-pay">
            {split && (
              <div style={{ fontSize: 11, letterSpacing: ".14em", color: target ? C.ink : C.muted, textTransform: "uppercase", marginBottom: 10 }}>
                {target ? <>Cobrando a <b>{targetLabel}</b> · <span className="cmd-num">{posMoney(total)}</span></> : "Elige a quién cobrar en la lista"}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {PAY_METHODS.map((m) => {
                const on = s.payMethod === m.id;
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)} aria-pressed={on} style={{
                    height: 72, borderRadius: 6, cursor: "pointer", textAlign: "left", padding: "0 16px",
                    border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paperLt, color: on ? C.paperLt : C.ink,
                    display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, fontFamily: F.mono,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{m.label}</span>
                    <span style={{ fontSize: 10.5, opacity: 0.7 }}>{m.hint}</span>
                  </button>
                );
              })}
            </div>

            {split && !target ? (
              <div style={{ marginTop: 22, padding: "22px 20px", border: `1px dashed ${C.rule}`, borderRadius: 6, color: C.ink2, fontSize: 13, lineHeight: 1.6 }}>
                Toca una persona en la lista de la izquierda para cobrarle su parte, o <b>Cobrar el resto</b> para cerrar la cuenta de una vez.
              </div>
            ) : isCash ? (
              <div className="pos-cash">
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Recibido</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {quickAmounts(total).map((a, i) => {
                      const on = tendered === a;
                      return (
                        <button key={a} onClick={() => setTendered(a)} style={{
                          height: 44, padding: "0 14px", borderRadius: 22, cursor: "pointer", fontFamily: F.mono, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paperLt, color: on ? C.paperLt : C.ink,
                        }}>{i === 0 ? `Exacto · ${posMoney(a)}` : posMoney(a)}</button>
                      );
                    })}
                  </div>
                  <div style={{ border: `1.5px solid ${short ? C.red : C.ink}`, borderRadius: 6, padding: "12px 16px", background: C.paperLt, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 11, letterSpacing: ".12em", color: C.muted, textTransform: "uppercase" }}>Efectivo</span>
                    <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34, color: tendered === null ? C.muted : C.ink }}>{tendered === null ? "—" : posMoney(tendered)}</span>
                  </div>
                  <div style={{ marginTop: 10, borderRadius: 6, padding: "12px 16px", background: tendered === null ? "transparent" : short ? C.red : C.green, color: tendered === null ? C.muted : C.paperLt, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, border: tendered === null ? `1px dashed ${C.rule}` : "none" }}>
                    <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>{short ? "Faltan" : "Cambio"}</span>
                    <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 34 }}>{tendered === null ? "—" : posMoney(Math.abs(change))}</span>
                  </div>
                </div>
                <Keypad onKey={key} />
              </div>
            ) : (
              <div style={{ marginTop: 22, padding: "22px 20px", border: `1px dashed ${C.rule}`, borderRadius: 6, color: C.ink2, fontSize: 13, lineHeight: 1.6 }}>
                {s.payMethod === "tarjeta"
                  ? <>Pasa <b>{posMoney(total)}</b> por el datáfono y confirma cuando apruebe.</>
                  : <>Verifica la transferencia por <b>{posMoney(total)}</b> (Nequi, Daviplata o QR) y confirma.</>}
              </div>
            )}

            {s.sendError && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: C.red, border: `1px solid ${C.red}`, padding: "8px 10px", borderRadius: 4 }}>{s.sendError}</div>}

            <button
              className="cmd-btn red"
              onClick={confirm}
              disabled={!canConfirm}
              style={{ marginTop: 16, height: 64, fontSize: 16, fontWeight: 600, letterSpacing: ".06em", opacity: canConfirm ? 1 : 0.4, cursor: canConfirm ? "pointer" : "not-allowed", flexShrink: 0 }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
  return (
    <div className="pos-keypad" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, alignContent: "start" }}>
      {keys.map((k) => (
        <button key={k} className="pos-key" onClick={() => onKey(k)} aria-label={k === "⌫" ? "Borrar" : k === "C" ? "Limpiar" : k} style={{
          borderRadius: 6, cursor: "pointer", fontFamily: F.mono, fontSize: k === "⌫" ? 20 : 22, fontWeight: 600,
          border: `1.5px solid ${C.rule}`, background: C.paperLt, color: k === "C" ? C.red : C.ink,
        }}>{k}</button>
      ))}
      <button className="pos-key" onClick={() => onKey("000")} style={{ gridColumn: "span 3", height: 48, borderRadius: 6, cursor: "pointer", fontFamily: F.mono, fontSize: 16, fontWeight: 600, border: `1.5px solid ${C.rule}`, background: C.paperLt, color: C.ink }}>000</button>
    </div>
  );
}
