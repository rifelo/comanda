import { describe, expect, it } from "vitest";
import { fechaBogota, pesos, renderTicketHtml, TicketDocSchema, type TicketDoc } from "./ticket";

const base: TicketDoc = {
  kind: "recibo",
  folio: "A-1240",
  at: "2026-11-01T03:31:00Z",
  orgName: "Café PA'YO",
  encabezado: "NIT 1.234\nCalle 1 <2>",
  lines: [
    { qty: 2, name: "Cappuccino", mods: ["Grande"], total: 17000, customer: "Ana" },
    { qty: 1, name: "Pan de bono", mods: [], total: 3500, customer: "Luis" },
  ],
  total: 20500,
  method: "Efectivo",
  tendered: 50000,
  change: 29500,
};

describe("formatting", () => {
  it("prints pesos with dots and Bogotá time", () => {
    expect(pesos(20500)).toBe("$20.500");
    expect(pesos(1234567)).toBe("$1.234.567");
    expect(fechaBogota("2026-11-01T03:31:00Z")).toBe("31 oct 2026 · 22:31");
  });
});

describe("renderTicketHtml", () => {
  it("receipt: header escaped, lines with prices, payment and change", () => {
    const html = renderTicketHtml(base);
    expect(html).toContain("Calle 1 &lt;2&gt;");
    expect(html).toContain("Pedido #A-1240");
    expect(html).toContain("$17.000");
    expect(html).toContain("$29.500");
    expect(html).toContain("no es factura electrónica");
    expect(html).toContain("size: 80mm auto");
  });

  it("receipt for a pay-later order says so instead of the payment", () => {
    const html = renderTicketHtml({ ...base, method: undefined, pendiente: true });
    expect(html).toContain("PENDIENTE DE PAGO");
    expect(html).not.toContain("Recibido");
  });

  it("comanda: big folio, tags, lines grouped by person, no prices", () => {
    const html = renderTicketHtml({ ...base, kind: "comanda", seLoLlevamos: true, note: "sin azúcar", barista: "Pipe" });
    expect(html).toContain("#A-1240");
    expect(html).toContain("SE LO LLEVAMOS");
    expect(html).toContain("Pa' Ana");
    expect(html).toContain("Pa' Luis");
    expect(html).toContain("sin azúcar");
    expect(html).toContain("Prepara: Pipe");
    expect(html).not.toContain("$17.000");
  });

  it("relayed payloads are validated", () => {
    expect(TicketDocSchema.safeParse(base).success).toBe(true);
    expect(TicketDocSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
  });
});
