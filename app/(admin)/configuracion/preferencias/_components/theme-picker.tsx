"use client";

import * as React from "react";
import type { ThemeName } from "@/lib/types";
import { setTheme } from "../_actions";

/**
 * The 5 theme cards. Each card renders a mini-preview using the target
 * palette's hex values inline (NOT via [data-theme] swap) — that way the
 * preview shows what each theme looks like regardless of the live theme.
 *
 * Selected card is the one whose `key` matches `activeTheme`; click swaps
 * the cookie + persists on the sede via the server action. The action
 * `revalidatePath("/", "layout")` purge re-renders the root `<html
 * data-theme>` attribute — no client-side mutation needed.
 */

type Palette = {
  label: string;
  tone: string;
  paper: string;
  paperLt: string;
  ink: string;
  red: string;
  muted: string;
  ruleSoft: string;
};

const THEMES: Record<ThemeName, Palette> = {
  papel: {
    label: "Papel",
    tone: "claro",
    paper: "#f4ecdc",
    paperLt: "#faf5e8",
    ink: "#1f1a14",
    red: "#b03a2e",
    muted: "#7d6f5d",
    ruleSoft: "#dfd3b8",
  },
  sepia: {
    label: "Sepia",
    tone: "cálido",
    paper: "#ece0c8",
    paperLt: "#f6ecd6",
    ink: "#2b2013",
    red: "#a23b22",
    muted: "#857149",
    ruleSoft: "#d7c6a0",
  },
  carbon: {
    label: "Carbón",
    tone: "oscuro",
    paper: "#221e18",
    paperLt: "#2b261e",
    ink: "#f1e9d9",
    red: "#e2674f",
    muted: "#9b8c74",
    ruleSoft: "#39312562",
  },
  indigo: {
    label: "Índigo",
    tone: "frío",
    paper: "#eceef4",
    paperLt: "#f6f7fb",
    ink: "#1b1f2e",
    red: "#3a4fb0",
    muted: "#6b7283",
    ruleSoft: "#d3d8e4",
  },
  rojo: {
    label: "Rojo",
    tone: "blanco + rojo",
    paper: "#faf6f5",
    paperLt: "#ffffff",
    ink: "#1a1411",
    red: "#cc3a2c",
    muted: "#8a7b77",
    ruleSoft: "#efe4e2",
  },
};

export function ThemePicker({ activeTheme }: { activeTheme: ThemeName }) {
  const [pending, startTransition] = React.useTransition();
  const [pendingTheme, setPendingTheme] = React.useState<ThemeName | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function pick(name: ThemeName) {
    if (name === activeTheme && !error) return;
    setError(null);
    setPendingTheme(name);
    startTransition(async () => {
      const r = await setTheme({ theme: name });
      if ("error" in r && r.error) setError(r.error);
      setPendingTheme(null);
    });
  }

  return (
    <div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
      >
        {(Object.entries(THEMES) as [ThemeName, Palette][]).map(([key, t]) => {
          const on = activeTheme === key;
          const isPending = pendingTheme === key && pending;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              disabled={pending}
              style={{
                textAlign: "left",
                cursor: pending ? "not-allowed" : "pointer",
                padding: 0,
                overflow: "hidden",
                border: `1.5px solid ${on ? t.ink : "var(--rule-soft)"}`,
                borderRadius: 3,
                boxShadow: on ? `0 0 0 2px var(--ink)` : "none",
                background: t.paper,
                minHeight: 0,
              }}
            >
              <div style={{ padding: 14, background: t.paper }}>
                <div
                  className="flex items-center"
                  style={{ gap: 8, marginBottom: 10 }}
                >
                  <span
                    className="font-slab"
                    style={{ fontSize: 20, color: t.ink }}
                  >
                    co-manda<span style={{ color: t.red }}>.</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    width: "70%",
                    background: t.ink,
                    borderRadius: 2,
                    marginBottom: 6,
                    opacity: 0.85,
                  }}
                />
                <div
                  style={{
                    height: 8,
                    width: "45%",
                    background: t.muted,
                    borderRadius: 2,
                    marginBottom: 12,
                  }}
                />
                <div className="flex" style={{ gap: 6 }}>
                  <span
                    style={{
                      fontSize: 9,
                      color: t.paperLt,
                      background: t.red,
                      padding: "3px 8px",
                      borderRadius: 2,
                      letterSpacing: "0.08em",
                    }}
                  >
                    BOTÓN
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: t.ink,
                      border: `1px solid ${t.ink}`,
                      padding: "3px 8px",
                      borderRadius: 2,
                      letterSpacing: "0.08em",
                    }}
                  >
                    GHOST
                  </span>
                </div>
              </div>
              <div
                className="flex justify-between items-center"
                style={{
                  padding: "10px 14px",
                  borderTop: `1px solid ${t.ruleSoft}`,
                  background: t.paperLt,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
                  {t.label}
                </span>
                <span style={{ fontSize: 10, color: t.muted }}>
                  {isPending ? "aplicando…" : on ? "✓ activo" : t.tone}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {error ? (
        <div style={{ marginTop: 12, color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
