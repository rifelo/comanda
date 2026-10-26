"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { mensajePedido, waLink } from "@/lib/compras/compras";
import { cancelarPedido, crearPedido, loadPorPedir } from "@/lib/compras/compras-db";
import { registrarEstados } from "@/lib/inventario/faltantes-db";
import { cantidadLegible, piezaDe } from "@/lib/inventario/niveles";
import { todayInTz } from "@/lib/utils";

function revalidate() {
  for (const p of ["/compras", "/notificaciones", "/inventario/faltantes"]) revalidatePath(p);
  revalidatePath("/inventario", "layout");
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

/**
 * «Recibido» from the owner's phone (Por pedir): the order came in as it was
 * asked. Every line is received at the quantity ordered, it enters the
 * inventory (type «import», at the item's current cost), and whatever the
 * team had marked for those items goes back to «hay» on the tablet. No photos
 * or invoice here: that is the tablet's full reception, which stays the way
 * to record differences and payment.
 */
export async function recibirRapido(id: string): Promise<{ ok: true; folio: number } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Pedido inválido." };
  const { user, profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const { data: compra } = await supabase
    .from("compras")
    .select("id, folio, proveedor:proveedores(name), compra_items(id, ingrediente_id, qty_pedida, ingrediente:ingredientes(cost_cop))")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!compra) return { ok: false, error: "Ese pedido no existe." };
  const ahora = new Date().toISOString();
  // Lock it first: the tablet may be receiving the same order.
  const { data: flipped } = await supabase
    .from("compras")
    .update({ status: "recibido", recibido_by: user.id, recibido_at: ahora, pago_metodo: "pendiente", recibido_nota: "Recibido por el dueño desde Por pedir" })
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("status", "pedido")
    .select("id");
  if (!flipped?.length) return { ok: false, error: "Este pedido ya se recibió o se canceló." };
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const folio = Number(compra.folio);
  const proveedor = one<{ name: string }>(compra.proveedor)?.name ?? null;
  const items = (compra.compra_items ?? []) as Array<{ id: string; ingrediente_id: string | null; qty_pedida: number; ingrediente: unknown }>;
  const note = `Recepción pedido n.º ${folio}${proveedor ? ` · ${proveedor}` : ""} (dueño)`;
  const revert = async () => {
    await supabase.from("compra_items").update({ qty_recibida: null }).eq("compra_id", id);
    await supabase.from("compras").update({ status: "pedido", recibido_by: null, recibido_at: null, pago_metodo: null, recibido_nota: null }).eq("id", id);
  };
  for (const it of items) {
    const { error } = await supabase.from("compra_items").update({ qty_recibida: Number(it.qty_pedida) }).eq("id", it.id);
    if (error) {
      await revert();
      return { ok: false, error: "No se pudo guardar la recepción. Intenta de nuevo." };
    }
  }
  const movs = items
    .filter((it) => it.ingrediente_id && Number(it.qty_pedida) > 0)
    .map((it) => ({
      organization_id: orgId,
      ingrediente_id: it.ingrediente_id,
      type: "import",
      delta: Number(it.qty_pedida),
      unit_cost_cop: Number(one<{ cost_cop: number }>(it.ingrediente)?.cost_cop ?? 0),
      note,
      created_by: user.id,
      compra_id: id,
    }));
  if (movs.length) {
    const { error } = await supabase.from("ingrediente_movements").insert(movs);
    if (error) {
      console.error("[recibirRapido] movements:", error);
      await revert();
      return { ok: false, error: "No se pudo sumar al inventario. Intenta de nuevo." };
    }
  }
  // What was marked for these items is back: the tablet shows «hay» again.
  const ids = items.flatMap((it) => (it.ingrediente_id ? [it.ingrediente_id] : []));
  const resolved = { resolved_at: ahora, resolved_by: user.id, resolved_note: `Llegó en el pedido n.º ${folio}` };
  await supabase.from("inventario_faltantes").update(resolved).eq("organization_id", orgId).eq("compra_id", id).is("resolved_at", null);
  if (ids.length) await supabase.from("inventario_faltantes").update(resolved).eq("organization_id", orgId).in("ingrediente_id", ids).is("resolved_at", null);
  revalidate();
  revalidatePath("/caja");
  return { ok: true, folio };
}

const NuevoSchema = z.object({ sugerenciaId: z.string().uuid(), proveedorId: z.string().uuid().nullable() });

/**
 * «Agregar a la lista y pedir»: something the team added from the tablet
 * («no está en la lista») becomes an item of the inventory in the zone they
 * chose, with its supplier, still marked as they left it — so it shows in
 * that supplier's block of Por pedir, ready to order. Unit «und» and cost 0
 * until the owner completes it in Inventario.
 */
export async function nuevoALista(input: unknown): Promise<{ ok: true; ingredienteId: string } | { ok: false; error: string }> {
  const parsed = NuevoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige a quién se lo pides." };
  const [{ user, profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  const { data: s } = await supabase
    .from("inventario_sugerencias")
    .select("id, zona, tipo, nombre, nota, estado, sugerido_por, created_at")
    .eq("organization_id", orgId)
    .eq("id", parsed.data.sugerenciaId)
    .eq("status", "pendiente")
    .maybeSingle();
  if (!s || s.tipo !== "nuevo" || !s.nombre) return { ok: false, error: "Esto ya fue resuelto." };
  if (parsed.data.proveedorId) {
    const { data: prov } = await supabase.from("proveedores").select("id").eq("organization_id", orgId).eq("id", parsed.data.proveedorId).maybeSingle();
    if (!prov) return { ok: false, error: "Ese proveedor ya no existe." };
  }
  const { data: ing, error } = await supabase
    .from("ingredientes")
    .insert({ organization_id: orgId, name: s.nombre, unit: "und", ubicacion: s.zona, proveedor_id: parsed.data.proveedorId, stock_current: 0, stock_min: 0, merma_pct: 0, cost_cop: 0 })
    .select("id")
    .single();
  if (error || !ing) return { ok: false, error: error?.code === "23505" ? "Ya existe un ítem con ese nombre: descártalo y márcalo en la tablet." : "No se pudo agregar a la lista." };
  const { data: closed } = await supabase
    .from("inventario_sugerencias")
    .update({ status: "aplicada", resultado_ingrediente_id: ing.id, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", s.id)
    .eq("status", "pendiente")
    .select("id");
  if (!closed?.length) {
    await supabase.from("ingredientes").delete().eq("id", ing.id);
    return { ok: false, error: "Esto ya fue resuelto." };
  }
  if (sede) {
    const res = await registrarEstados(
      supabase,
      // Still signed by whoever reported it on the tablet, at the time they did.
      { orgId, restaurantId: sede.id, shiftInstanceId: null, profileId: (s.sugerido_por as string | null) ?? user.id },
      [{ ingredienteId: ing.id as string, estado: s.estado === "bajo" ? "bajo" : "agotado", note: (s.nota as string | null) ?? undefined, at: s.created_at as string }],
    );
    if (!res.ok) console.error("[nuevoALista] marca:", res.error);
  }
  revalidate();
  return { ok: true, ingredienteId: ing.id as string };
}
