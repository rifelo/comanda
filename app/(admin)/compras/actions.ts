"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { mensajePedido, waLink } from "@/lib/compras/compras";
import { cancelarPedido, crearPedido, loadPorPedir } from "@/lib/compras/compras-db";
import { cantidadLegible, piezaDe } from "@/lib/inventario/niveles";
import { todayInTz } from "@/lib/utils";

function revalidate() {
  for (const p of ["/compras", "/notificaciones", "/inventario/faltantes"]) revalidatePath(p);
  revalidatePath("/turno/inventario", "layout");
}

const PedidoSchema = z.object({
  proveedorId: z.string().uuid().nullable(),
  note: z.string().trim().max(300).optional(),
  // `key` is a line of the current "por pedir" list; `qty` in stock units.
  lineas: z.array(z.object({ key: z.string().uuid(), qty: z.coerce.number().positive().max(10_000_000) })).min(1).max(200),
});

export type ArmarPedidoResult = { ok: true; folio: number; mensaje: string; wa: string | null } | { ok: false; error: string };

/**
 * Turn the chosen lines of "por pedir" into one order to a supplier. The
 * lines are looked up again on the server (only their keys and quantities are
 * trusted), the team's requests behind them become "pedida" and the open
 * faltantes point to the order. Returns the WhatsApp message ready to send.
 */
