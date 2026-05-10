import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { Wordmark } from "@/components/comanda/primitives";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();
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
    </div>
  );
}
