"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { activeModuleFor } from "./comanda-module-nav";

/**
 * Mobile hamburger drawer — the phone translation of the 220px admin sidebar.
 * Slide-in left panel with the wordmark, the signed-in admin (Owner), the four
 * modules (Hoy / Turnos / Operación / Configuración), the sede, and a session
 * footer. Ported from the design's StaffDrawer (comanda-mobile-nav.jsx),
 * adapted to admin module nav + real routing + signOut.
 *
 * Rendered inside the `md:hidden` mobile header, so it never shows on desktop
 * (the sidebar covers that). The button + drawer live together here so the
 * open/close state is self-contained.
 */

const MODULES = [
  { id: "hoy", label: "Hoy", href: "/hoy" },
  // link straight to the section (skip the /turnos → /turnos/resumen redirect)
  { id: "turnos", label: "Turnos", href: "/turnos/resumen" },
  { id: "productos", label: "Operación", href: "/catalogo" },
  { id: "configuracion", label: "Configuración", href: "/configuracion" },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return ((a + b).toUpperCase() || "·").slice(0, 2);
}

export function AdminMobileDrawer({
  userName,
  role,
  sedeName,
  sedeCurrency,
}: {
  userName: string;
  role: "admin" | "staff";
  sedeName: string;
  sedeCurrency: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname() ?? "";
  const active = activeModuleFor(pathname);
  const roleLabel = role === "admin" ? "Owner" : "Staff";

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className="flex flex-col items-center justify-center shrink-0"
        style={{
          width: 38,
          height: 38,
          gap: 4,
          border: "1.5px solid var(--ink)",
          borderRadius: 5,
          background: "var(--paper-lt)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 16, height: 1.8, background: "var(--ink)", borderRadius: 1, display: "block" }} />
        ))}
      </button>

      {/* drawer (always mounted for the slide transition) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: open ? "auto" : "none" }}>
        {/* backdrop */}
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(20,16,10,.45)",
            opacity: open ? 1 : 0,
            transition: "opacity .26s ease",
          }}
        />
        {/* panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de administración"
          className="cmd-paper flex flex-col text-ink"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: "83%",
            maxWidth: 312,
            background: "var(--paper)",
            borderRight: "1.5px solid var(--ink)",
            boxShadow: "10px 0 34px rgba(20,16,10,.28)",
            transform: open ? "translateX(0)" : "translateX(-104%)",
            transition: "transform .3s cubic-bezier(.4,0,.2,1)",
          }}
        >
          {/* header — wordmark + close */}
          <div
            className="flex items-start justify-between"
            style={{ padding: "calc(env(safe-area-inset-top) + 18px) 18px 16px", borderBottom: "1.5px solid var(--ink)" }}
          >
            <div>
              <div className="font-slab" style={{ fontSize: 30, lineHeight: 1, letterSpacing: "-.01em" }}>
                co-manda<span style={{ color: "var(--red)" }}>.</span>
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 5 }}
              >
                Administración
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="text-muted"
              style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}
            >
              ✕
            </button>
          </div>

          {/* signed-in admin */}
          <div className="flex items-center" style={{ gap: 12, padding: "15px 18px", borderBottom: "1px dashed var(--rule)" }}>
            <span
              className="inline-flex items-center justify-center"
              style={{ width: 42, height: 42, minWidth: 42, borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper-lt)", fontSize: 13, fontWeight: 700 }}
            >
              {initials(userName)}
            </span>
            <div className="min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </div>
              <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2, letterSpacing: "0.04em" }}>
                {roleLabel}
              </div>
            </div>
          </div>

          {/* module navigation */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "14px 12px" }}>
            <div
              className="text-muted"
              style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", padding: "0 6px 9px" }}
            >
              Módulos
            </div>
            {MODULES.map((m) => {
              const on = m.id === active;
              return (
                <Link
                  key={m.id}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center"
                  style={{
                    gap: 10,
                    minHeight: 48,
                    padding: "0 12px",
                    marginBottom: 3,
                    borderRadius: 3,
                    background: on ? "var(--ink)" : "transparent",
                    color: on ? "var(--paper-lt)" : "var(--ink)",
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  <span style={{ width: 8, color: "var(--red)" }}>{on ? "▸" : ""}</span>
                  <span style={{ flex: 1 }}>{m.label}</span>
                </Link>
              );
            })}
          </div>

          {/* sede */}
          <div style={{ borderTop: "1px dashed var(--rule)", padding: "14px 18px" }}>
            <div
              className="text-muted"
              style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 5 }}
            >
              Sede
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{sedeName}</div>
            <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
              UTC-5 · {sedeCurrency}
            </div>
          </div>

          {/* session footer */}
          <div
            className="flex justify-between items-center"
            style={{ borderTop: "1.5px solid var(--ink)", padding: "14px 18px calc(env(safe-area-inset-bottom) + 22px)" }}
          >
            <form action={signOut}>
              <button type="submit" className="cmd-link" style={{ fontSize: 12 }}>
                Cerrar sesión
              </button>
            </form>
            <span className="text-muted" style={{ fontSize: 9, letterSpacing: "0.12em" }}>
              v1.0
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
