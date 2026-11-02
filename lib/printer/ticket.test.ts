import { describe, expect, it } from "vitest";
import { fechaBogota, pesos, recetaDe, renderTicketHtml, tieneBebidas, TicketDocSchema, type RecetaLookup, type TicketDoc } from "./ticket";

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

describe("renderTicketHtml → tirillas del canvas", () => {
  const recetas: RecetaLookup = (sku) =>
    sku === "BC-003"
      ? { bebida: true, spec: "taza 8 oz · etiquetas: nombre + bebida", pasos: [{ titulo: "Espresso doble", detalle: "18 g → 36 g" }] }
      : sku === "PA-001"
        ? { bebida: false, pasos: [] }
        : null;
  const conSku: TicketDoc = { ...base, lines: [{ ...base.lines[0], sku: "BC-003" }, { ...base.lines[1], sku: "PA-001" }] };

  it("precuenta: header escaped, Pa' nombre, lines with prices, payment and change", () => {
    const html = renderTicketHtml({ ...base, customer: "Ana" });
    expect(html).toContain("Calle 1 &lt;2&gt;");
    expect(html).toContain("Pedido #A-1240");
    expect(html).toContain(">Ana<");
    expect(html).toContain("2 × $8.500");
    expect(html).toContain("$17.000");
    expect(html).toContain("Subtotal $20.500");
    expect(html).toContain("$29.500");
    expect(html).toContain("Comprobante de venta · no es factura de venta");
    expect(html).toContain("@page { margin: 0; }");
    expect(html).not.toContain("size: 80mm");
  });

  it("precuenta of a pay-later order says so instead of the payment", () => {
    const html = renderTicketHtml({ ...base, method: undefined, pendiente: true });
    expect(html).toContain("PENDIENTE DE PAGO");
    expect(html).toContain("Precuenta · no es factura de venta");
    expect(html).not.toContain("Recibido");
  });

  it("comanda: recipe from the catalog by SKU, food listed without recipe, no prices", () => {
    const html = renderTicketHtml({ ...conSku, kind: "comanda", seLoLlevamos: true, note: "sin azúcar", barista: "Pipe" }, { recetas });
    expect(html).toContain("Comanda de barra");
    expect(html).toContain("Pedido #A-1240");
    expect(html).toContain("SE LO LLEVAMOS");
    expect(html).toContain("Espresso doble</span> · 18 g → 36 g");
    expect(html).toContain("taza 8 oz · etiquetas: nombre + bebida");
    expect(html).toContain("También en el pedido");
    expect(html).toContain("1 × Pan de bono");
    expect(html).toContain("Barista: Pipe");
    expect(html).toContain("sin azúcar");
    expect(html).not.toContain("$17.000");
  });

  it("only orders with a prepared drink get a comanda", () => {
    expect(tieneBebidas(conSku, recetas)).toBe(true);
    expect(tieneBebidas({ lines: [conSku.lines[1]] }, recetas)).toBe(false);
    expect(tieneBebidas(base, recetas)).toBe(false); // no SKU → not a known drink
  });

  it("the catalog recipe: written steps first, ingredient lines otherwise; food has none", () => {
    const drink = { printsLabel: true, spec: ["VASO PET 12 OZ", "2 SHOTS · 18 G"], prep: ["Espresso doble: 18 g → 36 g", "Verter"], recipe: [] };
    expect(recetaDe(drink)).toEqual({
      bebida: true,
      spec: "vaso PET 12 oz · 2 shots · 18 g · etiquetas: nombre + bebida",
      pasos: [{ titulo: "Espresso doble", detalle: "18 g → 36 g" }, { titulo: "Verter" }],
    });
    expect(recetaDe({ ...drink, prep: [], recipe: [{ name: "Leche", qty: 230, unit: "ml", note: null }, { name: "Café", qty: 18.5, unit: "g", note: "molido fino" }] }).pasos)
      .toEqual([{ titulo: "Leche", detalle: "230 ml" }, { titulo: "Café", detalle: "18,5 g, molido fino" }]);
    expect(recetaDe({ ...drink, printsLabel: false })).toEqual({ bebida: false, pasos: [] });
  });

  it("logo on both tirillas; 58 mm shrinks the same layout", () => {
    expect(renderTicketHtml(base, { logo: "data:image/svg+xml;base64,AAA" })).toContain('src="data:image/svg+xml;base64,AAA"');
    expect(renderTicketHtml({ ...conSku, kind: "comanda" }, { logo: "x.svg", recetas })).toContain('src="x.svg"');
    expect(renderTicketHtml(base, { papel: "58" })).toContain("zoom: 0.66");
    expect(renderTicketHtml(base)).not.toContain("zoom");
  });

  it("relayed payloads are validated", () => {
    expect(TicketDocSchema.safeParse(conSku).success).toBe(true);
    expect(TicketDocSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
  });
});
