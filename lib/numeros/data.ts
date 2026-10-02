import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCierresSede } from "@/lib/caja/cierres";
import { todayInTz } from "@/lib/utils";
import {
  addDays,
  cuadreCaja,
  resumenDia,
  ventanaDia,
  type ArqueoDia,
  type CuadreCaja,
  type OrdenDia,
  type PagoDia,
  type ResumenDia,
} from "./dia";

// Reads for the owner's "Números del día" page. Everything goes through the
// admin's RLS client (ordenes / orden_pagos / novedades / caja_cierres are all
// readable by the org), and nothing is written.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface PedidoAbierto {
  id: string;
  folio: string;
  createdAt: string;
  /** Created before the day being looked at. */
  viejo: boolean;
  customer: string | null;
  total: number;
  abonado: number;
  items: string;
}

export interface NovedadDia {
  id: string;
  at: string;
  body: string;
  who: string | null;
  turno: string | null;
}

export interface NumerosDia {
  date: string;
  esHoy: boolean;
  /** The day the sales are compared with (same weekday, a week before). */
  previa: string;
  resumen: ResumenDia;
  caja: CuadreCaja;
  abiertos: PedidoAbierto[];
  novedades: NovedadDia[];
}

function cliente(o: { customer_name?: unknown; customer_names?: unknown }): string | null {
  const names = Array.isArray(o.customer_names) ? (o.customer_names as string[]).filter(Boolean) : [];
  if (names.length) return names.join(", ");
  return (o.customer_name as string | null) || null;
}

