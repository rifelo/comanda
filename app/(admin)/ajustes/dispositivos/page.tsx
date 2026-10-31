import { requireAdmin } from "@/lib/auth";
import { formatCode } from "@/lib/pos/devices";
import { PageHeader } from "@/components/ui";
import { PosConfigClient, type PosCodeRow, type PosDeviceRow } from "./_components/pos-config-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dispositivos · Ajustes · Comanda" };

/**
 * Ajustes → Dispositivos (ex /configuracion/pos): generate pairing codes
 * (entered at /emparejar on the device) and manage the paired tablets/registers. Codes are single-use and expire after
 * 24h; the device list shows the last time each terminal touched /pos.
 */
export default async function ConfigPosPage() {
  const { supabase } = await requireAdmin();

  const [{ data: devices }, { data: codes }] = await Promise.all([
    supabase
      .from("pos_devices")
      .select("id, name, registered_at, last_seen_at, revoked_at, restaurants(name)")
      .order("registered_at", { ascending: false }),
    supabase
      .from("pos_registration_codes")
      .select("id, code, label, created_at, expires_at, used_at, cancelled_at")
      .is("used_at", null)
      .is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const deviceRows: PosDeviceRow[] = (devices ?? []).map((d) => {
    const r = d.restaurants as { name: string } | { name: string }[] | null;
    const sede = Array.isArray(r) ? r[0]?.name : r?.name;
    return {
      id: d.id as string,
      name: d.name as string,
      sede: sede ?? null,
      registeredAt: d.registered_at as string,
      lastSeenAt: d.last_seen_at as string,
      revoked: !!d.revoked_at,
    };
  });

  const codeRows: PosCodeRow[] = (codes ?? []).map((c) => ({
    id: c.id as string,
    code: formatCode(c.code as string),
    label: (c.label as string | null) ?? null,
    createdAt: c.created_at as string,
    expiresAt: c.expires_at as string,
  }));

  return (
    <div className="mx-auto w-full max-w-[880px] pb-12">
      <PageHeader title="Dispositivos" sub="La tablet del turno y la caja de esta sede" back="/ajustes" />
      <div className="px-4 sm:px-7">
        <PosConfigClient devices={deviceRows} codes={codeRows} />
      </div>
    </div>
  );
}
