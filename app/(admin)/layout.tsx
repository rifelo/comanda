import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { Wordmark } from "@/components/comanda/primitives";
import { AdminSidebarNav } from "./_components/admin-sidebar-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireAdmin gates auth + admin role; getActiveSede races against it to
  // pick the single restaurant we show across Hoy / Turnos / Productos /
  // Configuración.
  const [{ profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const sedeName = sede?.name ?? "Daniel's Burger";
  const initial = (sedeName[0] ?? "D").toUpperCase();

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
        <Link href="/hoy">
          <Wordmark size={28} />
        </Link>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <AdminSidebarNav sedeTz={sede?.tz} />
        </div>

        {/* Sede footer — 34×34 logo box + name + UTC-5 · COP per the design.
            Mirrors `comanda-turnos.jsx:147-157`. */}
        <div
          className="pt-3"
          style={{ borderTop: "1px dashed var(--rule)" }}
        >
          <div
            className="flex items-center"
            style={{ gap: 10 }}
          >
            <div
              className="flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{
                width: 34,
                height: 34,
                border: "1.5px solid var(--ink)",
                background: "var(--paper-lt)",
              }}
            >
              {sede?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sede.logo_url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  className="font-slab"
                  style={{ fontSize: 16, color: "var(--muted)" }}
                >
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sedeName}
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 10, marginTop: 1 }}
              >
                UTC-5 · {sede?.currency ?? "COP"}
              </div>
            </div>
          </div>

          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px dashed var(--rule)" }}
          >
            <div style={{ fontSize: 11, fontWeight: 500 }}>{profile.full_name}</div>
            <form action={signOut} className="mt-1">
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
        <Link href="/hoy">
          <Wordmark size={22} />
        </Link>
        <nav
          className="flex items-center gap-3 text-ink-2"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          <Link href="/hoy">Hoy</Link>
          <Link href="/turnos">Turnos</Link>
          <Link href="/catalogo">Productos</Link>
          <Link href="/configuracion">Config</Link>
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
