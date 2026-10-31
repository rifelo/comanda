"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import type { NavItem, NavSection } from "@/lib/nav/items";
import { activeItemIn, activeSectionFor, activeTabFor } from "@/lib/nav/active";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { NavIcon } from "./icon";
import { TabBar } from "./tab-bar";
import { AppLogo, TopBar } from "./top-bar";
import { Sheet } from "./sheet";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { InstallLinkCard } from "@/components/pwa/install-banner";

export type ShellProfile = { name: string; initials?: string; role: "admin" | "staff" };

/** Server actions the profile sheet can call (passed from a server layout). */
export type ShellActions = {
  /** Global sign-out (owner on a personal device). */
  signOut?: () => Promise<void>;
  /** Local sign-out → /login with the person tiles (shared devices). */
  switchPerson?: () => Promise<void>;
};

const ROLE_LABEL = { admin: "Dueño", staff: "Equipo" } as const;

/**
 * The app frame for both faces (docs/redesign/PLAN.md §2).
 *
 *  · `equipo`: header slot (each screen brings its TopBar/FlowHeader) +
 *    content + bottom tab bar, at every width.
 *  · `dueno`: phone/tablet = header (logo · section title · avatar) + section
 *    strip + content + bottom tabs; real desktop (≥ 1024 px and a fine
 *    pointer — the `desk:` variant) = 240 px rail with the same items, the
 *    active tab's sections nested and «Más» expanded as a group.
 *
 * Content scrolls inside <main>, so the tab bar and header stay put.
 */
export function AppShell({
  nav,
  extraMatch,
  moreItems = [],
  advancedItems = [],
  profile,
  variant,
  header,
  sedeName,
  actions = {},
  children,
}: {
  nav: NavItem[];
  /** Extra prefixes per tab id (the Más tab claims every «Más» page). */
  extraMatch?: Record<string, string[]>;
  moreItems?: NavItem[];
  advancedItems?: NavItem[];
  profile: ShellProfile;
  variant: "equipo" | "dueno";
  /** Replaces the built-in header (equipo screens bring their own). */
  header?: React.ReactNode;
  sedeName?: string;
  actions?: ShellActions;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [profileOpen, setProfileOpen] = React.useState(false);

  const tab = activeTabFor(pathname, nav, extraMatch);
  // Under «Más», the entry that owns the page (Ajustes, Clientes…) brings its sections.
  const owner = tab?.id === "mas" ? activeItemIn(pathname, moreItems, advancedItems) : tab;
  const sections = owner?.sections ?? [];
  const section = sections.length ? activeSectionFor(pathname, sections) : null;
  const title = section && section.label !== owner?.label ? section.label : (owner?.label ?? tab?.label ?? "Comanda");

  const dueno = variant === "dueno";
  const profileButton = (
    <button
      type="button"
      onClick={() => setProfileOpen(true)}
      aria-label={`Perfil de ${profile.name}`}
      className="flex items-center gap-2.5 text-[15px] font-semibold shrink-0 bg-transparent border-0 p-0 text-text cursor-pointer"
    >
      <Avatar name={profile.name} initials={profile.initials} />
      <span className="hidden sm:inline max-w-[160px] truncate">{profile.name}</span>
    </button>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {dueno ? (
        <Rail
          nav={nav}
          activeId={tab?.id ?? null}
          sections={sections}
          section={section}
          moreItems={moreItems}
          advancedItems={advancedItems}
          ownerId={owner?.id ?? null}
          sedeName={sedeName}
          profile={profile}
          onProfile={() => setProfileOpen(true)}
        />
      ) : null}

      <div className="flex-1 min-w-0 flex flex-col">
        {header ??
          (dueno ? (
            <TopBar className="desk:hidden" title={title} sub={sedeName} logoHref="/hoy" whoSlot={profileButton} />
          ) : null)}

        {dueno && sections.length > 1 ? (
          <SectionStrip sections={sections} active={section} className="desk:hidden" />
        ) : null}

        <main className="flex-1 min-h-0 overflow-auto">{children}</main>

        <TabBar items={nav} extraMatch={extraMatch} className={dueno ? "desk:hidden" : undefined} />
      </div>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} variant={variant} actions={actions} />
    </div>
  );
}

