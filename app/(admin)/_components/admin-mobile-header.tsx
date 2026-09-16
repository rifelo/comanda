"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROD_SECTIONS } from "@/lib/mock/productos";
import { CONFIG_SECTIONS, TURNOS_SECTIONS } from "@/lib/mock/turnos";
import { AdminMobileDrawer } from "./admin-mobile-drawer";
import { activeModuleFor, type ActiveModule } from "./comanda-module-nav";

/**
 * The single mobile app bar for the admin area: hamburger (opens the module
 * drawer) + the active module's title and section pills. Replaces both the old
 * co-manda/hamburger top header and the per-module tab bars — one header,
 * adaptive per route. Mirrors the design's HMAppBar + HMTabs / TMAppBar + TMTabs.
 *
 * Sticky inside <main> (the scroll container); hidden ≥ md where the sidebar
 * takes over.
 */

type Section = { label: string; href: string };

const TITLES: Record<NonNullable<ActiveModule>, string> = {
  hoy: "Hoy",
  turnos: "Turnos",
  productos: "Operación",
  configuracion: "Configuración",
};

function sectionsFor(mod: ActiveModule, today: string): Section[] {
  if (mod === "hoy")
    return [
      { label: "Dashboard", href: "/hoy" },
      { label: "Detalle de hoy", href: `/hoy/${today}` },
    ];
  if (mod === "turnos") return TURNOS_SECTIONS.map((s) => ({ label: s.label, href: s.href }));
  if (mod === "productos") return PROD_SECTIONS.map((s) => ({ label: s.label, href: s.href }));
  if (mod === "configuracion")
    return CONFIG_SECTIONS.map((s) => ({ label: s.label, href: s.href }));
  return [];
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/hoy") return pathname === "/hoy";
  if (href.startsWith("/hoy/")) return pathname.startsWith("/hoy/");
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminMobileHeader({
  userName,
  role,
  sedeName,
  sedeCurrency,
  today,
}: {
  userName: string;
  role: "admin" | "staff";
  sedeName: string;
  sedeCurrency: string;
  today: string;
}) {
  const pathname = usePathname() ?? "";
  const mod = activeModuleFor(pathname);
  const title = mod ? TITLES[mod] : "Administración";
  const sections = sectionsFor(mod, today);
  const activeSection = sections.find((s) => isActive(s.href, pathname));
  const sub = [sedeName, activeSection?.label].filter(Boolean).join(" · ");

  return (
    <div
      className="md:hidden bg-paper sticky top-0"
      style={{ zIndex: 30 }}
    >
      {/* app bar — hamburger + title */}
      <div
        className="flex items-center"
        style={{ gap: 12, padding: "12px 14px", borderBottom: "1.5px solid var(--ink)" }}
      >
        <AdminMobileDrawer
          userName={userName}
          role={role}
          sedeName={sedeName}
          sedeCurrency={sedeCurrency}
        />
        <div className="flex-1 min-w-0">
          <div className="font-slab" style={{ fontSize: 22, lineHeight: 1 }}>
            {title}
          </div>
          {sub ? (
            <div
              className="text-muted"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>
      </div>

      {/* section pills */}
      {sections.length > 0 ? (
        <div
          className="flex bg-paper"
          style={{ gap: 8, padding: "11px 14px", borderBottom: "1px dashed var(--rule)", overflowX: "auto" }}
        >
          {sections.map((s) => {
            const on = isActive(s.href, pathname);
            return (
              <Link
                key={s.href}
                href={s.href}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  textAlign: "center",
                  fontSize: 12,
                  letterSpacing: "0.03em",
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`,
                  background: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--paper-lt)" : "var(--ink)",
                  fontWeight: on ? 600 : 400,
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