export async function loadNumerosDia(
  db: Db,
  input: { orgId: string; sedeId: string | null; tz: string; date: string; now?: Date },
): Promise<NumerosDia> {
  const { orgId, sedeId, tz, date } = input;
  const now = input.now ?? new Date();
  const esHoy = date === todayInTz(tz, now);
  const dia = ventanaDia(date, tz);
  const previa = addDays(date, -7);
  const diaPrevio = ventanaDia(previa, tz);

  const [ordenesRes, pagosRes, previasRes, abiertosRes, novedadesRes, cierres] = await Promise.all([
    db
      .from("ordenes")
      .select(
        "id, folio, status, total_cop, payment_method, created_at, paid_at, merged_into, customer_name, customer_names, notes, orden_items(kind, producto_id, combo_id, name, qty, unit_price_cop), orden_pagos(method, amount_cop, created_at)",
      )
      .eq("organization_id", orgId)
      .gte("created_at", dia.desde)
      .lt("created_at", dia.hasta)
      .order("created_at"),
    db
      .from("orden_pagos")
      .select("method, amount_cop, created_at, ordenes!inner(status, created_at)")
      .eq("organization_id", orgId)
      .gte("created_at", dia.desde)
      .lt("created_at", dia.hasta),
    db
      .from("ordenes")
      .select("total_cop, created_at")
      .eq("organization_id", orgId)
      .eq("status", "pagada")
      .gte("created_at", diaPrevio.desde)
      .lt("created_at", diaPrevio.hasta),
    db
      .from("ordenes")
      .select("id, folio, total_cop, paid_cop, created_at, customer_name, customer_names, orden_items(name, qty, position)")
      .eq("organization_id", orgId)
      .eq("status", "pendiente")
      .lt("created_at", dia.hasta)
      .order("created_at"),
    sedeId
      ? db
          .from("novedades")
          .select(
            "id, body, submitted_at, profiles:profiles!novedades_submitted_by_fkey(full_name), shift:shift_instances(template:checklist_templates(name))",
          )
          .eq("restaurant_id", sedeId)
          .gte("submitted_at", dia.desde)
          .lt("submitted_at", dia.hasta)
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sedeId ? listCierresSede(db, sedeId, 40) : Promise.resolve([]),
  ]);
  for (const [name, res] of [["ordenes", ordenesRes], ["pagos", pagosRes], ["previas", previasRes], ["abiertos", abiertosRes], ["novedades", novedadesRes]] as const) {
    if (res.error) console.error(`[loadNumerosDia] ${name}:`, res.error);
  }

  const ordenes: OrdenDia[] = ((ordenesRes.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: o.id as string,
    folio: o.folio as string,
    status: o.status as OrdenDia["status"],
    total: Number(o.total_cop ?? 0),
    paymentMethod: (o.payment_method as string | null) ?? null,
    createdAt: o.created_at as string,
    paidAt: (o.paid_at as string | null) ?? null,
    merged: o.merged_into != null,
    customer: cliente(o),
    notes: (o.notes as string | null) ?? null,
    items: ((o.orden_items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      key: ((it.producto_id ?? it.combo_id) as string | null) ?? `name:${it.name as string}`,
      name: it.name as string,
      qty: Number(it.qty ?? 0),
      unitPrice: Number(it.unit_price_cop ?? 0),
    })),
    pagos: ((o.orden_pagos ?? []) as Array<Record<string, unknown>>).map((p) => ({
      method: p.method as string,
      amount: Number(p.amount_cop ?? 0),
      createdAt: p.created_at as string,
    })),
  }));

  const pagos: PagoDia[] = ((pagosRes.data ?? []) as Array<Record<string, unknown>>).map((p) => {
    const o = p.ordenes as { status: string; created_at: string };
    return {
      method: p.method as string,
      amount: Number(p.amount_cop ?? 0),
      createdAt: p.created_at as string,
      ordenStatus: o.status,
      ordenCreatedAt: o.created_at,
    };
  });

  // "A esta hora": while the day is running, compare with the same stretch of
  // the previous week, not with its whole day.
  const previasHasta = esHoy
    ? new Date(new Date(diaPrevio.desde).getTime() + (now.getTime() - new Date(dia.desde).getTime())).toISOString()
    : null;
  const resumen = resumenDia({
    desde: dia.desde,
    hasta: dia.hasta,
    tz,
    ordenes,
    pagos,
    previas: ((previasRes.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
      total: Number(o.total_cop ?? 0),
      createdAt: o.created_at as string,
    })),
    previasHasta,
  });

  // Cash counts belong to the day of their turno (a night close is sent the
  // same evening, but the turno's date is what the team means).
  const vivos = cierres.filter((c) => c.status !== "rechazado");
  const diaDe = (c: (typeof vivos)[number]) => c.shift_date ?? todayInTz(tz, new Date(c.submitted_at));
  const arqueos: ArqueoDia[] = vivos
    .filter((c) => diaDe(c) === date)
    .map((c) => ({
      id: c.id,
      turno: c.shift_name,
      at: c.submitted_at,
      contadoPor: c.counted_by_name,
      status: c.status as ArqueoDia["status"],
      baseInicial: c.base_inicial_cop,
      contado: c.contado_cop,
      baseDejada: c.base_dejada_cop,
    }));
  // listCierresSede is newest first: the first one before the day is the last close.
  const anterior = vivos.find((c) => diaDe(c) < date);
  const caja = cuadreCaja({ arqueos, baseAnterior: anterior ? anterior.base_dejada_cop : null, efectivo: resumen.efectivo });

  const abiertos: PedidoAbierto[] = ((abiertosRes.data ?? []) as Array<Record<string, unknown>>).map((o) => {
    const items = ((o.orden_items ?? []) as Array<{ name: string; qty: number; position: number }>)
      .slice()
      .sort((a, b) => a.position - b.position);
    return {
      id: o.id as string,
      folio: o.folio as string,
      createdAt: o.created_at as string,
      viejo: new Date(o.created_at as string).getTime() < new Date(dia.desde).getTime(),
      customer: cliente(o),
      total: Number(o.total_cop ?? 0),
      abonado: Number(o.paid_cop ?? 0),
      items: items.map((it) => `${it.qty}× ${it.name}`).join(" · "),
    };
  });

  const novedades: NovedadDia[] = ((novedadesRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
    id: n.id as string,
    at: n.submitted_at as string,
    body: n.body as string,
    who: (n.profiles as { full_name: string | null } | null)?.full_name ?? null,
    turno: (n.shift as { template: { name: string } | null } | null)?.template?.name ?? null,
  }));

  return { date, esHoy, previa, resumen, caja, abiertos, novedades };
}
