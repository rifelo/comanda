import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { Wordmark } from "@/components/comanda/primitives";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ profile }, sede] = await Promise.all([
    requireUser(),
    getActiveSede(),
  ]);
  const sedeName = sede?.name ?? "Daniel's Burger";

  return (
    <div className="cmd-paper flex min-h-screen flex-col">
      <header
        className="bg-paper flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1.5px solid var(--ink)" }}
      >
        <Link href="/" aria-label="Inicio">
          <Wordmark size={22} />
        </Link>
        <div
          className="flex items-center gap-3 text-muted"
          style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          <span className="hidden sm:inline">{profile.full_name}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="cmd-link"
              style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {/* Sede footer — mirrors `comanda-staff.jsx:134-137` (sede name +
          greyed "operación interna"). Pinned to the bottom of the staff
          viewport via flex-col on the layout root. */}
      <footer
        className="px-4 py-3 text-center"
        style={{
          borderTop: "1px dashed var(--rule)",
          background: "var(--paper-lt)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 500 }}>{sedeName}</div>
        <div
          className="text-muted"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          operación interna
        </div>
      </footer>
    </div>
  );
}
