import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { AVANZADO_ITEMS, MAS_ITEMS } from "@/lib/nav/items";
import { LinkCard } from "@/components/ui/card";
import { NavIcon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/top-bar";
import { InstallLinkCard } from "@/components/pwa/install-banner";

export const metadata: Metadata = { title: "Más · Comanda" };

/**
 * «Más» tab of the owner panel (docs/redesign/PLAN.md §2.3): everything
 * that is not one of the four main tabs, as link-cards. Static; hrefs come
 * from lib/nav/items (today's routes — Ola 3 points them at the new ones).
 */
export default function MasPage() {
  return (
    <div className="mx-auto w-full max-w-[880px] pb-10">
      <PageHeader title="Más" sub="Caja, gastos, clientes, ajustes y lo demás" />

      <div className="px-4 sm:px-7 flex flex-col gap-8">
        <section aria-labelledby="mas-modulos" className="flex flex-col gap-2.5">
          <h2 id="mas-modulos" className="sr-only">
            Módulos
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MAS_ITEMS.map((it) => (
              <LinkCard
                key={it.id}
                href={it.href}
                title={it.label}
                sub={it.sub}
                external={it.external}
                icon={<NavIcon name={it.icon} size={22} />}
              />
            ))}
            <InstallLinkCard />
          </div>
        </section>

        <section aria-labelledby="mas-avanzado" className="flex flex-col gap-2.5">
          <div>
            <h2 id="mas-avanzado" className="ui-h2 m-0">
              Avanzado
            </h2>
            <p className="ui-sub m-0 mt-1">Herramientas que casi no se usan. Siguen funcionando igual.</p>
          </div>
          <div className="bg-surface border border-line rounded-card overflow-hidden">
            <ul className="m-0 p-0 list-none">
              {AVANZADO_ITEMS.map((it) => (
                <li key={it.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={it.href}
                    className="flex items-center gap-3 min-h-14 px-5 py-3 text-text text-[17px] font-semibold no-underline hover:bg-surface-2"
                  >
                    <span className="flex-1">{it.label}</span>
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 h-14 min-h-14 rounded-btn border border-line bg-surface text-late text-[17px] font-bold cursor-pointer hover:bg-late-soft"
          >
            <LogOut size={20} aria-hidden />
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}
