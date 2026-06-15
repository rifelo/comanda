import { Wordmark } from "@/components/comanda/primitives";
import { getUserAndProfile } from "@/lib/auth";
import { NuevaOrganizacionForm } from "./nueva-organizacion-form";
import { switchOrganization } from "./actions";

/**
 * Organization selector — the post-login landing for users without (or
 * choosing) an active org. Lists every org the user belongs to (readable via
 * the 0014 `org members read own` + `org read member` policies), lets them
 * switch into one, and always offers a create form below.
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

  return (
    <main className="cmd-paper flex min-h-screen flex-col px-6 pt-16 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark size={48} className="tracking-[-0.02em]" />

        <h1
          style={{
            marginTop: 24,
            fontSize: 20,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          Elige una organización
        </h1>
        <p
          className="text-muted mt-2 leading-relaxed"
          style={{ fontSize: 12, letterSpacing: "0.04em" }}
        >
          Entra a una de tus organizaciones o crea una nueva.
        </p>

        <div style={{ marginTop: 24 }}>
          {memberships.length === 0 ? (
            <p
              className="text-muted leading-relaxed"
              style={{ fontSize: 13 }}
            >
              Aún no perteneces a ninguna organización. Crea la primera.
            </p>
          ) : (
            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {memberships.map((m) => {
                const isActive = m.organization_id === profile.organization_id;
                return (
                  <li
                    key={m.organization_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      border: `1.5px solid var(--ink)`,
                      background: isActive ? "var(--ink)" : "var(--paper)",
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: isActive ? "var(--paper)" : "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {orgName(m)}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          marginTop: 2,
                          color: isActive
                            ? "var(--paper)"
                            : "var(--muted, #888)",
                          opacity: isActive ? 0.85 : 1,
                        }}
                      >
                        {m.role === "admin" ? "Propietario" : "Personal"}
                        {isActive ? " · Activa" : ""}
                      </div>
                    </div>

                    {isActive ? (
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--paper)",
                          flexShrink: 0,
                        }}
                      >
                        Actual
                      </span>
                    ) : (
                      <form action={switchOrganization} style={{ flexShrink: 0 }}>
                        <input
                          type="hidden"
                          name="organization_id"
                          value={m.organization_id}
                        />
                        <button type="submit" className="cmd-btn ghost sm">
                          Entrar
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <NuevaOrganizacionForm />

        <div
          className="mt-auto pt-12 text-center text-muted"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          <span>co-manda · operación interna</span>
        </div>
      </div>
    </main>
  );
}
