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
