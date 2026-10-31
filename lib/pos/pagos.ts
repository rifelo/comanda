/**
 * Pure helpers for paying an order in parts (no I/O, unit-tested in
 * pagos.test.ts): what each person at the table owes, how far each share is
 * paid, and the payment-method summary an order carries once it has several
 * payments.
 */
import type { OrderPayment, PayMethodId } from "./types";

export interface ShareItem {
  name: string;
  qty: number;
  unitPrice: number;
}
/** One person's part of the bill (customer null = the unassigned lines, "Mesa"). */
export interface PersonShare {
  customer: string | null;
  label: string;
  items: ShareItem[];
  amount: number;
}

/**
 * Split stored lines by person: roster order first, then names that only
 * exist on lines (line order), then the unassigned lines as "Mesa". People
 * with nothing on the ticket are skipped — there is nothing to charge.
 */
export function splitByPerson(
  items: ReadonlyArray<{ name: string; qty: number; unitPrice: number; customer: string }>,
  people: ReadonlyArray<string>,
): PersonShare[] {
  const order: Array<string | null> = [...people];
  for (const it of items) if (it.customer && !order.includes(it.customer)) order.push(it.customer);
  order.push(null);
  const out: PersonShare[] = [];
  for (const who of order) {
    const mine = items.filter((it) => (it.customer || null) === who);
    if (!mine.length) continue;
    out.push({
      customer: who,
      label: who ?? "Mesa",
      items: mine.map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.unitPrice })),
      amount: mine.reduce((s, it) => s + it.qty * it.unitPrice, 0),
    });
  }
  return out;
}

/** How much of a share its own payments cover, and whether it is settled. */
export function shareStatus(
  share: PersonShare,
  pagos: ReadonlyArray<OrderPayment>,
  orderSettled: boolean,
): { paid: number; done: boolean; last: OrderPayment | null } {
  const mine = pagos.filter((p) => (p.customer || null) === share.customer);
  const paid = mine.reduce((s, p) => s + p.amount, 0);
  return { paid, done: orderSettled || paid >= share.amount, last: mine[mine.length - 1] ?? null };
}

/** The order's method column once it has payments: the one method, or mixto. */
export function summarizeMethod(methods: ReadonlyArray<PayMethodId>): PayMethodId | "mixto" | null {
  const set = [...new Set(methods)];
  if (set.length === 0) return null;
  return set.length === 1 ? set[0] : "mixto";
}

/**
 * Cash shortcuts beside «Exacto» on the cash tender: the next round amount
 * (multiple of $5.000) and the bills a customer usually hands over ($10.000,
 * $20.000, $50.000, $100.000) — only amounts above the total, ascending,
 * at most `max`.
 */
export function cashShortcuts(total: number, max = 4): number[] {
  if (!(total > 0)) return [];
  const out = new Set<number>();
  const round = Math.ceil(total / 5000) * 5000;
  if (round > total) out.add(round);
  for (const bill of [10000, 20000, 50000, 100000]) {
    const up = Math.ceil(total / bill) * bill;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, max);
}

/**
 * The notes a voided order keeps: «Cancelado: <motivo>» first, then what it
 * already had, then the manual-refund warning when part was paid. No reason
 * and nothing paid leaves the notes as they were.
 */
export function cancelNotes(prev: string | null | undefined, motivo: string | null | undefined, paid: number): string | null {
  const parts: string[] = [];
  const m = motivo?.trim();
  if (m) parts.push(`Cancelado: ${m}`);
  const p = prev?.trim();
  if (p) parts.push(p);
  if (paid > 0) parts.push(`Cancelado con $${paid.toLocaleString("es-CO")} ya pagados (reembolso manual)`);
  return parts.length ? parts.join(" · ") : (prev ?? null);
}
