import { describe, expect, it } from "vitest";
import {
  addDays,
  cuadreCaja,
  diaSemana,
  esFecha,
  horaEnTz,
  resumenDia,
  ventanaDia,
  type ArqueoDia,
  type OrdenDia,
  type PagoDia,
} from "./dia";

const TZ = "America/Bogota";
const DAY = "2026-10-01";
const { desde, hasta } = ventanaDia(DAY, TZ);
/** An instant on DAY at a Bogotá wall-clock time. */
const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00-05:00`;

let seq = 0;
function orden(p: Partial<OrdenDia> & { total: number }): OrdenDia {
  seq += 1;
  return {
    id: `o${seq}`,
    folio: `A-${seq}`,
    status: "pagada",
    paymentMethod: "efectivo",
    createdAt: at("09:00"),
    paidAt: p.createdAt ?? at("09:00"),
    merged: false,
    customer: null,
    notes: null,
    items: [],
    pagos: [],
    ...p,
  };
}
const pago = (o: OrdenDia, method: string, amount: number, createdAt = o.createdAt): PagoDia => ({
  method,
  amount,
  createdAt,
  ordenStatus: o.status,
  ordenCreatedAt: o.createdAt,
});
const run = (ordenes: OrdenDia[], pagos: PagoDia[] = [], extra: Partial<Parameters<typeof resumenDia>[0]> = {}) =>
  resumenDia({ desde, hasta, tz: TZ, ordenes, pagos, previas: [], ...extra });

describe("dates", () => {
  it("validates and shifts YYYY-MM-DD", () => {
    expect(esFecha("2026-10-01")).toBe(true);
    expect(esFecha("2026-02-30")).toBe(false);
    expect(esFecha("hoy")).toBe(false);
    expect(esFecha(undefined)).toBe(false);
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diaSemana("2026-10-01")).toBe("jueves");
  });
  it("cuts the day at the sede's midnight", () => {
    expect(desde).toBe("2026-10-01T05:00:00.000Z");
    expect(hasta).toBe("2026-10-02T05:00:00.000Z");
    expect(horaEnTz("2026-10-02T01:06:00Z", TZ)).toBe(20);
  });
});

describe("resumenDia · ventas", () => {
  it("counts paid orders only, with the average ticket", () => {
    const r = run([
      orden({ total: 10000 }),
      orden({ total: 5000 }),
      orden({ total: 8000, status: "pendiente", paymentMethod: null }),
      orden({ total: 7000, status: "cancelada", paymentMethod: null }),
    ]);
    expect(r.ventas).toEqual({ total: 15000, pedidos: 2, ticket: 7500 });
  });

  it("separates real cancels from combined orders", () => {
    const r = run([
      orden({ total: 7000, status: "cancelada", notes: "se arrepintió" }),
      orden({ total: 4000, status: "cancelada", merged: true }),
    ]);
    expect(r.cancelados.n).toBe(1);
    expect(r.cancelados.total).toBe(7000);
    expect(r.combinados).toBe(1);
  });

  it("ranks products by units, then revenue", () => {
    const r = run([
      orden({ total: 20000, items: [{ key: "latte", name: "Latte", qty: 2, unitPrice: 7000 }, { key: "pan", name: "Pan", qty: 1, unitPrice: 6000 }] }),
      orden({ total: 13000, items: [{ key: "latte", name: "Latte", qty: 1, unitPrice: 7000 }, { key: "pan", name: "Pan", qty: 2, unitPrice: 3000 }] }),
      orden({ total: 9000, status: "pendiente", items: [{ key: "pan", name: "Pan", qty: 9, unitPrice: 1000 }] }),
    ]);
    expect(r.productos).toEqual([
      { key: "latte", name: "Latte", unidades: 3, ingreso: 21000 },
      { key: "pan", name: "Pan", unidades: 3, ingreso: 12000 },
    ]);
  });

  it("buckets by local hour and fills the gaps", () => {
    const r = run(
      [orden({ total: 10000, createdAt: at("07:10") }), orden({ total: 4000, createdAt: at("07:50") }), orden({ total: 6000, createdAt: at("10:05") })],
      [],
      { previas: [{ total: 9000, createdAt: at("08:30", "2026-09-24") }] },
    );
    expect(r.horas).toEqual([
      { hora: 7, total: 14000, pedidos: 2, previo: 0 },
      { hora: 8, total: 0, pedidos: 0, previo: 9000 },
      { hora: 9, total: 0, pedidos: 0, previo: 0 },
      { hora: 10, total: 6000, pedidos: 1, previo: 0 },
    ]);
  });

  it("compares with the previous week up to the same time", () => {
    const previas = [
      { total: 10000, createdAt: at("08:00", "2026-09-24") },
      { total: 30000, createdAt: at("18:00", "2026-09-24") },
    ];
    const todo = run([orden({ total: 20000 })], [], { previas });
    expect(todo.comparacion).toEqual({ total: 40000, pedidos: 2, pct: -50 });
    const aEstaHora = run([orden({ total: 20000 })], [], { previas, previasHasta: at("12:00", "2026-09-24") });
    expect(aEstaHora.comparacion).toEqual({ total: 10000, pedidos: 1, pct: 100 });
    expect(run([orden({ total: 20000 })]).comparacion.pct).toBeNull();
  });
});

describe("resumenDia · cobros", () => {
  it("adds direct sales (no payment row) to the payment rows", () => {
    const directa = orden({ total: 6000, paymentMethod: "efectivo" });
    const directaTransf = orden({ total: 9000, paymentMethod: "transferencia" });
    const conPago = orden({ total: 12000, paymentMethod: "transferencia" });
    conPago.pagos = [{ method: "transferencia", amount: 12000, createdAt: conPago.createdAt }];
    const r = run([directa, directaTransf, conPago], [pago(conPago, "transferencia", 12000)]);
    expect(r.cobros.efectivo).toEqual({ monto: 6000, pagos: 1 });
    expect(r.cobros.transferencia).toEqual({ monto: 21000, pagos: 2 });
    expect(r.cobros.tarjeta).toEqual({ monto: 0, pagos: 0 });
    expect(r.cobros.total).toBe(27000);
    expect(r.cuadre).toEqual({ diferencia: 0, ajustes: [], sinExplicar: 0 });
  });

  it("splits a mixed order by its payment rows", () => {
    const mixta = orden({ total: 20000, paymentMethod: "mixto" });
    mixta.pagos = [
      { method: "efectivo", amount: 8000, createdAt: mixta.createdAt },
      { method: "tarjeta", amount: 12000, createdAt: mixta.createdAt },
    ];
    const r = run([mixta], [pago(mixta, "efectivo", 8000), pago(mixta, "tarjeta", 12000)]);
    expect(r.cobros.efectivo.monto).toBe(8000);
    expect(r.cobros.tarjeta.monto).toBe(12000);
    expect(r.cuadre.sinExplicar).toBe(0);
  });

  it("explains money that is not a sale of the day", () => {
    const abierta = orden({ total: 30000, status: "pendiente", paymentMethod: "efectivo" });
    abierta.pagos = [{ method: "efectivo", amount: 10000, createdAt: abierta.createdAt }];
    const ayer = orden({ total: 5000, createdAt: at("21:00", "2026-09-30") });
    const r = run(
      [abierta],
      [pago(abierta, "efectivo", 10000), pago(ayer, "transferencia", 5000, at("08:00"))],
    );
    expect(r.ventas.total).toBe(0);
    expect(r.cobros.total).toBe(15000);
    expect(r.cuadre.diferencia).toBe(15000);
    expect(r.cuadre.ajustes).toEqual([
      { label: "abonos a pedidos que siguen abiertos", monto: 10000 },
      { label: "cobros de pedidos de otros días", monto: 5000 },
    ]);
    expect(r.cuadre.sinExplicar).toBe(0);
  });

  it("flags a paid order whose payments do not add up", () => {
    const corta = orden({ total: 10000 });
    corta.pagos = [{ method: "efectivo", amount: 7000, createdAt: corta.createdAt }];
    const r = run([corta], [pago(corta, "efectivo", 7000)]);
    expect(r.cuadre.sinExplicar).toBe(-3000);
  });

  it("ignores payments of cancelled orders", () => {
    const cancelada = orden({ total: 10000, status: "cancelada" });
    const r = run([cancelada], [pago(cancelada, "efectivo", 4000)]);
    expect(r.cobros.total).toBe(0);
  });
});

describe("cuadreCaja", () => {
  const arqueo = (p: Partial<ArqueoDia>): ArqueoDia => ({
    id: "c1",
    turno: "Noche",
    at: at("20:06"),
    contadoPor: "Andres",
    status: "pendiente",
    baseInicial: 179400,
    contado: 179400,
    baseDejada: 179400,
    ...p,
  });
  const efectivo = [
    { at: at("08:00"), amount: 20000 },
    { at: at("15:00"), amount: 30000 },
    { at: at("20:30"), amount: 5000 },
  ];

  it("without counts: what should be in the drawer", () => {
    const c = cuadreCaja({ arqueos: [], baseAnterior: 100000, efectivo });
    expect(c.baseOrigen).toBe("cierre-anterior");
    expect(c.diferencia).toBeNull();
    expect(c.enCaja).toBe(155000);
    expect(cuadreCaja({ arqueos: [], baseAnterior: null, efectivo: [] }).baseOrigen).toBe("sin-dato");
  });

  it("compares the whole day's cash, not the turno window", () => {
    const c = cuadreCaja({ arqueos: [arqueo({ contado: 226400 })], baseAnterior: null, efectivo });
    expect(c.base).toBe(179400);
    expect(c.efectivoHastaArqueo).toBe(50000);
    expect(c.efectivoDespues).toBe(5000);
    expect(c.entro).toBe(47000);
    expect(c.diferencia).toBe(-3000);
    expect(c.arqueos[0].entrega).toBe(47000);
    expect(c.enCaja).toBe(184400);
  });

  it("chains an opening count and a closing count", () => {
    const c = cuadreCaja({
      arqueos: [
        arqueo({ id: "c2", contado: 209400, baseDejada: 179400 }),
        arqueo({ id: "c1", turno: "Matutino", at: at("12:00"), contado: 199400 }),
      ],
      baseAnterior: null,
      efectivo,
    });
    expect(c.arqueos.map((a) => a.id)).toEqual(["c1", "c2"]);
    expect(c.entro).toBe(50000);
    expect(c.diferencia).toBe(0);
  });
});
