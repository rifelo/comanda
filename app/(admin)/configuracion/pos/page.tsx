import { requireAdmin } from "@/lib/auth";
import { formatCode } from "@/lib/pos/devices";
import { TurnosHeader } from "../../_components/turnos-header";
import { PosConfigClient, type PosCodeRow, type PosDeviceRow } from "./_components/pos-config-client";

export const dynamic = "force-dynamic";

/**
 * Configuración → Punto de venta: generate registration codes and manage the
 * tablets paired to this organization. Codes are single-use and expire after
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
    <div>
      <TurnosHeader kicker="CONFIGURACIÓN · DISPOSITIVOS" title="Punto de venta" />
      <div style={{ padding: "24px 32px", maxWidth: 880 }}>
        <PosConfigClient devices={deviceRows} codes={codeRows} />
      </div>
    </div>
  );
}
