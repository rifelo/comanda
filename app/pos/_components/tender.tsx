"use client";

import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { ArrowLeft } from "lucide-react";
import { cashShortcuts, shareStatus } from "@/lib/pos/pagos";
import { useCatalog, usePos, posStore, modLinePrice, LOCAL_ORDER, cancelTender, completeSale, startSplit, stopSplit, pickShare, paySplit, ticketShares, tenderAmount, ticketTotal, PAY_METHODS, type PayMethod } from "../pos-store";
import { bogotaTime } from "@/lib/pos/pending";
import { C, F, H, Overlay } from "./theme";
import { ORDER_TYPES } from "./ticket";
import { methodLabel } from "./ordenes";

// ════════════════════════════════════════════════════════════════
// Tender — choose payment, cash keypad, confirm
// ════════════════════════════════════════════════════════════════
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
  // Cash with nothing typed = «exacto» (completeSale / paySplit charge the total): one tap.
  const canConfirm = !s.sending && s.order.length > 0 && total > 0 && (!split || !!target) && !short;
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

  const hdrBtn: React.CSSProperties = { height: 48, padding: "0 16px", borderRadius: 12, border: `1px solid ${C.rule}`, background: C.paperLt, color: C.ink, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8 };
  const confirmLabel = s.sending
    ? "Registrando…"
    : split
      ? !target
        ? "Elige a quién cobrar"
        : isCash && tendered !== null && !short
          ? `Cobrar a ${targetLabel} · cambio ${posMoney(change)}`
          : isCash
            ? `Cobrar exacto a ${targetLabel} · ${posMoney(total)}`
            : `Cobrar a ${targetLabel} · ${posMoney(total)}`
      : short
        ? `Faltan ${posMoney(total - (tendered ?? 0))}`
        : isCash && tendered !== null
          ? `Confirmar · cambio ${posMoney(change)}`
          : isCash
            ? `Confirmar exacto · ${posMoney(total)}`
            : `Confirmar ${methodLabel(s.payMethod).toLowerCase()} · ${posMoney(total)}`;

  return (
    <Overlay align="fill">
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="pos-hdr">
          <button type="button" onClick={cancelTender} style={hdrBtn}><ArrowLeft size={20} aria-hidden /> Volver</button>
          <span style={{ ...H, fontSize: 22 }}>Cobrar</span>
          <span style={{ fontSize: 13, color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.pending ? <>Pedido <span className="cmd-num" style={{ color: C.ink }}>{s.pending.folio}</span> · </> : null}
            {ORDER_TYPES.find((t) => t.id === s.orderType)?.label}{s.customerName ? ` · ${s.customerName}` : ""}
          </span>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {split ? (
              <button onClick={stopSplit} style={hdrBtn}>Cobrar todo junto</button>
            ) : shares.length >= 2 && s.online && !s.pending?.id.startsWith(LOCAL_ORDER) ? (
              // Paying in parts needs the order on the server.
              <button onClick={() => void startSplit()} disabled={s.sending} style={{ ...hdrBtn, border: `1px solid ${C.rule}` }}>Dividir por persona</button>
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
                  <div style={{ fontSize: 13, color: C.muted }}>Falta por cobrar</div>
                  <div className="cmd-num pos-tender-amt" style={{ ...H, lineHeight: 1.05, color: C.ink, marginTop: 4 }}>{posMoney(remaining)}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>de <span className="cmd-num">{posMoney(s.pending!.total)}</span>{paidSoFar > 0 ? <> · pagado <span className="cmd-num" style={{ color: C.green }}>{posMoney(paidSoFar)}</span></> : null}</div>
                </div>
                <div className="pos-scroll" aria-label="Partes de la cuenta" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {shares.map((sh) => {
                    const st = shareStatus(sh, s.pending?.pagos ?? [], false);
                    const on = target?.kind === "share" && target.customer === sh.customer;
                    return (
                      <button key={sh.label} onClick={() => pickShare({ kind: "share", customer: sh.customer })} disabled={st.done} aria-pressed={on} aria-label={`Cobrar a ${sh.label}`} style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: st.done ? "default" : "pointer", fontFamily: F.mono,
                        border: `1.5px solid ${on ? C.ink : st.done ? C.green : C.rule}`, background: on ? C.ink : C.paper, color: on ? C.paperLt : C.ink, opacity: st.done ? 0.75 : 1,
                        display: "flex", flexDirection: "column", gap: 3,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sh.label}</span>
                          <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{posMoney(sh.amount)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: on ? C.paperLt : C.ink2, opacity: on ? 0.8 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sh.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`).join(" + ")}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: st.done ? C.green : on ? C.paperLt : C.amber }}>
                          {st.done ? `✓ pagado${st.last ? ` · ${methodLabel(st.last.method)} · ${bogotaTime(st.last.createdAt)}` : ""}` : "○ pendiente"}
                        </div>
                      </button>
                    );
                  })}
                  {remaining > 0 && (
                    <button onClick={() => pickShare({ kind: "rest" })} aria-pressed={target?.kind === "rest"} style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: F.mono,
                      border: `1.5px dashed ${target?.kind === "rest" ? C.ink : C.rule}`, background: target?.kind === "rest" ? C.ink : "transparent", color: target?.kind === "rest" ? C.paperLt : C.ink2,
                      display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Cobrar el resto</span>
                      <span className="cmd-num" style={{ fontSize: 14, fontWeight: 700 }}>{posMoney(remaining)}</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="pos-tender-total">
                  <div style={{ fontSize: 13, color: C.muted }}>{charging && paidSoFar > 0 ? "Falta por cobrar" : "Total a cobrar"}</div>
                  <div className="cmd-num pos-tender-amt" style={{ ...H, lineHeight: 1.05, color: C.ink, marginTop: 4 }}>{posMoney(total)}</div>
                  {charging && paidSoFar > 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>de <span className="cmd-num">{posMoney(s.pending!.total)}</span> · pagado <span className="cmd-num" style={{ color: C.green }}>{posMoney(paidSoFar)}</span></div>}
                </div>
                <div className="pos-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 20px" }}>
                  {s.order.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.ruleSoft}`, fontSize: 14 }}>
                      <span style={{ color: C.ink2, minWidth: 0 }}><span className="cmd-num" style={{ color: C.muted }}>{l.qty}×</span> {l.name}{l.customer ? <span style={{ color: C.red, fontSize: 12, marginLeft: 6 }}>{l.customer}</span> : null}</span>
                      <span className="cmd-num" style={{ color: C.ink, flexShrink: 0 }}>{posMoney(modLinePrice(l, catalog) * l.qty)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* tender: method · the confirm (always on top, one tap = exacto) · cash helpers */}
          <div className="pos-scroll pos-tender-pay">
            {split && (
              <div style={{ fontSize: 15, color: target ? C.ink : C.muted, marginBottom: 10 }}>
                {target ? <>Cobrando a <b>{targetLabel}</b> · <span className="cmd-num">{posMoney(total)}</span></> : "Elige a quién cobrar en la lista"}
              </div>
            )}
            <div className="pos-methods" role="group" aria-label="Método de pago">
              {PAY_METHODS.map((m) => {
                const on = s.payMethod === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => setMethod(m.id)} aria-pressed={on} style={{
                    minHeight: 64, borderRadius: 12, cursor: "pointer", textAlign: "left",
                    border: `1px solid ${on ? C.strong : C.rule}`, background: on ? C.strong : C.paperLt, color: on ? C.onStrong : C.ink,
                    display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
                  }}>
                    <span className="pos-method-label" style={{ fontWeight: 700 }}>{m.label}</span>
                    <span className="pos-method-hint" style={{ fontSize: 13, opacity: 0.7 }}>{m.hint}</span>
                  </button>
                );
              })}
            </div>

            {s.sendError && <div role="alert" style={{ marginTop: 12, fontSize: 15, color: C.red, background: C.redSoft, padding: "10px 14px", borderRadius: 12 }}>{s.sendError}</div>}

            <button
              type="button"
              className="pos-paybtn cash"
              onClick={confirm}
              disabled={!canConfirm}
              style={{ marginTop: 16, width: "100%", flexShrink: 0 }}
            >
              {confirmLabel}
            </button>

            {split && !target ? (
              <div style={{ marginTop: 18, padding: "20px", border: `1px dashed ${C.rule}`, borderRadius: 16, color: C.ink2, fontSize: 15, lineHeight: 1.6 }}>
                Toca una persona en la lista para cobrarle su parte, o <b>Cobrar el resto</b> para cerrar la cuenta de una vez.
              </div>
            ) : isCash ? (
              <div className="pos-cash">
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 8 }}>¿Con cuánto paga?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {cashShortcuts(total).map((a) => {
                      const on = tendered === a;
                      return (
                        <button key={a} type="button" onClick={() => setTendered(on ? null : a)} aria-pressed={on} className="cmd-num" style={{
                          height: 48, padding: "0 18px", borderRadius: 999, cursor: "pointer", fontSize: 16, fontWeight: 700,
                          border: `1px solid ${on ? C.strong : C.rule}`, background: on ? C.strong : C.paperLt, color: on ? C.onStrong : C.ink,
                        }}>{posMoney(a)}</button>
                      );
                    })}
                  </div>
                  <div style={{ border: `1px solid ${short ? C.red : C.rule}`, borderRadius: 12, padding: "12px 16px", background: C.paperLt, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 14, color: C.muted }}>Recibido</span>
                    <span className="cmd-num" style={{ ...H, fontSize: 32, color: tendered === null ? C.muted : C.ink }}>{tendered === null ? "Exacto" : posMoney(tendered)}</span>
                  </div>
                  <div style={{ marginTop: 10, borderRadius: 12, padding: "12px 16px", background: tendered === null ? "transparent" : short ? C.redSoft : C.greenSoft, color: tendered === null ? C.muted : short ? C.red : C.green, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, border: tendered === null ? `1px dashed ${C.rule}` : "none" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{short ? "Faltan" : "Cambio"}</span>
                    <span className="cmd-num" style={{ ...H, fontSize: 32 }}>{tendered === null ? "—" : posMoney(Math.abs(change))}</span>
                  </div>
                </div>
                <Keypad onKey={key} />
              </div>
            ) : (
              <div style={{ marginTop: 18, padding: "20px", border: `1px dashed ${C.rule}`, borderRadius: 16, color: C.ink2, fontSize: 15, lineHeight: 1.6 }}>
                {s.payMethod === "tarjeta"
                  ? <>Pasa <b>{posMoney(total)}</b> por el datáfono y confirma cuando apruebe.</>
                  : <>Verifica la transferencia por <b>{posMoney(total)}</b> (Nequi, Daviplata o QR) y confirma.</>}
              </div>
            )}
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
          borderRadius: 12, cursor: "pointer", fontSize: k === "⌫" ? 22 : 24, fontWeight: 700,
          border: `1px solid ${C.rule}`, background: C.paperLt, color: k === "C" ? C.red : C.ink,
        }}>{k}</button>
      ))}
      <button className="pos-key" onClick={() => onKey("000")} style={{ gridColumn: "span 3", height: 48, borderRadius: 10, cursor: "pointer", fontFamily: F.mono, fontSize: 16, fontWeight: 600, border: `1px solid ${C.rule}`, background: C.paperLt, color: C.ink }}>000</button>
    </div>
  );
}
