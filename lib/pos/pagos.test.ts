import { describe, expect, it } from "vitest";
import { shareStatus, splitByPerson, summarizeMethod, type PersonShare } from "./pagos";
import type { OrderPayment } from "./types";

const it_ = (name: string, qty: number, unitPrice: number, customer = "") => ({ name, qty, unitPrice, customer });

describe("splitByPerson", () => {
  it("groups lines by person in roster order, then line-only names, then Mesa", () => {
    const shares = splitByPerson(
      [it_("Torta", 1, 7000), it_("Latte", 1, 8000, "Zoe"), it_("Tinto", 2, 3000, "Juan"), it_("Latte", 1, 8000, "María")],
      ["María", "Juan"],
    );
    expect(shares.map((s) => `${s.label}:${s.amount}`)).toEqual(["María:8000", "Juan:6000", "Zoe:8000", "Mesa:7000"]);
    expect(shares[3].customer).toBeNull();
  });
  it("skips people with nothing on the ticket and omits Mesa when nothing is unassigned", () => {
    const shares = splitByPerson([it_("Latte", 1, 8000, "Ana")], ["Ana", "Pedro"]);
    expect(shares.map((s) => s.label)).toEqual(["Ana"]);
  });
  it("keeps the items of each share", () => {
    const [s] = splitByPerson([it_("Latte", 2, 8000, "Ana"), it_("Torta", 1, 7000, "Ana")], ["Ana"]);
    expect(s.items).toEqual([{ name: "Latte", qty: 2, unitPrice: 8000 }, { name: "Torta", qty: 1, unitPrice: 7000 }]);
    expect(s.amount).toBe(23000);
  });
});

describe("shareStatus", () => {
  const share: PersonShare = { customer: "Ana", label: "Ana", items: [], amount: 8000 };
  const pago = (customer: string | null, amount: number): OrderPayment =>
    ({ id: "p", customer, method: "efectivo", amount, tendered: null, change: 0, createdAt: "2026-09-19T10:00:00Z" });
  it("counts only the share's own payments", () => {
    expect(shareStatus(share, [pago("Ana", 8000), pago("Juan", 5000)], false)).toMatchObject({ paid: 8000, done: true });
    expect(shareStatus(share, [pago("Juan", 8000)], false)).toMatchObject({ paid: 0, done: false, last: null });
  });
  it("is settled when the whole order is, whatever was paid under its name", () => {
    expect(shareStatus(share, [], true).done).toBe(true);
  });
  it("matches Mesa with payments that carry no person", () => {
    const mesa: PersonShare = { customer: null, label: "Mesa", items: [], amount: 7000 };
    expect(shareStatus(mesa, [pago(null, 7000)], false).done).toBe(true);
  });
});

describe("summarizeMethod", () => {
  it("returns the single method, mixto for several, null for none", () => {
    expect(summarizeMethod(["efectivo", "efectivo"])).toBe("efectivo");
    expect(summarizeMethod(["efectivo", "transferencia"])).toBe("mixto");
    expect(summarizeMethod([])).toBeNull();
  });
});
