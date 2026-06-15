"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TURNOS_SECTIONS } from "@/lib/mock/turnos";

/** Mobile-only section chrome for the Turnos module — a compact title row plus a
 *  horizontally-scrollable pill bar that routes between the sections. The
 *  desktop sidebar (admin-sidebar-nav) already covers this ≥ md, so this is
 *  hidden there. Mirrors the design's TMTabs / app-bar subtitle. */
export function TurnosMobileTabs({ sedeName }: { sedeName: string }) {
  const pathname = usePathname() ?? "";
  const active =
    TURNOS_SECTIONS.find(
      (s) => pathname === s.href || pathname.startsWith(s.href + "/"),
    )?.id ?? "resumen";

  return (
    <div className="md:hidden bg-paper" style={{ borderBottom: "1.5px solid var(--ink)" }}>
      <div
        className="flex items-baseline justify-between"
        style={{ padding: "10px 14px 8px", gap: 8 }}
      >
        <span className="font-slab" style={{ fontSize: 20, lineHeight: 1 }}>
          Turnos
        </span>
        <span
          className="text-muted"
          style={{ fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {sedeName}
        </span>
      </div>
      <div className="flex" style={{ gap: 8, padding: "2px 14px 11px", overflowX: "auto" }}>
        {TURNOS_SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <Link
              key={s.id}
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
    </div>
  );
}
