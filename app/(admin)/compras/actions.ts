"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { mensajePedido, waLink } from "@/lib/compras/compras";
import { cancelarPedido, crearPedido, loadPorPedir } from "@/lib/compras/compras-db";
import { cantidadLegible } from "@/lib/inventario/niveles";
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
