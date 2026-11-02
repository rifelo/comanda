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
      ? { bebida: true, proporciones: [{ cantidad: "18 g", nombre: "Café Okana", nota: "Espresso doble" }], envase: "Vaso 12 oz doble pared", pasos: [] }
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
    expect(html).toContain("PAGADO · EFECTIVO");
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
    expect(html).toContain("#A-1240");
    expect(html).toContain("SE LO LLEVAMOS");
    expect(html).toContain(">18 g</td>");
    expect(html).toContain("Vaso 12 oz doble pared");
    expect(html).toContain("También en el pedido");
    expect(html).toContain("1× Pan de bono");
    expect(html).toContain("Prepara: <span class=\"b\">Pipe");
    expect(html).toContain("sin azúcar");
    expect(html).not.toContain("$17.000");
  });

  it("only orders with a prepared drink get a comanda", () => {
    expect(tieneBebidas(conSku, recetas)).toBe(true);
    expect(tieneBebidas({ lines: [conSku.lines[1]] }, recetas)).toBe(false);
    expect(tieneBebidas(base, recetas)).toBe(false); // no SKU → not a known drink
  });

  it("the catalog recipe: amounts in order, container apart, label stickers out; food has none", () => {
    const drink = {
      printsLabel: true,
      prep: ["Pon 100 g de hielo"],
      recipe: [
        { name: "Hielo", qty: 100, unit: "g", note: "Primero, en el vaso" },
        { name: "Cafe Okana", qty: 18, unit: "g", note: "Espresso doble" },
        { name: "Leche entera Gran Vía (bolsa 900 ml)", qty: 150, unit: "ml", note: null },
        { name: "Pulpa de mora (bolsa 125 g)", qty: 1, unit: "und", note: null },
        { name: "Jarabe", qty: 12.5, unit: "ml", note: null },
        { name: "vaso darnel pet x 12Oz", qty: 1, unit: "und", note: null },
        { name: "Tapa domo Darnel 12 oz", qty: 1, unit: "und", note: null },
        { name: "Etiqueta térmica Niimbot 30×50 (rollo 230)", qty: 4, unit: "etiqueta", note: "Nombre, QR" },
      ],
    };
    expect(recetaDe(drink)).toEqual({
      bebida: true,
      proporciones: [
        { cantidad: "100 g", nombre: "Hielo", nota: "Primero, en el vaso" },
        { cantidad: "18 g", nombre: "Café Okana", nota: "Espresso doble" },
        { cantidad: "150 ml", nombre: "Leche entera Gran Vía" },
        { cantidad: "1", nombre: "Pulpa de mora" },
        { cantidad: "12,5 ml", nombre: "Jarabe" },
      ],
      envase: "vaso darnel pet x 12Oz · Tapa domo Darnel 12 oz",
      pasos: [],
    });
    expect(recetaDe({ ...drink, recipe: [] })).toEqual({ bebida: true, pasos: [{ titulo: "Pon 100 g de hielo" }] });
    expect(recetaDe({ ...drink, printsLabel: false })).toEqual({ bebida: false, pasos: [] });
  });

  it("logo on the precuenta only; 58 mm shrinks the same layout", () => {
    expect(renderTicketHtml(base, { logo: "data:image/svg+xml;base64,AAA" })).toContain('src="data:image/svg+xml;base64,AAA"');
    expect(renderTicketHtml({ ...conSku, kind: "comanda" }, { logo: "x.svg", recetas })).not.toContain("x.svg"); // the comanda has no logo
    expect(renderTicketHtml(base, { papel: "58" })).toContain("zoom: 0.66");
    expect(renderTicketHtml(base)).not.toContain("zoom");
  });

  it("relayed payloads are validated", () => {
    expect(TicketDocSchema.safeParse(conSku).success).toBe(true);
    expect(TicketDocSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
  });
});
