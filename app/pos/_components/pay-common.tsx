"use client";

/**
 * Pieces the full-page flows share (Opciones, Efectivo, Transferencia,
 * Datáfono, Venta registrada): the `.flow` header with its back button and
 * clock, the canvas money format («$ 10.000», with a space), the order
 * subtitle and the confirm that pays the ticket or one person's share.
 */
import * as React from "react";
import { posMoney } from "@/lib/pos/types";
import { posStore, completeSale, paySplit, ticketShares, type PosState } from "../pos-store";

/** Money as the canvas writes it: «$ 10.000». */
export const money = (n: number): string => posMoney(n).replace("$", "$\u00a0");

/** «a, b y c». */
export function listaY(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const bogotaNow = (): string => {
  const d = new Date(Date.now() - 5 * 3_600_000);
  const h = d.getUTCHours();
  return `${h}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function subscribeClock(cb: () => void) {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
}

/** Wall clock (Bogotá) for the header; empty on the server, so SSR and hydration agree. */
export function Clock() {
  const t = React.useSyncExternalStore(subscribeClock, bogotaNow, () => "");
  return <span className="clock" aria-label="Hora">{t}</span>;
}

export function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
  );
}

export function CheckIcon({ size = 18, width = 3 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );
}

/** The `.flow` header every full-page screen opens with. */
export function FlowHeader({ back, backLabel, title, subtitle, children }: {
  back: () => void;
  backLabel: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Links/buttons between the title and the clock. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flow">
      <button type="button" className="icon-btn" onClick={back} aria-label={backLabel}><BackIcon /></button>
      <div className="grow">
        <h1 className="h2 flow-t">{title}</h1>
        {subtitle ? <span className="muted flow-s">{subtitle}</span> : null}
      </div>
      {children}
      <Clock />
    </header>
  );
}

/** «Pedido #0923 · Pa' Juan · Cappuccino, Tinto · prepara Pipe» — only the parts that exist. */
export function orderSubtitle(s: PosState): string {
  const parts: string[] = [];
  if (s.pending?.folio) parts.push(`Pedido #${s.pending.folio}`);
  const target = s.split ? s.splitTarget : null;
  let names: string[];
  if (target?.kind === "share") {
    const share = ticketShares(s).find((sh) => sh.customer === target.customer);
    if (target.customer) parts.push(`Pa' ${target.customer}`);
    names = share?.items.map((i) => i.name) ?? [];
  } else {
    if (target?.kind === "rest") parts.push("el resto");
    else {
      const who = whoOf(s);
      if (who) parts.push(`Pa' ${who}`);
    }
    names = s.order.map((l) => l.name);
  }
  const uniq = [...new Set(names)];
  if (uniq.length) parts.push(uniq.length > 3 ? `${uniq.slice(0, 3).join(", ")} +${uniq.length - 3}` : uniq.join(", "));
  if (s.barista) parts.push(`prepara ${s.barista.name.split(" ")[0]}`);
  return parts.join(" · ");
}

/** Who the order is for: the ticket's name, else its people («Juan y Ana», «4 personas»). */
export function whoOf(s: Pick<PosState, "customerName" | "people">): string {
  const name = s.customerName.trim();
  if (name) return name;
  if (s.people.length > 3) return `${s.people.length} personas`;
  return listaY(s.people);
}

/** Pay what the tender is on: one person's share (split) or the whole ticket. */
export function confirmPayment() {
  const s = posStore.get();
  if (s.sending) return;
  void (s.split && s.splitTarget ? paySplit() : completeSale());
}

/** Whether the confirm can run right now. */
export function canPay(s: PosState, amount: number): boolean {
  if (s.sending || amount <= 0) return false;
  if (s.split) return !!s.splitTarget;
  return s.order.length > 0;
}

/** Checklist row (`.chk`): guidance for the cashier, never a gate. */
export function Chk({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button className="chk" type="button" role="checkbox" aria-checked={on} onClick={onToggle}>
      <span className="box">{on ? <CheckIcon /> : null}</span>
      <span className="grow">{children}</span>
    </button>
  );
}

export function SendError({ error }: { error: string | null }) {
  if (!error) return null;
  return <div role="alert" className="pay-err">{error}</div>;
}
