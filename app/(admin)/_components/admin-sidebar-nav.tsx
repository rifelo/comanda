"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROD_SECTIONS } from "@/lib/mock/productos";

type Op = { href: string; label: string; n: string };
type Sede = { id: string; name: string };

export function AdminSidebarNav({
  showMyShift,
  sedes,
}: {
  showMyShift: boolean;
  sedes: Sede[];
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const operacionRaw: Omit<Op, "n">[] = [
    { href: "/dashboard", label: "Dashboard" },
    ...(showMyShift ? [{ href: "/today", label: "Mi turno" }] : []),
    { href: "/restaurants", label: "Restaurantes" },
    { href: "/reports", label: "Reportes" },
  ];
  const operacion: Op[] = operacionRaw.map((o, i) => ({
    ...o,
    n: String(i + 1).padStart(2, "0"),
  }));

  return (
    <>
      <GroupLabel>Operación</GroupLabel>
      <div className="flex flex-col">
        {operacion.map((o) => {
          const active = isActive(o.href);
          return (
            <Link
              key={o.href}
              href={o.href}
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
                {o.n}
              </span>
              <span style={{ marginLeft: 2 }}>{o.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ height: 14 }} />

      <GroupLabel>Sedes</GroupLabel>
      <div className="flex flex-col">
        {sedes.slice(0, 6).map((r, i) => {
          const href = `/restaurants/${r.id}`;
          const active = pathname === href;
          return (
            <Link
              key={r.id}
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
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ marginLeft: 2 }}>{r.name}</span>
            </Link>
          );
        })}
        <Link
          href="/restaurants/new"
          className="cmd-link block"
          style={{ fontSize: 11, padding: "5px 10px", color: "var(--muted)" }}
        >
          + agregar sede
        </Link>
      </div>

      <div style={{ height: 14 }} />

      <GroupLabel>Productos</GroupLabel>
      <div className="flex flex-col">
        {PROD_SECTIONS.map((s) => {
          const active = isActive(s.href);
          return (
            <Link
              key={s.id}
              href={s.href}
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
                {s.n}
              </span>
              <span style={{ marginLeft: 2 }}>{s.label}</span>
            </Link>
          );
        })}
      </div>
    </>
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
