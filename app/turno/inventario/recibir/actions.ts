"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurnoContext } from "@/lib/turno/server";
import { piezaDe } from "@/lib/inventario/niveles";
import { todayInTz } from "@/lib/utils";
import { errorRecepcion, justificacionPago, PAGOS_RECEPCION } from "@/lib/compras/recepcion";
import { crearMovimiento, turnoAbierto } from "@/lib/caja/movimientos-db";
import { unitCostFromPack } from "@/lib/cost";
import { recomputeProductosForIngrediente } from "@/lib/db/recetas";

const BUCKET = "compras-fotos";
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * One photo of a reception (what arrived, or the invoice) from the tablet,
 * through the service role. The screen shrinks it first; the path is kept
 * and only turned into a signed URL when someone looks at it.
 */
export async function subirFotoCompra(formData: FormData): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  const compraId = String(formData.get("compra_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!(file instanceof Blob) || !z.string().uuid().safeParse(compraId).success || (kind !== "recibido" && kind !== "factura")) return { ok: false, error: "Datos inválidos." };
  if (file.size > MAX_BYTES) return { ok: false, error: "La foto es muy pesada; tómala otra vez." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { data: compra } = await ctx.admin.from("compras").select("id").eq("organization_id", ctx.organizationId).eq("id", compraId).eq("status", "pedido").maybeSingle();
  if (!compra) return { ok: false, error: "Ese pedido ya no está por llegar." };
  const path = `${ctx.organizationId}/${compraId}/${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
  const { error } = await ctx.admin.storage.from(BUCKET).upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("[subirFotoCompra]", error);
    return { ok: false, error: "No se pudo subir la foto. Intenta de nuevo." };
  }
  return { ok: true, path };
}

const Schema = z.object({
  compraId: z.string().uuid(),
  /** What arrived per line: pieces when the item is counted in pieces, else its unit; `costo` = what the invoice charged for the whole line (COP), when read off it. */
  lineas: z.array(z.object({ itemId: z.string().uuid(), recibida: z.number().min(0).max(10_000_000), costo: z.number().int().min(0).max(100_000_000).nullable().optional() })).min(1).max(200),
  fotoRecibido: z.string().min(10).max(300),
  fotoFactura: z.string().min(10).max(300),
  facturaTotal: z.number().int().positive().max(100_000_000),
  pago: z.enum(PAGOS_RECEPCION),
  nota: z.string().trim().max(300).optional(),
});

export type RecibirResult = { ok: true; folio: number; salida: number | null } | { ok: false; error: string };

/**
 * Receive an order from the tablet, signed by whoever is logged in: the
 * counted quantities go into the inventory (type «import», tied to the
 * order), the photos and the invoice total stay on it, its faltantes are
 * closed, and when it was paid from the drawer the cash out is registered
 * with its justification. The status flips first (pedido → recibido) so two
 * tablets can't receive it twice; a later failure flips it back.
 */
export async function recibirPedido(input: unknown): Promise<RecibirResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos de la recepción." };
  const d = parsed.data;
  const invalid = errorRecepcion({ lineas: d.lineas, fotoRecibido: d.fotoRecibido, fotoFactura: d.fotoFactura, facturaTotal: d.facturaTotal, pago: d.pago });
  if (invalid) return { ok: false, error: invalid };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { admin, organizationId: orgId } = ctx;
  const prefix = `${orgId}/${d.compraId}/`;
  if (!d.fotoRecibido.startsWith(prefix) || !d.fotoFactura.startsWith(prefix)) return { ok: false, error: "Toma las fotos otra vez." };

  const { data: compra } = await admin
    .from("compras")
    .select("id, folio, proveedor:proveedores(name), compra_items(id, ingrediente_id, ingrediente:ingredientes(unit, pack_qty, pieza_qty, cost_cop))")
    .eq("organization_id", orgId)
    .eq("id", d.compraId)
    .maybeSingle();
  if (!compra) return { ok: false, error: "Ese pedido no existe." };
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const proveedor = one<{ name: string }>(compra.proveedor)?.name ?? null;
  const items = (compra.compra_items ?? []) as Array<{ id: string; ingrediente_id: string | null; ingrediente: unknown }>;
  const byId = new Map(items.map((i) => [i.id, i]));
  if (d.lineas.length !== items.length || d.lineas.some((l) => !byId.has(l.itemId))) return { ok: false, error: "El pedido cambió. Ábrelo otra vez." };

  // Lock it: only one tablet gets past this.
  const ahora = new Date().toISOString();
  const { data: flipped } = await admin
    .from("compras")
    .update({ status: "recibido", recibido_by: ctx.actor.profileId, recibido_at: ahora })
    .eq("id", d.compraId)
    .eq("status", "pedido")
    .select("id");
  if (!flipped?.length) return { ok: false, error: "Este pedido ya se recibió o se canceló." };
  const revert = async () => {
    await admin.from("compras").update({ status: "pedido", recibido_by: null, recibido_at: null }).eq("id", d.compraId);
  };

  const folio = Number(compra.folio);
  const note = `Recepción pedido n.º ${folio}${proveedor ? ` · ${proveedor}` : ""}`;
  const movs: Record<string, unknown>[] = [];
  // Lines whose invoice cost was typed: the item's cost becomes this purchase's
  // (último costo) and its recipes are re-priced after the stock is in.
  const recostear: { ingredienteId: string; unitCost: number; packQty: number | null }[] = [];
  for (const l of d.lineas) {
    const it = byId.get(l.itemId)!;
    const ing = one<{ unit: string; pack_qty: number | null; pieza_qty: number | null; cost_cop: number }>(it.ingrediente);
    const pieza = ing ? piezaDe({ unit: ing.unit, pack_qty: ing.pack_qty === null ? null : Number(ing.pack_qty), pieza_qty: ing.pieza_qty === null ? null : Number(ing.pieza_qty) }) : null;
    const qty = Math.round(l.recibida * (pieza ?? 1) * 1000) / 1000;
    const costoLinea = l.costo != null && l.costo > 0 && qty > 0 ? l.costo : null;
    const unitCost = costoLinea != null ? unitCostFromPack(costoLinea, qty) : Number(ing?.cost_cop ?? 0);
    const { error } = await admin.from("compra_items").update({ qty_recibida: qty, ...(costoLinea != null ? { costo_total_cop: costoLinea } : {}) }).eq("id", l.itemId);
    if (error) {
      console.error("[recibirPedido] item:", error);
      await revert();
      return { ok: false, error: "No se pudo guardar el conteo. Intenta de nuevo." };
    }
    if (it.ingrediente_id && ing && qty > 0) {
      movs.push({ organization_id: orgId, ingrediente_id: it.ingrediente_id, type: "import", delta: qty, unit_cost_cop: unitCost, note, created_by: ctx.actor.profileId, compra_id: d.compraId });
      if (costoLinea != null && unitCost !== Number(ing.cost_cop ?? 0)) recostear.push({ ingredienteId: it.ingrediente_id, unitCost, packQty: ing.pack_qty === null ? null : Number(ing.pack_qty) });
    }
  }
  if (movs.length) {
    const { error } = await admin.from("ingrediente_movements").insert(movs);
    if (error) {
      console.error("[recibirPedido] movements:", error);
      await admin.from("compra_items").update({ qty_recibida: null, costo_total_cop: null }).eq("compra_id", d.compraId);
      await revert();
      return { ok: false, error: "No se pudo sumar al inventario. Intenta de nuevo." };
    }
  }
  // Último costo: the goods are in, so a failure here is logged, not rolled back.
  for (const r of recostear) {
    const { error } = await admin
      .from("ingredientes")
      .update({ cost_cop: r.unitCost, ...(r.packQty && r.packQty > 0 ? { pack_cost_cop: Math.round(r.unitCost * r.packQty) } : {}) })
      .eq("organization_id", orgId)
      .eq("id", r.ingredienteId);
    if (error) console.error("[recibirPedido] costo:", error);
    else await recomputeProductosForIngrediente(admin, orgId, r.ingredienteId).catch((e) => console.error("[recibirPedido] recompute:", e));
  }

  let movimientoId: string | null = null;
  if (d.pago === "efectivo_caja") {
    const shiftInstanceId = await turnoAbierto(admin, ctx.restaurantId, todayInTz(ctx.sede.tz));
    const r = await crearMovimiento(admin, {
      orgId,
      restaurantId: ctx.restaurantId,
      shiftInstanceId,
      tipo: "salida",
      monto: d.facturaTotal,
      motivo: "pago_pedido",
      justificacion: justificacionPago({ folio, proveedor, nota: d.nota }),
      compraId: d.compraId,
      by: ctx.actor.profileId,
    });
    // The goods are already in: a failed cash line is reported, not rolled back.
    if (r.ok) movimientoId = r.id;
    else console.error("[recibirPedido] salida de caja no registrada para el pedido", folio);
  }

  await admin
    .from("compras")
    .update({
      recibido_foto_path: d.fotoRecibido,
      factura_foto_path: d.fotoFactura,
      factura_total_cop: d.facturaTotal,
      total_cop: d.facturaTotal,
      pago_metodo: d.pago,
      caja_movimiento_id: movimientoId,
      recibido_nota: d.nota || null,
    })
    .eq("id", d.compraId);
  // What the team flagged as missing and was waiting for this order is in.
  await admin
    .from("inventario_faltantes")
    .update({ resolved_at: ahora, resolved_by: ctx.actor.profileId, resolved_note: `Llegó en el pedido n.º ${folio}` })
    .eq("organization_id", orgId)
    .eq("compra_id", d.compraId)
    .is("resolved_at", null);

  revalidatePath("/turno/inventario", "layout");
  revalidatePath("/turno/caja", "layout");
  revalidatePath("/compras");
  revalidatePath("/caja");
  revalidatePath("/inventario", "layout");
  if (d.pago === "efectivo_caja" && !movimientoId) return { ok: false, error: `El pedido n.º ${folio} quedó recibido, pero la salida de caja no se guardó: regístrala en Caja → Ingresos y salidas.` };
  return { ok: true, folio, salida: movimientoId ? d.facturaTotal : null };
}
