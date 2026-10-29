"use server";

import { revalidatePath } from "next/cache";
import { requireTurnoContext } from "@/lib/turno/server";
import { z } from "zod";
import { ajustarBase, CierreInputSchema, confirmarBase, crearCierre, notaCierre, validarBase, type BaseActionResult, type EnviarCierreResult } from "@/lib/caja/cierres";
import type { PlanBase } from "@/lib/caja/base";
import { DENOMINACIONES_COP } from "@/lib/caja/arqueo";
import { errorMovimiento, MOTIVOS_CAJA } from "@/lib/caja/movimientos";
import { adjuntarFoto, anularMovimiento, CAJA_FOTOS, crearMovimiento, marcarCompraPagada, turnoAbierto, urlFoto } from "@/lib/caja/movimientos-db";
import { todayInTz } from "@/lib/utils";

/**
 * Store the cash count from the shared tablet, signed by the person logged
 * in on it. The device cookie authorises the sede; the count itself is
 * `crearCierre` (shared with the staff shift screen).
 */
export async function enviarCierreCaja(input: unknown): Promise<EnviarCierreResult> {
  const parsed = CierreInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error("[enviarCierreCaja] invalid", JSON.stringify(parsed.error.issues));
    return { ok: false, error: "No se pudo leer el conteo. Recarga la página e intenta otra vez; lo contado sigue guardado." };
  }
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const res = await crearCierre(
    ctx.admin,
    { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, countedBy: ctx.actor.profileId },
    parsed.data,
  );
  if (res.ok) {
    revalidatePath("/turno/caja");
    revalidatePath("/turno");
    revalidatePath("/caja");
    revalidatePath(`/hoy/${res.shiftDate}`);
  }
  return res;
}

const ConfirmarSchema = z.object({ cierreId: z.string().uuid() });
const ValidarSchema = z.object({
  cierreId: z.string().uuid(),
  ok: z.boolean(),
  encontrado: z.number().int().min(0).max(50_000_000).optional(),
  nota: z.string().trim().max(300).optional(),
});

function afterBase() {
  revalidatePath("/turno/caja");
  revalidatePath("/turno");
  revalidatePath("/caja");
}

/** Whoever closed confirms the planned base is set aside in the drawer. */
export async function confirmarBaseCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = ConfirmarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cierre inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await confirmarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data.cierreId);
  if (r.ok) afterBase();
  return r;
}

/** Whoever opens the next turno records whether the base was found as planned. */
export async function validarBaseCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = ValidarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validación inválida." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await validarBase(ctx.admin, { restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data);
  if (r.ok) afterBase();
  return r;
}

const NotaSchema = z.object({ cierreId: z.string().uuid(), nota: z.string().trim().min(3).max(300) });

/** The note on a difference, from the result step of the arqueo. */
export async function notaCierreCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = NotaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cuéntanos qué pasó." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await notaCierre(ctx.admin, { restaurantId: ctx.restaurantId }, parsed.data.cierreId, parsed.data.nota);
  if (r.ok) afterBase();
  return r;
}

const AjustarSchema = z.object({ cierreId: z.string().uuid(), baseDejada: z.number().int().min(0).max(50_000_000) });

/** «No me alcanzan las piezas»: another base for tomorrow, while it isn't confirmed. */
export async function ajustarBaseCaja(input: unknown): Promise<{ ok: true; plan: PlanBase } | { ok: false; error: string }> {
  const parsed = AjustarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe la base en pesos." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await ajustarBase(ctx.admin, { restaurantId: ctx.restaurantId }, parsed.data.cierreId, parsed.data.baseDejada);
  if (r.ok) afterBase();
  return r;
}

// ---------------------------------------------------------------------------
// Entradas y salidas
// ---------------------------------------------------------------------------

const MAX_FOTO = 4 * 1024 * 1024;
const VALID_DEN = new Set<number>(DENOMINACIONES_COP);

/**
 * One photo for a movement (factura, comprobante, recibo), shrunk by the
 * tablet first. Uploaded before the movement is saved, so the path travels
 * with it; only turned into a signed URL when someone looks at it.
 */
