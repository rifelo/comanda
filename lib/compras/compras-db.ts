import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { fechaMas, porPedir, type LineaPedir, type PedirItem, type ProveedorPedido, type SolicitudAbierta } from "./compras";

// DB helpers for purchasing (0047). Same shape as lib/inventario/faltantes-db.ts:
// they take either the RLS client (admin panel) or the service-role client
// (tablet), always filtered by organization by hand.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const nombreDe = (v: unknown): string | null => {
  const who = v as { full_name: string | null } | { full_name: string | null }[] | null | undefined;
  return (Array.isArray(who) ? who[0]?.full_name : who?.full_name) ?? null;
};

export async function listProveedoresPedido(db: Db, orgId: string): Promise<ProveedorPedido[]> {
  const { data } = await db.from("proveedores").select("id, name, whatsapp, dias_pedido_idx, entrega_dias").eq("organization_id", orgId).eq("archived", false).order("name");
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    whatsapp: (p.whatsapp as string | null) ?? null,
    dias_pedido_idx: ((p.dias_pedido_idx as number[] | null) ?? []).map(Number),
    entrega_dias: Number(p.entrega_dias ?? 1),
  }));
}

export async function listSolicitudesAbiertas(db: Db, orgId: string): Promise<(SolicitudAbierta & { ingrediente_name: string | null })[]> {
  const { data, error } = await db
    .from("inventario_solicitudes")
    .select("id, ingrediente_id, nombre, qty, note, requested_at, ingrediente:ingredientes(name), who:profiles!inventario_solicitudes_requested_by_fkey(full_name)")
    .eq("organization_id", orgId)
    .eq("estado", "abierta")
    .order("requested_at", { ascending: false });
  if (error) {
    console.error("[listSolicitudesAbiertas]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const ing = r.ingrediente as unknown as { name: string } | { name: string }[] | null;
    return {
      id: r.id as string,
      ingrediente_id: (r.ingrediente_id as string | null) ?? null,
      ingrediente_name: (Array.isArray(ing) ? ing[0]?.name : ing?.name) ?? null,
      nombre: (r.nombre as string | null) ?? null,
      qty: num(r.qty),
      note: (r.note as string | null) ?? null,
      requested_by_name: nombreDe(r.who),
      requested_at: r.requested_at as string,
    };
  });
}

export interface PorPedirData {
  items: PedirItem[];
  lineas: LineaPedir[];
  proveedores: ProveedorPedido[];
  solicitudes: Awaited<ReturnType<typeof listSolicitudesAbiertas>>;
}

/** Everything the "por pedir" list is made of, read once. */
export async function loadPorPedir(db: Db, orgId: string): Promise<PorPedirData> {
  const [{ data: ings }, faltantes, solicitudes, proveedores, { data: camino }] = await Promise.all([
    db
      .from("ingredientes")
      .select("id, name, unit, stock_current, stock_critico, stock_min, stock_objetivo, pack_qty, pack_label, pieza_qty, proveedor_id")
      .eq("organization_id", orgId)
      .eq("archived", false)
      .order("name"),
    listFaltantesAbiertos(db, orgId),
    listSolicitudesAbiertas(db, orgId),
    listProveedoresPedido(db, orgId),
    db.from("compra_items").select("ingrediente_id, qty_pedida, compra:compras!inner(status)").eq("organization_id", orgId).eq("compra.status", "pedido"),
  ]);
  const items: PedirItem[] = (ings ?? []).map((i) => ({
    id: i.id as string,
    name: i.name as string,
    unit: i.unit as string,
    stock: Number(i.stock_current),
    stock_critico: Number(i.stock_critico ?? 0),
    stock_min: Number(i.stock_min ?? 0),
    stock_objetivo: num(i.stock_objetivo),
    pack_qty: num(i.pack_qty),
    pack_label: (i.pack_label as string | null) ?? null,
    pieza_qty: num(i.pieza_qty),
    proveedor_id: (i.proveedor_id as string | null) ?? null,
  }));
  const enCamino: Record<string, number> = {};
  for (const c of camino ?? []) if (c.ingrediente_id) enCamino[c.ingrediente_id as string] = (enCamino[c.ingrediente_id as string] ?? 0) + Number(c.qty_pedida);
  const lineas = porPedir({ items, faltantes: faltantes.map((f) => ({ id: f.id, ingrediente_id: f.ingrediente_id, estado: f.estado, note: f.note })), solicitudes, enCamino });
  return { items, lineas, proveedores, solicitudes };
}

