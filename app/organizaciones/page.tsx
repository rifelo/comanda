import { redirect } from "next/navigation";
import { AppLogo, Button, EmptyState, Pill } from "@/components/ui";
import { getUserAndProfile } from "@/lib/auth";
import { switchOrganization } from "./actions";

/**
 * Organization selector — the post-login landing for users without (or
 * choosing) an active org. Lists every org the user belongs to (readable via
 * the 0014 `org members read own` + `org read member` policies), lets them
 * switch into one. Organizations are provisioned by us, so there is no
 * self-serve create form here.
 *
 * Top-level route (NOT inside (admin)/(staff), whose layouts assume an active
 * org via requireUser/requireAdmin).
 */

type MembershipRow = {
  organization_id: string;
  role: string;
  // Supabase may type the embedded relation as an object or an array depending
  // on FK detection; normalize below.
  organizations: { name: string } | { name: string }[] | null;
};

function orgName(row: MembershipRow): string {
  const o = row.organizations;
  if (Array.isArray(o)) return o[0]?.name ?? "Sin nombre";
  return o?.name ?? "Sin nombre";
}

export default async function OrganizacionesPage() {
  const { profile, supabase } = await getUserAndProfile();

  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .order("created_at", { ascending: true });

  const memberships = (data ?? []) as MembershipRow[];

  // Nothing to choose: a user without an active org who belongs to exactly
  // one goes straight in (the team lands on /turno, the owner on /hoy).
  if (!profile.organization_id && memberships.length === 1) {
    await supabase.rpc("switch_organization", { target: memberships[0].organization_id });
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg px-4 pt-12 pb-10">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6">
        <AppLogo size={56} />
        <div>
          <h1 className="ui-h1 m-0">Elige una organización</h1>
          <p className="ui-sub m-0 mt-1">Entra a una de tus organizaciones.</p>
        </div>

        {memberships.length === 0 ? (
          <EmptyState title="Sin organización" text="Aún no perteneces a ninguna. Pídele al administrador de tu negocio que te agregue." />
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
            {memberships.map((m) => {
              const isActive = m.organization_id === profile.organization_id;
              return (
                <li key={m.organization_id} className="flex items-center gap-3 min-h-[76px] px-5 py-3 rounded-card border border-line bg-surface">
                  <div className="flex-1 min-w-0">
                    <p className="ui-title m-0 truncate">{orgName(m)}</p>
                    <p className="ui-sub m-0">{m.role === "admin" ? "Propietario" : "Equipo"}</p>
                  </div>
                  {isActive ? <Pill tone="ok">Activa</Pill> : null}
                  <form action={switchOrganization}>
                    <input type="hidden" name="organization_id" value={m.organization_id} />
                    <Button type="submit" size="sm" variant={isActive ? "ghost" : "primary"}>
                      Entrar
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
