import { ahoraMs, actorOf, requireEquipo } from "@/app/turno/_components/gate";
import { EquipoShell } from "@/app/turno/_components/equipo";
import { ConteoScreen } from "./conteo-screen";
import { loadConteoProps } from "./data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteo de inventario · Comanda" };

/**
 * End-of-shift stock count, signed by whoever is logged in. Blind: the
 * person types what is on the shelf without seeing what the system expects;
 * the comparison shows once the count is sent, and the owner approves it
 * from the panel. Also the «Conteo rápido» step of /turno/cerrar.
 */
export default async function ConteoPage() {
  const ctx = await requireEquipo("/turno/conteo");
  const props = await loadConteoProps(ctx);
  return (
    <EquipoShell title="Conteo" sub="Cuenta lo que hay en el estante" actor={actorOf(ctx)} tz={ctx.sede.tz} serverNow={ahoraMs()}>
      <ConteoScreen {...props} />
    </EquipoShell>
  );
}
