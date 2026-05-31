"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROD_SECTIONS } from "@/lib/mock/productos";
import { TURNOS_SECTIONS } from "@/lib/mock/turnos";
import { todayInTz } from "@/lib/utils";
import { ComandaModuleNav, activeModuleFor } from "./comanda-module-nav";

/**
 * Module-aware sidebar: top pills (`Hoy / Turnos / Productos`) + a contextual
 * `Secciones` list whose entries change based on the active module.
 *
 *   - Hoy → Dashboard + Detalle de hoy
 *   - Turnos → 5 entries from `TURNOS_SECTIONS`
 *   - Productos → existing `PROD_SECTIONS` (catálogo, ingredientes, …)
 *
 * The prior Sedes group is gone — single-sede redesign collapses everything
 * onto Daniel's Burger.
 */
export function AdminSidebarNav({ sedeTz }: { sedeTz?: string }) {
  const pathname = usePathname() ?? "";
  const active = activeModuleFor(pathname);

  return (
    <>
      <ComandaModuleNav />

      <div style={{ height: 1, background: "var(--rule)", margin: "16px -14px 14px" }} />

      <GroupLabel>Secciones</GroupLabel>
      <div className="flex flex-col">
        {active === "turnos" ? (
          <TurnosSecciones pathname={pathname} />
        ) : active === "productos" ? (
          <ProductosSecciones pathname={pathname} />
        ) : (
          <HoySecciones pathname={pathname} sedeTz={sedeTz} />
        )}
      </div>
    </>
  );
}

function HoySecciones({ pathname, sedeTz }: { pathname: string; sedeTz?: string }) {
  const today = todayInTz(sedeTz ?? "America/Bogota");
  const items = [
    { id: "dashboard", n: "01", label: "Dashboard", href: "/hoy" },
    { id: "drilldown", n: "02", label: "Detalle de hoy", href: `/hoy/${today}` },
  ];
  return (
    <>
      {items.map((s) => {
        const active =
          (s.id === "dashboard" && pathname === "/hoy") ||
          (s.id === "drilldown" && pathname.startsWith("/hoy/"));
        return <SectionLink key={s.id} {...s} active={active} />;
      })}
    </>
  );
}

function TurnosSecciones({ pathname }: { pathname: string }) {
  return (
    <>
      {TURNOS_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return <SectionLink key={s.id} {...s} active={active} />;
      })}
    </>
  );
}

function ProductosSecciones({ pathname }: { pathname: string }) {
  return (
    <>
      {PROD_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return <SectionLink key={s.id} {...s} active={active} />;
      })}
    </>
  );
}

function SectionLink({
  href,
  label,
  n,
  active,
}: {
  href: string;
  label: string;
  n: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper-lt)" : "var(--ink)",
        padding: "7px 10px",
        fontSize: 12,
        borderRadius: 2,
        marginBottom: 2,
        fontWeight: active ? 600 : 500,
        minHeight: 0,
        whiteSpace: "pre",
      }}
    >
      <span>{active ? "▸ " : "  "}</span>
      <span
        className="cmd-num"
        style={{ fontSize: 9, opacity: 0.65, letterSpacing: "0.08em" }}
      >
        {n}
      </span>
      <span style={{ marginLeft: 2 }}>{label}</span>
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted mb-1.5"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}
