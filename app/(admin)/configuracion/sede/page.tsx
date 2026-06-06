import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { TurnosHeader } from "../../_components/turnos-header";
import { SedeForm } from "./_components/sede-form";

export const dynamic = "force-dynamic";

export default async function ConfigSedePage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  return (
    <div>
      <TurnosHeader kicker="CONFIGURACIÓN · IDENTIDAD" title="Sede" />
      <div style={{ padding: "24px 32px", maxWidth: 560 }}>
        <SedeForm
          initial={{
            name: sede?.name ?? "Daniel's Burger",
            logo_url: sede?.logo_url ?? null,
            timezone: sede?.tz ?? "America/Bogota",
            currency: sede?.currency ?? "COP",
          }}
        />
      </div>
    </div>
  );
}
