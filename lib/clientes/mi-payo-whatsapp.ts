import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rachaDiasActual } from "./coleccion";
import { inicio } from "./mi-payo";
import { cargarEscaneos } from "./mi-payo-db";
import { progreso } from "./premios";
import { decidirVinculo, premioCorto, finDeTelefono, normalizarTelefono, type OrigenVinculo, type ResumenMiPayo } from "./telefono";

// Mi Pa'Yo seen from WhatsApp (0095): which @ a number belongs to, linking
// them, and the summary the WhatsApp agent reads («¿cuántos puntos llevo?»).
// Service role throughout: the callers are the webhook, the public rating
// page and the public link page, none with a session.

export { enlaceVincular, finDeTelefono, normalizarTelefono, textoMiPayoParaAgente, type ResumenMiPayo } from "./telefono";

/**
 * The agent's view of the customer behind a WhatsApp number: balance, rewards
 * (next and redeemable), last five paid cups, total drinks and the daily
 * streak. Null when no @ has this number (send them `enlaceVincular`).
 */
export async function resumenMiPayoPorTelefono(db: SupabaseClient, orgId: string, telefono: string): Promise<ResumenMiPayo | null> {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  const { data: c, error } = await db.from("clientes").select("id, instagram, puntos").eq("organization_id", orgId).eq("telefono", tel).maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const puntos = Number(c.puntos);
  const escaneos = await cargarEscaneos(orgId, c.id as string);
  const ahora = new Date();
  const home = inicio(escaneos, ahora, 5);
  const p = progreso(puntos);
  return {
    instagram: c.instagram as string,
    puntos,
    siguiente: p.siguiente ? { titulo: p.siguiente.titulo, puntos: p.siguiente.puntos, faltan: p.faltan } : null,
    canjeables: p.disponibles.map(premioCorto),
    ultimas: home.ultimos.map((u) => ({ nombre: u.nombre, cuando: u.cuando })),
    totalBebidas: home.bebidas,
    racha: rachaDiasActual(escaneos, ahora),
  };
}

export type ResultadoVinculo =
  | { ok: true; estado: "vinculado" | "ya"; instagram: string }
  | { ok: false; motivo: "telefono_invalido" | "sin_cliente" | "otro_telefono" | "error"; instagram?: string; fin?: string }
  | { ok: false; motivo: "telefono_de_otro"; instagram: string };

/**
 * Put `telefono` on a customer, if `decidirVinculo` allows it: never a
 * different number over the one the @ has (unless `reemplazar`), never a
 * number another @ holds. The update is conditional on the number it read,
 * and the unique index (0095) catches a race for the same number.
 */
export async function vincularTelefono(
  db: SupabaseClient,
  input: { orgId: string; clienteId: string; telefono: string; origen: OrigenVinculo; reemplazar?: boolean },
): Promise<ResultadoVinculo> {
  const tel = normalizarTelefono(input.telefono);
  if (!tel) return { ok: false, motivo: "telefono_invalido" };
  const [{ data: cliente, error: e1 }, { data: dueno, error: e2 }] = await Promise.all([
    db.from("clientes").select("id, instagram, telefono").eq("organization_id", input.orgId).eq("id", input.clienteId).maybeSingle(),
    db.from("clientes").select("id, instagram").eq("organization_id", input.orgId).eq("telefono", tel).maybeSingle(),
  ]);
  if (e1 || e2) {
    console.error("[vincularTelefono] leer:", e1 ?? e2);
    return { ok: false, motivo: "error" };
  }
  if (!cliente) return { ok: false, motivo: "sin_cliente" };
  const instagram = cliente.instagram as string;
  const actual = (cliente.telefono as string | null) ?? null;
  const d = decidirVinculo({ clienteId: cliente.id as string, telefono: tel, telefonoActual: actual, duenoDelTelefono: (dueno?.id as string | undefined) ?? null, reemplazar: input.reemplazar });
  if (d.accion === "ya") return { ok: true, estado: "ya", instagram };
  if (d.accion === "omitir") {
    return d.motivo === "telefono_de_otro"
      ? { ok: false, motivo: "telefono_de_otro", instagram: dueno!.instagram as string }
      : { ok: false, motivo: "otro_telefono", instagram, fin: actual ? finDeTelefono(actual) : undefined };
  }
  let q = db
    .from("clientes")
    .update({ telefono: tel, telefono_vinculado_at: new Date().toISOString(), telefono_origen: input.origen })
    .eq("id", cliente.id as string);
  q = actual ? q.eq("telefono", actual) : q.is("telefono", null);
  const { data: hechas, error } = await q.select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, motivo: "telefono_de_otro", instagram: (await duenoDe(db, input.orgId, tel)) ?? "otro usuario" };
    console.error("[vincularTelefono] escribir:", error);
    return { ok: false, motivo: "error" };
  }
  // Someone changed the number between the read and the write: leave theirs.
  if (!hechas?.length) return { ok: false, motivo: "otro_telefono", instagram };
  return { ok: true, estado: "vinculado", instagram };
}

async function duenoDe(db: SupabaseClient, orgId: string, tel: string): Promise<string | null> {
  const { data } = await db.from("clientes").select("instagram").eq("organization_id", orgId).eq("telefono", tel).maybeSingle();
  return (data?.instagram as string | undefined) ?? null;
}

/**
 * After a cup's QR paid points to an @: when that cup came from a WhatsApp
 * order, the number that ordered is the @'s (origin 'qr'). Best-effort —
 * never throws, so the rating it follows is safe whatever happens here.
 */
export async function vincularTelefonoDeOrden(db: SupabaseClient, input: { orgId: string; ordenId: string | null; clienteId: string }): Promise<void> {
  if (!input.ordenId) return;
  try {
    const { data: orden, error } = await db
      .from("ordenes")
      .select("canal, customer_phone")
      .eq("organization_id", input.orgId)
      .eq("id", input.ordenId)
      .maybeSingle();
    if (error) throw error;
    if (!orden || orden.canal !== "whatsapp" || !orden.customer_phone) return;
    const r = await vincularTelefono(db, { orgId: input.orgId, clienteId: input.clienteId, telefono: orden.customer_phone as string, origen: "qr" });
    if (!r.ok && r.motivo !== "otro_telefono") console.warn("[vincularTelefonoDeOrden] no vinculado:", r.motivo, input.ordenId);
  } catch (e) {
    console.error("[vincularTelefonoDeOrden]", e);
  }
}

/** The customer of an @ in an organization, created with no points when it is new (the link page). */
export async function clienteDeInstagram(db: SupabaseClient, orgId: string, instagram: string): Promise<string | null> {
  const { data: hay } = await db.from("clientes").select("id").eq("organization_id", orgId).eq("instagram", instagram).maybeSingle();
  if (hay) return hay.id as string;
  const { data, error } = await db.rpc("sumar_puntos_cliente", { p_org: orgId, p_instagram: instagram, p_puntos: 0 });
  if (error) {
    console.error("[clienteDeInstagram]", error);
    return null;
  }
  const c = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
  return c?.id ?? null;
}