export interface CompraItem {
  id: string;
  ingrediente_id: string | null;
  nombre: string;
  unit: string | null;
  pack_label: string | null;
  pack_qty: number | null;
  pieza_qty: number | null;
  controla_vencimiento: boolean;
  qty_pedida: number;
  qty_recibida: number | null;
  costo_total_cop: number | null;
  vence_el: string | null;
}
export interface Compra {
  id: string;
  folio: number;
  status: "pedido" | "recibido" | "cerrada" | "cancelada";
  origen: "pedido" | "directa";
  proveedor_id: string | null;
  proveedor_name: string | null;
  proveedor_whatsapp: string | null;
  pedido_at: string;
  pedido_by_name: string | null;
  entrega_esperada: string | null;
  recibido_at: string | null;
  recibido_by_name: string | null;
  total_cop: number | null;
  note: string | null;
  items: CompraItem[];
}

const COMPRA_SELECT =
  "id, folio, status, origen, proveedor_id, pedido_at, entrega_esperada, recibido_at, total_cop, note, proveedor:proveedores(name, whatsapp), pidio:profiles!compras_pedido_by_fkey(full_name), recibio:profiles!compras_recibido_by_fkey(full_name), compra_items(id, ingrediente_id, nombre, qty_pedida, qty_recibida, costo_total_cop, vence_el, created_at, ingrediente:ingredientes(name, unit, pack_label, pack_qty, pieza_qty, controla_vencimiento))";

