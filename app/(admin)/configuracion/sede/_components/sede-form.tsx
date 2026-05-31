"use client";

import * as React from "react";
import { updateSede } from "../_actions";

type Initial = {
  name: string;
  logo_url: string | null;
  timezone: string;
  currency: string;
};

/**
 * Sede settings form. Logo upload is stored as a dataURL in `restaurants.logo_url`
 * (a TEXT column) — no Supabase Storage bucket dependency. dataURLs work for
 * small PNG/JPG logos; if the dataURL exceeds Postgres' practical TEXT limits
 * we can move to a `logos` bucket without changing this UI.
 */
export function SedeForm({ initial }: { initial: Initial }) {
  const [name, setName] = React.useState(initial.name);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(initial.logo_url);
  const [timezone, setTimezone] = React.useState(initial.timezone);
  const [currency, setCurrency] = React.useState(initial.currency);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setLogoUrl(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(f);
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateSede({
        name: name.trim(),
        logo_url: logoUrl,
        timezone: timezone.trim(),
        currency: currency.trim(),
      });
      if ("error" in r && r.error) setError(r.error);
      else setSaved(true);
    });
  }

  const formInput: React.CSSProperties = {
    fontSize: 13,
    border: "1px solid var(--ink)",
    background: "var(--paper)",
    padding: "9px 11px",
    color: "var(--ink)",
    outline: "none",
    borderRadius: 2,
    width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 8,
    display: "block",
  };

  const initial1 = (name[0] ?? "D").toUpperCase();

  return (
    <div>
      <label style={labelStyle}>Nombre del restaurante</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la sede"
        style={{ ...formInput, fontSize: 16 }}
      />

      <div style={{ marginTop: 26 }}>
        <label style={labelStyle}>Logo / imagen</label>
        <div className="flex items-center" style={{ gap: 18 }}>
          <div
            className="flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{
              width: 84,
              height: 84,
              border: "1.5px solid var(--ink)",
              background: "var(--paper-lt)",
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="logo"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                className="font-slab"
                style={{ fontSize: 34, color: "var(--muted)" }}
              >
                {initial1}
              </span>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={onLogo}
              style={{ display: "none" }}
            />
            <div className="flex" style={{ gap: 8 }}>
              <button
                type="button"
                className="cmd-btn sm"
                onClick={() => fileRef.current?.click()}
              >
                {logoUrl ? "Cambiar imagen" : "Subir imagen"}
              </button>
              {logoUrl ? (
                <button
                  type="button"
                  className="cmd-btn ghost sm"
                  onClick={() => setLogoUrl(null)}
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <div
              className="text-muted"
              style={{ fontSize: 10, marginTop: 8, lineHeight: 1.5 }}
            >
              PNG o JPG, cuadrada.
              <br />
              Aparece en el menú lateral y en los reportes.
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid"
        style={{
          marginTop: 26,
          paddingTop: 20,
          borderTop: "1px dashed var(--rule)",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Zona horaria</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/Bogota"
            style={formInput}
          />
        </div>
        <div>
          <label style={labelStyle}>Moneda</label>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="COP"
            style={formInput}
          />
        </div>
      </div>

      <div
        className="flex items-center"
        style={{ marginTop: 22, gap: 14, minHeight: 22 }}
      >
        <button
          type="button"
          className="cmd-btn red sm"
          onClick={save}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved ? (
          <span style={{ color: "var(--green)", fontSize: 12 }}>
            ✓ Cambios guardados
          </span>
        ) : null}
        {error ? (
          <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}