export async function armarPedido(input: unknown): Promise<ArmarPedidoResult> {
  const parsed = PedidoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige al menos un ítem con cantidad." };
  const [{ user, profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  const data = await loadPorPedir(supabase, orgId);
  const byKey = new Map(data.lineas.map((l) => [l.key, l]));
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const elegidas = parsed.data.lineas.map((l) => ({ linea: byKey.get(l.key), qty: l.qty }));
  if (elegidas.some((e) => !e.linea)) return { ok: false, error: "La lista cambió. Recarga la página y arma el pedido otra vez." };
  const proveedor = parsed.data.proveedorId ? data.proveedores.find((p) => p.id === parsed.data.proveedorId) ?? null : null;
  if (parsed.data.proveedorId && !proveedor) return { ok: false, error: "Ese proveedor ya no existe." };

  const res = await crearPedido(supabase, {
    orgId,
    userId: user.id,
    proveedorId: proveedor?.id ?? null,
    entregaDias: proveedor?.entrega_dias ?? 0,
    today: todayInTz(sede?.tz ?? "America/Bogota"),
    note: parsed.data.note || null,
    lineas: elegidas.map((e) => ({ ingredienteId: e.linea!.ingredienteId, nombre: e.linea!.nombre, qty: e.qty })),
    solicitudIds: elegidas.flatMap((e) => e.linea!.solicitudIds),
    faltanteIds: elegidas.flatMap((e) => e.linea!.faltanteIds),
  });
  if (!res.ok) return res;
  const mensaje = mensajePedido({
    negocio: sede?.name ?? "la cafetería",
    folio: res.folio,
    nota: parsed.data.note,
    lineas: elegidas.map((e) => {
      const it = e.linea!.ingredienteId ? itemById.get(e.linea!.ingredienteId) : undefined;
      return { nombre: e.linea!.nombre, cantidad: it ? cantidadLegible(e.qty, it) : String(e.qty) };
    }),
  });
  revalidate();
  return { ok: true, folio: res.folio, mensaje, wa: waLink(proveedor?.whatsapp ?? null, mensaje) };
}

const ManualSchema = z.object({
  proveedorId: z.string().uuid().nullable(),
  /** YYYY-MM-DD the order should arrive. */
  llega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).optional(),
  totalEstimado: z.number().int().min(0).max(100_000_000).nullable().optional(),
  // An inventory item (qty typed in its pieces when it has them) or free text.
  lineas: z.array(z.object({
    ingredienteId: z.string().uuid().nullable(),
    nombre: z.string().trim().max(80).nullable(),
    qty: z.number().positive().max(10_000_000),
  })).min(1).max(100),
});

/**
 * An order the owner already placed (by phone, in person, online): supplier,
 * when it arrives and what comes in it. It shows on the tablet under
 * «Pedidos por llegar» so the team can receive it — count, photos, payment.
 */
export async function registrarPedidoManual(input: unknown): Promise<{ ok: true; folio: number } | { ok: false; error: string }> {
  const parsed = ManualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Agrega al menos un producto con su cantidad." };
  const d = parsed.data;
  if (d.lineas.some((l) => !l.ingredienteId && !(l.nombre && l.nombre.length >= 2))) return { ok: false, error: "Cada línea necesita un producto." };
  const [{ user, profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  const today = todayInTz(sede?.tz ?? "America/Bogota");
  const dias = Math.round((Date.parse(`${d.llega}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (dias < 0 || dias > 60) return { ok: false, error: "La fecha de llegada debe ser hoy o un día próximo." };
  if (d.proveedorId) {
    const { data: prov } = await supabase.from("proveedores").select("id").eq("organization_id", orgId).eq("id", d.proveedorId).maybeSingle();
    if (!prov) return { ok: false, error: "Ese proveedor ya no existe." };
  }
  // Inventory lines: pieces → stock units.
  const ids = d.lineas.flatMap((l) => (l.ingredienteId ? [l.ingredienteId] : []));
  const { data: ings } = ids.length
    ? await supabase.from("ingredientes").select("id, unit, pack_qty, pieza_qty").eq("organization_id", orgId).in("id", ids)
    : { data: [] as { id: string; unit: string; pack_qty: number | null; pieza_qty: number | null }[] };
  const byId = new Map((ings ?? []).map((i) => [i.id as string, i]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, error: "Un producto del pedido ya no existe en el inventario." };
  const lineas = d.lineas.map((l) => {
    if (!l.ingredienteId) return { ingredienteId: null, nombre: l.nombre, qty: l.qty };
    const i = byId.get(l.ingredienteId)!;
    const pieza = piezaDe({ unit: i.unit as string, pack_qty: i.pack_qty === null ? null : Number(i.pack_qty), pieza_qty: i.pieza_qty === null ? null : Number(i.pieza_qty) });
    return { ingredienteId: l.ingredienteId, nombre: null, qty: Math.round(l.qty * (pieza ?? 1) * 1000) / 1000 };
  });
  const res = await crearPedido(supabase, { orgId, userId: user.id, proveedorId: d.proveedorId, entregaDias: dias, today, note: d.note || null, lineas, solicitudIds: [], faltanteIds: [] });
  if (!res.ok) return res;
  if (d.totalEstimado) await supabase.from("compras").update({ total_cop: d.totalEstimado }).eq("id", res.id);
  revalidate();
  return { ok: true, folio: res.folio };
}

export async function cancelarPedidoAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Pedido inválido." };
  const { profile, supabase } = await requireAdmin();
  const res = await cancelarPedido(supabase, profile.organization_id, id);
  if (res.ok) revalidate();
  return res;
}

/** A request that will not be bought ("ya hay", "no se va a comprar"). */
export async function descartarSolicitud(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Solicitud inválida." };
  const { user, profile, supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("inventario_solicitudes")
    .update({ estado: "descartada", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("organization_id", profile.organization_id)
    .eq("id", id)
    .eq("estado", "abierta")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Esa solicitud ya fue atendida." };
  revalidate();
  return { ok: true };
}

const DiasSchema = z.object({
  id: z.string().uuid(),
  dias: z.array(z.number().int().min(0).max(6)).max(7),
  entregaDias: z.coerce.number().int().min(0).max(30),
});

/** The supplier's fixed order days (lun = 0 … dom = 6) and how long it takes to deliver. */
export async function guardarDiasProveedor(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DiasSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Días inválidos." };
  const { profile, supabase } = await requireAdmin();
  const { error } = await supabase
    .from("proveedores")
    .update({ dias_pedido_idx: [...new Set(parsed.data.dias)].sort((a, b) => a - b), entrega_dias: parsed.data.entregaDias })
    .eq("organization_id", profile.organization_id)
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: "No se pudieron guardar los días." };
  revalidate();
  return { ok: true };
}