function mapCompra(r: Record<string, unknown>): Compra {
  const prov = r.proveedor as { name: string; whatsapp: string | null } | { name: string; whatsapp: string | null }[] | null;
  const p = Array.isArray(prov) ? prov[0] : prov;
  const items = ((r.compra_items ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((it): CompraItem => {
      const raw = it.ingrediente as Record<string, unknown> | Record<string, unknown>[] | null;
      const ing = Array.isArray(raw) ? raw[0] : raw;
      return {
        id: it.id as string,
        ingrediente_id: (it.ingrediente_id as string | null) ?? null,
        nombre: (ing?.name as string | undefined) ?? (it.nombre as string | null) ?? "—",
        unit: (ing?.unit as string | undefined) ?? null,
        pack_label: (ing?.pack_label as string | null | undefined) ?? null,
        pack_qty: num(ing?.pack_qty),
        pieza_qty: num(ing?.pieza_qty),
        controla_vencimiento: ing?.controla_vencimiento === true,
        qty_pedida: Number(it.qty_pedida),
        qty_recibida: num(it.qty_recibida),
        costo_total_cop: num(it.costo_total_cop),
        vence_el: (it.vence_el as string | null) ?? null,
      };
    });
  return {
    id: r.id as string,
    folio: Number(r.folio),
    status: r.status as Compra["status"],
    origen: r.origen as Compra["origen"],
    proveedor_id: (r.proveedor_id as string | null) ?? null,
    proveedor_name: p?.name ?? null,
    proveedor_whatsapp: p?.whatsapp ?? null,
    pedido_at: r.pedido_at as string,
    pedido_by_name: nombreDe(r.pidio),
    entrega_esperada: (r.entrega_esperada as string | null) ?? null,
    recibido_at: (r.recibido_at as string | null) ?? null,
    recibido_by_name: nombreDe(r.recibio),
    total_cop: num(r.total_cop),
    note: (r.note as string | null) ?? null,
    items,
  };
}

/** Orders newest first, optionally only some statuses. */
export async function listCompras(db: Db, orgId: string, statuses?: Compra["status"][], limit = 40): Promise<Compra[]> {
  let q = db.from("compras").select(COMPRA_SELECT).eq("organization_id", orgId).order("pedido_at", { ascending: false }).limit(limit);
  if (statuses?.length) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) {
    console.error("[listCompras]", error);
    return [];
  }
  return (data ?? []).map((r) => mapCompra(r as unknown as Record<string, unknown>));
}

export interface NuevoPedido {
  orgId: string;
  userId: string;
  proveedorId: string | null;
  entregaDias: number;
  today: string;
  note: string | null;
  lineas: { ingredienteId: string | null; nombre: string | null; qty: number }[];
  solicitudIds: string[];
  faltanteIds: string[];
}

/**
 * Create the order to a supplier and tie to it what it answers: the team's
 * requests become "pedida" and the open faltantes point to it ("en camino").
 * The folio is the next number of the organization; a clash on the unique
 * index (two orders at once) retries once.
 */
export async function crearPedido(db: Db, p: NuevoPedido): Promise<{ ok: true; id: string; folio: number } | { ok: false; error: string }> {
  let compra: { id: string; folio: number } | null = null;
  for (let intento = 0; intento < 2 && !compra; intento++) {
    const { data: last } = await db.from("compras").select("folio").eq("organization_id", p.orgId).order("folio", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db
      .from("compras")
      .insert({ organization_id: p.orgId, folio: Number(last?.folio ?? 0) + 1, proveedor_id: p.proveedorId, pedido_by: p.userId, entrega_esperada: fechaMas(p.today, p.entregaDias), note: p.note })
      .select("id, folio")
      .single();
    if (data) compra = { id: data.id as string, folio: Number(data.folio) };
    else if (error?.code !== "23505") {
      console.error("[crearPedido] compra:", error);
      break;
    }
  }
  if (!compra) return { ok: false, error: "No se pudo crear el pedido." };
  const { error: iErr } = await db.from("compra_items").insert(
    p.lineas.map((l) => ({ organization_id: p.orgId, compra_id: compra.id, ingrediente_id: l.ingredienteId, nombre: l.ingredienteId ? null : l.nombre, qty_pedida: l.qty })),
  );
  if (iErr) {
    console.error("[crearPedido] items:", iErr);
    await db.from("compras").delete().eq("id", compra.id);
    return { ok: false, error: "No se pudieron guardar las líneas del pedido." };
  }
  if (p.solicitudIds.length) {
    await db.from("inventario_solicitudes").update({ estado: "pedida", compra_id: compra.id, resolved_by: p.userId, resolved_at: new Date().toISOString() }).eq("organization_id", p.orgId).in("id", p.solicitudIds).eq("estado", "abierta");
  }
  if (p.faltanteIds.length) {
    await db.from("inventario_faltantes").update({ compra_id: compra.id }).eq("organization_id", p.orgId).in("id", p.faltanteIds).is("resolved_at", null);
  }
  return { ok: true, id: compra.id, folio: compra.folio };
}

/** Cancel an order that never arrived: its requests are open again. */
export async function cancelarPedido(db: Db, orgId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.from("compras").update({ status: "cancelada" }).eq("organization_id", orgId).eq("id", id).eq("status", "pedido").select("id");
  if (error || !data?.length) return { ok: false, error: "Este pedido ya no se puede cancelar." };
  await db.from("inventario_solicitudes").update({ estado: "abierta", compra_id: null, resolved_by: null, resolved_at: null }).eq("organization_id", orgId).eq("compra_id", id);
  await db.from("inventario_faltantes").update({ compra_id: null }).eq("organization_id", orgId).eq("compra_id", id);
  return { ok: true };
}
