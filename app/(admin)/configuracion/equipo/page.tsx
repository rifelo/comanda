import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listRoster } from "@/lib/db/roster";
import { TurnosHeader } from "../../_components/turnos-header";
import { EquipoClient } from "./_components/equipo-client";

export const dynamic = "force-dynamic";

export default async function ConfigEquipoPage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  const roster = sede ? await listRoster(sede.id) : [];

  return (
    <div>
      <TurnosHeader kicker="CONFIGURACIÓN · PERSONAL" title="Equipo" />
      <div style={{ padding: "24px 32px", maxWidth: 880 }}>
        <EquipoClient initialRoster={roster} />
      </div>
    </div>
  );
}
