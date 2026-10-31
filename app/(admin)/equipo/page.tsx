import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { attachAccess, listRoster } from "@/lib/db/roster";
import { EmptyState, PageHeader } from "@/components/ui";
import { accesoDe } from "./_lib/acceso";
import { EquipoClient } from "./_components/equipo-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo · Comanda" };

/**
 * Equipo → Personas (ex /configuracion/equipo): the sede's people and their
 * accounts. The single login lists these people on paired devices, so this
 * is where the owner creates an account with a password and resets it.
 */
export default async function EquipoPage() {
  const [{ profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const roster = sede ? await attachAccess(await listRoster(sede.id)) : [];
  const personas = roster.map(({ providers, ...m }) => ({ ...m, acceso: accesoDe(providers) }));

  return (
    <div className="mx-auto w-full max-w-[880px] pb-12">
      <PageHeader title="Personas" sub={sede ? `Quién trabaja en ${sede.name} y cómo entra a la app` : undefined} />
      <div className="px-4 sm:px-7">
        {sede ? (
          <EquipoClient initial={personas} meId={profile.id} sedeName={sede.name} />
        ) : (
          <EmptyState title="Sin sede todavía" text="Crea la sede en Ajustes para agregar personas." />
        )}
      </div>
    </div>
  );
}
