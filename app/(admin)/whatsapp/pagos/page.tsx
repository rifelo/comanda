import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "../../hoy/_components/auto-refresh";
import { PagosClient, type PagoPorAprobar } from "./pagos-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos WhatsApp · Comanda" };

/** Bogotá is UTC−5 all year; by hand so server and browser agree. */
function hora(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** The request's clock (kept out of the component body). */
const reloj = () => Date.now();

/**
 * WhatsApp deliveries the barista accepted and that wait for the transfer:
 * the owner checks the Nequi/Bold app and approves here. Approving records
 * the payment, sends the order to preparation (the registers print its
 * comanda) and the agent tells the customer. Refreshes every 20 s.
 */
export default async function PagosWhatsappPage() {
  const { profile } = await requireAdmin();
  const db = createSupabaseAdminClient();
  const { data: ords } = await db
    .from("ordenes")
    .select("id, folio, customer_name, customer_phone, telefono_recibe, delivery_address, total_cop, paid_cop, created_at, wa_decidido_at, orden_items(name, qty)")
    .eq("organization_id", profile.organization_id)
    .eq("wa_estado", "esperando_pago")
    .order("created_at", { ascending: true })
    .limit(50);
  const ordenes = (ords ?? []) as Record<string, unknown>[];
  const telefonos = [...new Set(ordenes.map((o) => o.customer_phone as string | null).filter((t): t is string => !!t))];
  const { data: convs } = telefonos.length
    ? await db.from("whatsapp_conversaciones").select("id, wa_id").eq("organization_id", profile.organization_id).in("wa_id", telefonos)
    : { data: [] };
  const convDe = new Map<string, string[]>();
  for (const c of convs ?? []) convDe.set(c.wa_id as string, [...(convDe.get(c.wa_id as string) ?? []), c.id as string]);
  const desde = ordenes.length ? new Date(Date.parse(ordenes[0].created_at as string) - 3 * 3600_000).toISOString() : null;
  const ids = [...convDe.values()].flat();
  const { data: msgs } = ids.length && desde
    ? await db.from("whatsapp_mensajes").select("conversacion_id, autor, texto, created_at").in("conversacion_id", ids).gte("created_at", desde).order("created_at", { ascending: true }).limit(600)
    : { data: [] };

  const ahora = reloj();
  const pagos: PagoPorAprobar[] = ordenes.map((o) => {
    const convIds = convDe.get(o.customer_phone as string) ?? [];
    const desdeOrden = Date.parse(o.created_at as string) - 3 * 3600_000;
    return {
      id: o.id as string,
      folio: o.folio as string,
      cliente: (o.customer_name as string | null) ?? "",
      telefono: (o.customer_phone as string | null) ?? null,
      direccion: (o.delivery_address as string | null) ?? null,
      telefonoRecibe: (o.telefono_recibe as string | null) ?? null,
      total: Number(o.total_cop),
      falta: Math.max(0, Number(o.total_cop) - Number(o.paid_cop ?? 0)),
      items: ((o.orden_items ?? []) as { name: string; qty: number }[]).map((i) => `${i.qty} × ${i.name}`),
      hora: hora(o.created_at as string),
      minutos: Math.max(0, Math.floor((ahora - Date.parse((o.wa_decidido_at as string | null) ?? (o.created_at as string))) / 60_000)),
      chat: (msgs ?? [])
        .filter((m) => convIds.includes(m.conversacion_id as string) && Date.parse(m.created_at as string) >= desdeOrden)
        .map((m) => ({ autor: m.autor as "cliente" | "agente" | "equipo", texto: m.texto as string, hora: hora(m.created_at as string) })),
    };
  });

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <AutoRefresh seconds={20} />
      <PageHeader title="Pagos WhatsApp" sub="Domicilios esperando que confirmes la transferencia" back="/whatsapp" />
      <div className="px-4 sm:px-7 pb-12">
        <PagosClient pagos={pagos} />
      </div>
    </div>
  );
}
