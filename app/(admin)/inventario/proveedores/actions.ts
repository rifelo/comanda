"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { normalizarWhatsapp } from "@/lib/compras/proveedores";

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function revalidate() {
  revalidatePath("/inventario/proveedores", "layout");
  for (const p of ["/inventario", "/inventario/niveles", "/inventario/pedidos"]) revalidatePath(p);
  revalidatePath("/inventario/[id]", "page");
  revalidatePath("/turno/inventario", "layout");
}

const ProveedorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().max(24).optional(),
  dias: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  entregaDias: z.coerce.number().int().min(0).max(30).default(1),
  notas: z.string().trim().max(300).optional(),
});

/** Create or edit a supplier: name, WhatsApp, fixed order days, delivery time and notes. */
export async function guardarProveedor(input: unknown): Promise<Res<{ id: string }>> {
  const parsed = ProveedorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe el nombre del proveedor (mínimo 2 letras)." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const d = parsed.data;
  const row = {
    name: d.name,
    whatsapp: normalizarWhatsapp(d.whatsapp),
    dias_pedido_idx: [...new Set(d.dias)].sort((a, b) => a - b),
    entrega_dias: d.entregaDias,
    notas: d.notas || null,
  };
  const q = d.id
    ? supabase.from("proveedores").update(row).eq("organization_id", orgId).eq("id", d.id).select("id").single()
    : supabase.from("proveedores").insert({ ...row, organization_id: orgId }).select("id").single();
  const { data, error } = await q;
  if (error || !data) {
    return { ok: false, error: error?.code === "23505" ? "Ya hay un proveedor con ese nombre." : "No se pudo guardar el proveedor." };
  }
  revalidate();
  return { ok: true, id: data.id as string };
}

/** Hide a supplier; its orders keep their history, its items lose the default. */
export async function archivarProveedor(id: string): Promise<Res> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Proveedor inválido." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const { error } = await supabase.from("proveedores").update({ archived: true }).eq("organization_id", orgId).eq("id", id);
  if (error) return { ok: false, error: "No se pudo quitar el proveedor." };
  await supabase.from("ingredientes").update({ proveedor_id: null }).eq("organization_id", orgId).eq("proveedor_id", id);
  revalidate();
  return { ok: true };
}

const AsignarSchema = z.object({
  /** null = take the items away from whoever supplied them. */
  proveedorId: z.string().uuid().nullable(),
  itemIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Point items at a supplier (or at none). Items that had another supplier move over. */
export async function asignarItems(input: unknown): Promise<Res<{ count: number }>> {
  const parsed = AsignarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige al menos un ítem." };
  const { profile, supabase } = await requireAdmin();
  const orgId = profile.organization_id;
  const { proveedorId, itemIds } = parsed.data;
  if (proveedorId) {
    const { data: p } = await supabase.from("proveedores").select("id").eq("organization_id", orgId).eq("id", proveedorId).eq("archived", false).maybeSingle();
    if (!p) return { ok: false, error: "Ese proveedor ya no existe. Recarga la página." };
  }
  const { data, error } = await supabase
    .from("ingredientes")
    .update({ proveedor_id: proveedorId })
    .eq("organization_id", orgId)
    .in("id", itemIds)
    .select("id");
  if (error) return { ok: false, error: "No se pudieron asignar los ítems." };
  revalidate();
  return { ok: true, count: (data ?? []).length };
}
