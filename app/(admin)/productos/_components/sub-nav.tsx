"use client";

/**
 * ProductosSubNav — left rail with the 11 module sections.
 *
 * Client component because it highlights the active section based on
 * usePathname(). The chrome around it (the outer admin sidebar) is rendered
 * by the (admin) layout, which stays a Server Component.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROD_SECTIONS } from "@/lib/mock/productos";

export function ProductosSubNav() {
  const pathname = usePathname();

  return (
    <aside
      className="cmd-paper-lt hidden lg:flex flex-col"
      style={{
        width: 232,
        borderRight: "1.5px solid var(--ink)",
        padding: "18px 14px",
        gap: 14,
        flexShrink: 0,
      }}
    >
      <div>
        <div
          className="font-slab"
          style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.01em" }}
        >
          co-manda
          <span style={{ color: "var(--red)" }}>.</span>
          <span
            className="text-muted ml-1.5"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            productos
          </span>
        </div>
        <div
          className="text-muted mt-1"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Catálogo · receta · stock
        </div>
      </div>

      <div
        className="flex items-center gap-1.5"
        style={{
          padding: "6px 8px",
          border: "1px solid var(--rule)",
          background: "var(--paper)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)" }}>⌕</span>
        <input
          placeholder="Buscar en módulo…"
          aria-label="Buscar"
          style={{
            border: "none",
            background: "transparent",
            fontSize: 11,
            outline: "none",
            flex: 1,
            color: "var(--ink)",
            padding: 0,
            minHeight: 0,
            minWidth: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            color: "var(--muted)",
            padding: "1px 4px",
            border: "1px solid var(--rule)",
          }}
        >
          ⌘K
        </span>
      </div>

      <div>
        <div
          className="text-muted"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 6,
            paddingLeft: 4,
          }}
        >
          Secciones
        </div>
        {PROD_SECTIONS.map((s) => {
          const active = pathname === s.href || pathname.startsWith(s.href + "/");
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
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 2,
                marginBottom: 1,
                minHeight: 0,
              }}
            >
              <span
                className="cmd-num"
                style={{ fontSize: 9, opacity: 0.7, letterSpacing: "0.08em" }}
              >
                {s.n}
              </span>
              <span style={{ fontWeight: active ? 600 : 400 }}>{s.label}</span>
            </Link>
          );
        })}
      </div>

      <div
        className="mt-auto pt-2.5"
        style={{ borderTop: "1px dashed var(--rule)" }}
      >
        <div
          className="text-muted"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Sede activa
        </div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>Daniel&apos;s · Norte</div>
        <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
          UTC-5 · COP
        </div>
      </div>
    </aside>
  );
}

/** Mobile/medium-width: compact horizontal scroll bar of section pills. */
export function ProductosSubNavMobile() {
  const pathname = usePathname();
  return (
    <nav
      className="cmd-paper-lt flex lg:hidden overflow-x-auto"
      style={{
        borderBottom: "1.5px solid var(--ink)",
        gap: 6,
        padding: "10px 14px",
        whiteSpace: "nowrap",
      }}
    >
      {PROD_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.id}
            href={s.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              border: `1px solid ${active ? "var(--ink)" : "var(--rule)"}`,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper-lt)" : "var(--ink)",
              fontSize: 11,
              borderRadius: 2,
              minHeight: 0,
              flexShrink: 0,
            }}
          >
            <span
              className="cmd-num"
              style={{ fontSize: 9, opacity: 0.7 }}
            >
              {s.n}
            </span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
