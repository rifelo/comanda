"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROD_SECTIONS } from "@/lib/mock/productos";

/**
 * Top-level module switcher (Hoy / Turnos / Productos).
 *
 * Mirrors the design's `ComandaModuleNav` (`comanda-admin.jsx:8-33`). Active
 * state is derived from `usePathname()`:
 *   - Hoy: pathname starts with `/hoy`
 *   - Turnos: pathname starts with `/turnos`
 *   - Productos: pathname matches any href in `PROD_SECTIONS`
 *
 * Uses `<Link>` so navigation does not go through `startTransition` — Next
 * 16 has a bug where `router.push` inside a transition locks pending state
 * forever (see memory: feedback_next16_router_push_in_transition).
 */
const MODULES = [
  { id: "hoy", label: "Hoy", href: "/hoy" },
  { id: "turnos", label: "Turnos", href: "/turnos" },
  { id: "productos", label: "Productos", href: "/catalogo" },
] as const;

const PROD_HREFS = new Set(PROD_SECTIONS.map((s) => s.href));

export function activeModuleFor(pathname: string): "hoy" | "turnos" | "productos" | null {
  if (pathname === "/hoy" || pathname.startsWith("/hoy/")) return "hoy";
  if (pathname === "/turnos" || pathname.startsWith("/turnos/")) return "turnos";
  for (const href of PROD_HREFS) {
    if (pathname === href || pathname.startsWith(href + "/")) return "productos";
  }
  return null;
}

export function ComandaModuleNav() {
  const pathname = usePathname() ?? "";
  const active = activeModuleFor(pathname);

  return (
    <div>
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Módulos
      </div>
      <div className="flex flex-col">
        {MODULES.map((m) => {
          const isActive = m.id === active;
          return (
            <Link
              key={m.id}
              href={m.href}
              style={{
                textAlign: "left",
                background: isActive ? "var(--ink)" : "transparent",
                color: isActive ? "var(--paper-lt)" : "var(--ink)",
                padding: "7px 10px",
                fontSize: 12,
                borderRadius: 2,
                marginBottom: 2,
                fontWeight: isActive ? 600 : 400,
                minHeight: 0,
                whiteSpace: "pre",
              }}
            >
              <span>{isActive ? "▸ " : "  "}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
