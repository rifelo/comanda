import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import type { ThemeName } from "@/lib/types";
import { TurnosHeader } from "../../_components/turnos-header";
import { ThemePicker } from "./_components/theme-picker";

export const dynamic = "force-dynamic";

export default async function ConfigPreferenciasPage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const active: ThemeName = sede?.theme ?? "papel";

  return (
    <div>
      <TurnosHeader kicker="CONFIGURACIÓN · APARIENCIA" title="Preferencias" />
      <div style={{ padding: "24px 32px", maxWidth: 640 }}>
        <div
          className="text-muted"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 8,
            display: "block",
          }}
        >
          Tema de la plataforma
        </div>
        <ThemePicker activeTheme={active} />
        <div
          className="text-muted"
          style={{ fontSize: 10, marginTop: 14, letterSpacing: "0.04em" }}
        >
          El tema se aplica a toda la plataforma de inmediato.
        </div>
      </div>
    </div>
  );
}
