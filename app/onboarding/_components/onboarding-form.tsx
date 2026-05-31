"use client";

import * as React from "react";
import { ROOT_DOMAIN, tenantUrl } from "@/lib/tenant";
import { checkSlug, completeOnboarding } from "../_actions";

/** Mirror of the server normalizeSlug for live display. */
function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 32);
}

const formInput: React.CSSProperties = {
  fontSize: 14,
  border: "1px solid var(--ink)",
  background: "var(--paper)",
  padding: "10px 12px",
  color: "var(--ink)",
  outline: "none",
  borderRadius: 2,
  width: "100%",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 6,
};

export function OnboardingForm({
  defaultRestaurantName,
}: {
  defaultRestaurantName: string;
}) {
  const [slug, setSlug] = React.useState("");
  const [name, setName] = React.useState(defaultRestaurantName);
  const [tz, setTz] = React.useState("America/Bogota");
  // Availability result is keyed by the slug it was computed for, so we can
  // derive "checking" without a synchronous setState in the effect.
  const [avail, setAvail] = React.useState<{
    slug: string;
    available: boolean;
    reason?: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [doneSlug, setDoneSlug] = React.useState<string | null>(null);

  // Debounced availability check (state is only set inside the deferred call).
  React.useEffect(() => {
    if (!slug) return;
    let active = true;
    const t = setTimeout(async () => {
      const r = await checkSlug(slug);
      if (active) setAvail({ slug, ...r });
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [slug]);

  const current = avail?.slug === slug ? avail : null;
  const checking = !!slug && !current;

  // On success, hard-navigate to the new subdomain (never router.push in a
  // transition — see Next 16 pending-lock bug).
  React.useEffect(() => {
    if (doneSlug) window.location.assign(tenantUrl(doneSlug, "/"));
  }, [doneSlug]);

  const canSubmit =
    !!name.trim() && !!slug && current?.available === true && !pending && !doneSlug;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const r = await completeOnboarding({
        slug,
        restaurantName: name.trim(),
        timezone: tz.trim() || "America/Bogota",
      });
      if ("error" in r && r.error) setError(r.error);
      else if ("ok" in r && r.ok) setDoneSlug(r.slug);
    });
  }

  return (
    <div className="space-y-5">
      {/* subdomain */}
      <div>
        <div style={labelStyle}>Subdominio</div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <input
            autoFocus
            value={slug}
            onChange={(e) => setSlug(normalizeSlug(e.target.value))}
            placeholder="mi-restaurante"
            inputMode="text"
            style={{ ...formInput, width: 200 }}
          />
          <span className="text-muted" style={{ fontSize: 13 }}>
            .{ROOT_DOMAIN}
          </span>
        </div>
        <div style={{ fontSize: 11, marginTop: 6, minHeight: 16 }}>
          {!slug ? (
            <span className="text-muted">Esta será la dirección de tu equipo.</span>
          ) : checking ? (
            <span className="text-muted">Comprobando…</span>
          ) : current?.available ? (
            <span style={{ color: "var(--green)" }}>
              ✓ {slug}.{ROOT_DOMAIN} está disponible
            </span>
          ) : (
            <span style={{ color: "var(--red)" }}>{current?.reason}</span>
          )}
        </div>
      </div>

      {/* restaurant name */}
      <div>
        <div style={labelStyle}>Nombre del restaurante</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ej. Daniel's Burger"
          style={formInput}
        />
      </div>

      {/* timezone */}
      <div>
        <div style={labelStyle}>Zona horaria</div>
        <input
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          placeholder="America/Bogota"
          className="cmd-num"
          style={formInput}
        />
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: 12 }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="cmd-btn red w-full"
        onClick={submit}
        disabled={!canSubmit}
        style={{ padding: "13px", fontSize: 14 }}
      >
        {pending || doneSlug ? "Creando…" : "Crear y entrar"}
      </button>
    </div>
  );
}