export async function subirFotoCaja(formData: FormData): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "Datos inválidos." };
  if (file.size > MAX_FOTO) return { ok: false, error: "La foto es muy pesada; tómala otra vez." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const path = `${ctx.organizationId}/${todayInTz(ctx.sede.tz).slice(0, 7)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await ctx.admin.storage.from(CAJA_FOTOS).upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("[subirFotoCaja]", error);
    return { ok: false, error: "No se pudo subir la foto. Intenta de nuevo." };
  }
  return { ok: true, path };
}

const MovimientoSchema = z.object({
  clientRef: z.string().uuid(),
  tipo: z.enum(["ingreso", "salida"]),
  monto: z.number().int(),
  motivo: z.enum(MOTIVOS_CAJA),
  justificacion: z.string().trim().max(300),
  detalle: z
    .object({
      plataforma: z.string().trim().max(40).optional(),
      orden: z.string().trim().max(40).optional(),
      quien: z.string().trim().max(80).optional(),
      denominaciones: z.array(z.object({ valor: z.number().int().refine((v) => VALID_DEN.has(v)), cantidad: z.number().int().min(1).max(10_000) })).max(11).optional(),
    })
    .default({}),
  fotoPath: z.string().min(10).max(300).nullable().optional(),
  compraId: z.string().uuid().nullable().optional(),
  /** When it was tapped (it may arrive later from the offline queue). */
  at: z.string().datetime().optional(),
});

export type RegistrarMovimientoResult = { ok: true; id: string } | { ok: false; error: string; retry?: boolean };

/**
 * A cash movement from the tablet, signed by the person logged in. The
 * tablet sends it right away or, without internet, from its queue later —
 * `clientRef` makes the retry land once. A supplier payment tied to an
 * order marks that order paid from the drawer.
 */
export async function registrarMovimientoCaja(input: unknown): Promise<RegistrarMovimientoResult> {
  const parsed = MovimientoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos del movimiento." };
  const d = parsed.data;
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet.", retry: true };
  }
  if (d.fotoPath && !d.fotoPath.startsWith(`${ctx.organizationId}/`)) return { ok: false, error: "Toma la foto otra vez." };
  let compraConFactura = false;
  if (d.compraId) {
    if (d.motivo !== "pago_pedido") return { ok: false, error: "Ese pedido no va con este motivo." };
    const { data: compra } = await ctx.admin.from("compras").select("id, factura_foto_path, caja_movimiento_id").eq("organization_id", ctx.organizationId).eq("id", d.compraId).maybeSingle();
    if (!compra) return { ok: false, error: "Ese pedido no existe." };
    if (compra.caja_movimiento_id) return { ok: false, error: "Ese pedido ya se pagó desde la caja." };
    compraConFactura = !!compra.factura_foto_path;
  }
  const invalid = errorMovimiento({ tipo: d.tipo, monto: d.monto, motivo: d.motivo, justificacion: d.justificacion, detalle: d.detalle, foto: !!d.fotoPath, compraConFactura });
  if (invalid) return { ok: false, error: invalid };
  // An offline tap keeps its own time, within the last day and never in the future.
  const now = Date.now();
  const at = d.at ? Math.min(now, Math.max(now - 86_400_000, Date.parse(d.at))) : null;
  const shiftInstanceId = await turnoAbierto(ctx.admin, ctx.restaurantId, todayInTz(ctx.sede.tz));
  const r = await crearMovimiento(ctx.admin, {
    orgId: ctx.organizationId,
    restaurantId: ctx.restaurantId,
    shiftInstanceId,
    tipo: d.tipo,
    monto: d.monto,
    motivo: d.motivo,
    justificacion: d.justificacion,
    compraId: d.compraId ?? null,
    by: ctx.actor.profileId,
    detalle: d.detalle,
    fotoPath: d.fotoPath ?? null,
    clientRef: d.clientRef,
    createdAt: at ? new Date(at).toISOString() : undefined,
  });
  if (!r.ok) return { ...r, retry: true };
  if (d.compraId) await marcarCompraPagada(ctx.admin, ctx.organizationId, d.compraId, r.id);
  revalidatePath("/turno/caja");
  revalidatePath("/caja");
  if (d.compraId) revalidatePath("/compras");
  return r;
}

const IdSchema = z.object({ id: z.string().uuid() });

/** The photo of a movement (or, for a payment tied to an order, its invoice from the reception), as a short-lived link. */
export async function fotoMovimientoCaja(input: unknown): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Movimiento inválido." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const { data: m } = await ctx.admin.from("caja_movimientos").select("foto_path, compra:compras!caja_movimientos_compra_id_fkey(factura_foto_path)").eq("organization_id", ctx.organizationId).eq("id", parsed.data.id).maybeSingle();
  if (!m) return { ok: false, error: "Ese movimiento no existe." };
  if (m.foto_path) return { ok: true, url: await urlFoto(ctx.admin, CAJA_FOTOS, m.foto_path as string) };
  const compra = (Array.isArray(m.compra) ? m.compra[0] : m.compra) as { factura_foto_path: string | null } | null;
  if (compra?.factura_foto_path) return { ok: true, url: await urlFoto(ctx.admin, "compras-fotos", compra.factura_foto_path) };
  return { ok: true, url: null };
}

const AdjuntarSchema = z.object({ id: z.string().uuid(), path: z.string().min(10).max(300) });

/** The receipt of a consignación (or any photo) added after the movement was saved: it stops being «por confirmar». */
export async function adjuntarFotoMovimientoCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = AdjuntarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Foto inválida." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  if (!parsed.data.path.startsWith(`${ctx.organizationId}/`)) return { ok: false, error: "Toma la foto otra vez." };
  const r = await adjuntarFoto(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId }, parsed.data.id, parsed.data.path);
  if (r.ok) {
    revalidatePath("/turno/caja");
    revalidatePath("/caja");
  }
  return r;
}

const AnularSchema = z.object({ id: z.string().uuid(), motivo: z.string().trim().min(5).max(200) });

/** Void a movement: nothing is deleted, the arqueo stops counting it and the owner sees it crossed out. */
export async function anularMovimientoCaja(input: unknown): Promise<BaseActionResult> {
  const parsed = AnularSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cuenta por qué lo anulas." };
  let ctx;
  try {
    ctx = await requireTurnoContext();
  } catch {
    return { ok: false, error: "Sin acceso. Inicia sesión otra vez en el tablet." };
  }
  const r = await anularMovimiento(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, by: ctx.actor.profileId }, parsed.data.id, parsed.data.motivo);
  if (r.ok) {
    revalidatePath("/turno/caja");
    revalidatePath("/caja");
    revalidatePath("/compras");
  }
  return r;
}
