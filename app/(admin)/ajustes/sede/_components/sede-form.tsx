"use client";

import * as React from "react";
import { updateSede } from "../_actions";
import { Button, Field } from "@/components/ui";

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

  const initial1 = (name[0] ?? "C").toUpperCase();

  return (
    <div className="flex flex-col gap-5">
      <Field label="Nombre de la sede" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la sede" />

      <div className="flex flex-col gap-2">
        <span className="ui-label">Logo</span>
        <div className="flex items-center gap-4">
          <div className="size-[84px] shrink-0 rounded-card border border-line bg-surface-2 overflow-hidden flex items-center justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo de la sede" className="size-full object-cover" />
            ) : (
              <span className="text-[34px] font-bold text-muted">{initial1}</span>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onLogo} className="hidden" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                {logoUrl ? "Cambiar imagen" : "Subir imagen"}
              </Button>
              {logoUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                  Quitar
                </Button>
              ) : null}
            </div>
            <p className="ui-sub m-0 text-[13px]">PNG o JPG, cuadrada. Aparece en los reportes.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-line pt-5">
        <Field label="Zona horaria" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Bogota" autoCapitalize="none" />
        <Field label="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="COP" autoCapitalize="characters" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} loading={pending}>
          Guardar
        </Button>
        {saved ? <span className="text-ok font-semibold">✓ Cambios guardados</span> : null}
        {error ? (
          <span role="alert" className="text-late font-semibold">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
