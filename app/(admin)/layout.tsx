import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { Wordmark } from "@/components/comanda/primitives";
import { AdminSidebarNav } from "./_components/admin-sidebar-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, user, supabase } = await requireAdmin();

  const [{ data: restaurants }, { count: myShiftCount }] = await Promise.all([
    supabase.from("restaurants").select("id, name").order("name"),
    supabase
      .from("restaurant_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  const showMyShift = (myShiftCount ?? 0) > 0;

  return (
    <div className="cmd-paper flex min-h-screen text-ink">
      <aside
        className="hidden md:flex flex-col cmd-paper-lt"
        style={{
          width: 220,
          borderRight: "1.5px solid var(--ink)",
          padding: "20px 14px",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <Link href="/dashboard">
          <Wordmark size={28} />
        </Link>

        <div
          style={{
            height: 1,
            background: "var(--rule)",
            margin: "0 -14px",
          }}
        />

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <AdminSidebarNav
            showMyShift={showMyShift}
            sedes={restaurants ?? []}
          />
        </div>

        <div
          className="pt-3"
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
          <Link href="/catalogo">Productos</Link>
          <Link href="/restaurants">Sedes</Link>
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