function SectionStrip({ sections, active, className }: { sections: NavSection[]; active: NavSection | null; className?: string }) {
  return (
    <nav aria-label="Subsecciones" className={cn("shrink-0 bg-surface border-b border-line", className)}>
      <div className="ui-scroll-x flex gap-2 px-4 sm:px-7 py-2.5">
        {sections.map((s) => {
          const on = s.href === active?.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "shrink-0 inline-flex items-center h-10 min-h-10 px-4 rounded-full text-[15px] font-semibold no-underline whitespace-nowrap",
                on ? "bg-strong text-on-strong" : "bg-surface-2 text-muted hover:text-text",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function RailLink({
  item,
  on,
  children,
}: {
  item: NavItem;
  on: boolean;
  children?: React.ReactNode;
}) {
  const cls = cn(
    "flex items-center gap-3 h-11 min-h-11 px-3 rounded-btn text-[15px] font-semibold no-underline",
    on ? "bg-brand text-on-brand" : "text-text hover:bg-surface-2",
  );
  return (
    <li>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
          <NavIcon name={item.icon} size={20} />
          <span className="flex-1 truncate">{item.label}</span>
        </a>
      ) : (
        <Link href={item.href} aria-current={on ? "page" : undefined} className={cls}>
          <NavIcon name={item.icon} size={20} />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-late text-white text-xs font-bold flex items-center justify-center ui-num">
              {item.badge}
            </span>
          ) : null}
        </Link>
      )}
      {children}
    </li>
  );
}

function RailSections({ sections, active }: { sections: NavSection[]; active: NavSection | null }) {
  if (sections.length < 2) return null;
  return (
    <ul className="m-0 mt-1 mb-2 ml-[22px] pl-3 border-l border-line list-none flex flex-col gap-0.5">
      {sections.map((s) => {
        const on = s.href === active?.href;
        return (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center h-9 min-h-9 px-3 rounded-[10px] text-sm no-underline",
                on ? "bg-surface-2 text-text font-semibold" : "text-muted hover:text-text",
              )}
            >
              {s.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Rail({
  nav,
  activeId,
  sections,
  section,
  moreItems,
  advancedItems,
  ownerId,
  sedeName,
  profile,
  onProfile,
}: {
  nav: NavItem[];
  activeId: string | null;
  sections: NavSection[];
  section: NavSection | null;
  moreItems: NavItem[];
  advancedItems: NavItem[];
  ownerId: string | null;
  sedeName?: string;
  profile: ShellProfile;
  onProfile: () => void;
}) {
  const main = nav.filter((i) => i.id !== "mas");
  const advancedActive = advancedItems.some((i) => i.id === ownerId);
  return (
    <aside className="hidden desk:flex w-60 shrink-0 flex-col bg-surface border-r border-line">
      <Link href="/hoy" className="flex items-center gap-3 px-5 h-[76px] min-h-[76px] shrink-0 no-underline text-text border-b border-line">
        <AppLogo size={36} />
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-tight">Comanda</span>
          {sedeName ? <span className="block text-[13px] text-muted truncate">{sedeName}</span> : null}
        </span>
      </Link>

      <nav aria-label="Panel" className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
          {main.map((it) => {
            const on = it.id === activeId;
            return (
              <RailLink key={it.id} item={it} on={on}>
                {on ? <RailSections sections={sections} active={section} /> : null}
              </RailLink>
            );
          })}
        </ul>

        {moreItems.length ? (
          <div>
            <Link href="/mas" className="block px-3 pb-1.5 ui-label no-underline hover:text-text min-h-0">
              Más
            </Link>
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
              {moreItems.map((it) => {
                const on = it.id === ownerId;
                return (
                  <RailLink key={it.id} item={it} on={on}>
                    {on ? <RailSections sections={sections} active={section} /> : null}
                  </RailLink>
                );
              })}
            </ul>
            {advancedItems.length ? (
              <details className="mt-1 group" open={advancedActive || undefined}>
                <summary className="flex items-center gap-3 h-11 px-3 rounded-btn text-[15px] font-semibold text-muted cursor-pointer hover:bg-surface-2 list-none [&::-webkit-details-marker]:hidden">
                  <NavIcon name="avanzado" size={20} />
                  <span className="flex-1">Avanzado</span>
                  <ChevronDown size={18} aria-hidden className="transition-transform group-open:rotate-180" />
                </summary>
                <ul className="m-0 mt-0.5 p-0 list-none flex flex-col gap-0.5">
                  {advancedItems.map((it) => (
                    <li key={it.id}>
                      <Link
                        href={it.href}
                        aria-current={it.id === ownerId ? "page" : undefined}
                        className={cn(
                          "flex items-center h-10 min-h-10 pl-11 pr-3 rounded-[10px] text-sm no-underline",
                          it.id === ownerId ? "bg-surface-2 text-text font-semibold" : "text-muted hover:text-text",
                        )}
                      >
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </nav>

      <button
        type="button"
        onClick={onProfile}
        className="shrink-0 flex items-center gap-3 px-4 h-[72px] border-0 border-t border-line bg-surface text-left text-text cursor-pointer hover:bg-surface-2"
      >
        <Avatar name={profile.name} initials={profile.initials} />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold truncate">{profile.name}</span>
          <span className="block text-[13px] text-muted">{ROLE_LABEL[profile.role]}</span>
        </span>
      </button>
    </aside>
  );
}

function SheetLink({ href, children, onNavigate }: { href: string; children: React.ReactNode; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center h-14 min-h-14 px-4 rounded-btn border border-line bg-surface text-text text-[17px] font-semibold no-underline hover:bg-surface-2"
    >
      {children}
    </Link>
  );
}

/** Avatar tap → name, role, appearance, install, faces, sign out. */
export function ProfileSheet({
  open,
  onClose,
  profile,
  variant,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  profile: ShellProfile;
  variant: "equipo" | "dueno";
  actions: ShellActions;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Tu perfil">
      <div className="flex items-center gap-4">
        <Avatar name={profile.name} initials={profile.initials} size="lg" />
        <div className="min-w-0">
          <p className="ui-title m-0 truncate">{profile.name}</p>
          <p className="ui-sub m-0">{ROLE_LABEL[profile.role]}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="ui-label">Apariencia</span>
        <ThemeSwitcher />
      </div>

      <div className="flex flex-col gap-2">
        {variant === "dueno" ? (
          <SheetLink href="/turno" onNavigate={onClose}>
            Ver como equipo
          </SheetLink>
        ) : profile.role === "admin" ? (
          <SheetLink href="/hoy" onNavigate={onClose}>
            Ir al panel
          </SheetLink>
        ) : null}
        <SheetLink href="/pos" onNavigate={onClose}>
          Punto de venta
        </SheetLink>
        <InstallLinkCard />
      </div>

      <div className="flex flex-col gap-2">
        {actions.switchPerson ? (
          <form action={actions.switchPerson}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 h-14 min-h-14 rounded-btn border border-line bg-surface text-text text-[17px] font-bold cursor-pointer hover:bg-surface-2"
            >
              Cambiar persona
            </button>
          </form>
        ) : null}
        {actions.signOut ? (
          <form action={actions.signOut}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 h-14 min-h-14 rounded-btn border border-line bg-surface text-late text-[17px] font-bold cursor-pointer hover:bg-late-soft"
            >
              <LogOut size={20} aria-hidden />
              Salir
            </button>
          </form>
        ) : null}
      </div>
    </Sheet>
  );
}
