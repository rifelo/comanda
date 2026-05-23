import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { Wordmark } from "@/components/comanda/primitives";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireAdmin already gives us an authenticated supabase client — reuse
  // it for the sidebar's two list queries instead of building another one
  // (which also redoes auth.getUser via the SSR cookie path) and fan them
  // out in parallel. `myShiftCount` is just a head-count, so .head=true
  // keeps payload tiny.
  const { profile, user, supabase } = await requireAdmin();

  const [{ data: restaurants }, { count: myShiftCount }] = await Promise.all([
    supabase.from("restaurants").select("id, name").order("name"),
    supabase
      .from("restaurant_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  // "Mi turno" shows up only when the admin is also a member of at least
  // one restaurant's equipo. Without membership, /today is empty for
  // admins — surfacing the link would just send them to a dead end.
  const showMyShift = (myShiftCount ?? 0) > 0;

  return (
    <div className="cmd-paper flex min-h-screen text-ink">
      {/* sidebar */}
      <aside
        className="hidden md:flex flex-col cmd-paper-lt"
        style={{
          width: 240,
          borderRight: "1.5px solid var(--ink)",
          padding: "20px 18px",
          gap: 24,
        }}
      >
        <div>
          <Link href="/dashboard">
            <Wordmark size={28} />
          </Link>
          <div
            className="text-muted mt-1"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Panel admin
          </div>
        </div>

        <NavSection label="Operación">
          <NavLink href="/dashboard" label="Hoy" />
          {showMyShift ? (
            <NavLink href="/today" label="Mi turno" />
          ) : null}
          <NavLink href="/restaurants" label="Restaurantes" />
          <NavLink href="/productos/catalogo" label="Productos" />
          <NavLink href="/reports" label="Reportes" />
        </NavSection>

        <NavSection label="Sedes">
          {(restaurants ?? []).slice(0, 6).map((r) => (
            <Link
              key={r.id}
              href={`/restaurants/${r.id}`}
              className="text-ink-2 block"
              style={{ fontSize: 12, padding: "5px 10px" }}
            >
              · {r.name}
            </Link>
          ))}
          <Link
            href="/restaurants/new"
            className="cmd-link block"
            style={{ fontSize: 11, padding: "5px 10px", color: "var(--muted)" }}
          >
            + agregar sede
          </Link>
        </NavSection>

        <div
          className="mt-auto pt-3"
          style={{ borderTop: "1px dashed var(--rule)" }}
        >
          <div style={{ fontSize: 11, fontWeight: 500 }}>{profile.full_name}</div>
          <div className="text-muted" style={{ fontSize: 10 }}>
            Owner · {(restaurants ?? []).length}{" "}
            {(restaurants ?? []).length === 1 ? "sede" : "sedes"}
          </div>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="cmd-link"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* mobile top header (sidebar collapses) */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-2.5 w-full"
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          background: "var(--paper)",
          borderBottom: "1.5px solid var(--ink)",
          zIndex: 20,
        }}
      >
        <Link href="/dashboard">
          <Wordmark size={22} />
        </Link>
        <nav
          className="flex items-center gap-3 text-ink-2"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          <Link href="/dashboard">Hoy</Link>
          {showMyShift ? <Link href="/today">Mi turno</Link> : null}
          <Link href="/restaurants">Sedes</Link>
          <Link href="/productos/catalogo">Productos</Link>
          <Link href="/reports">Reportes</Link>
          <form action={signOut}>
            <button
              type="submit"
              className="cmd-link"
              style={{ fontSize: 11, letterSpacing: "0.06em" }}
            >
              Salir
            </button>
          </form>
        </nav>
      </header>

      <main className="flex-1 overflow-auto pt-[60px] md:pt-0">{children}</main>
    </div>
  );
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-muted mb-2"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-ink"
      style={{
        padding: "7px 10px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 2,
      }}
    >
      {label}
    </Link>
  );
}
