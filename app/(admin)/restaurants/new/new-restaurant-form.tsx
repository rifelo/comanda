"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRestaurant } from "./actions";

/**
 * Client wrapper around the createRestaurant Server Action. Mirrors the login
 * form's pattern: useTransition + manual error display + router.push on
 * success. Avoids the Server-Action-redirect-from-form failure mode where
 * Next 16 returns "unexpected response" after stale-action-ID HMR.
 *
 * Navigation happens in a useEffect rather than inside startTransition —
 * Next 16 + React 19 keeps the transition pending when router.push runs
 * inside it (the navigation never settles), so the button used to lock
 * on "Creando…" forever even when the action returned 200.
 */
export function NewRestaurantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [redirectId, setRedirectId] = useState<string | null>(null);

  useEffect(() => {
    if (redirectId) router.push(`/restaurants/${redirectId}`);
  }, [redirectId, router]);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createRestaurant(null, formData);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      setRedirectId(r.id ?? null);
    });
  }

  const busy = pending || !!redirectId;

  return (
    <form
      action={onSubmit}
      className="space-y-7"
      style={{ padding: "24px 32px", maxWidth: 460 }}
    >
      <UnderlinedField
        id="name"
        name="name"
        label="Nombre"
        required
        maxLength={120}
        placeholder="Ej: Sede Norte"
        disabled={busy}
      />

      <div>
        <UnderlinedSelect
          id="timezone"
          name="timezone"
          label="Zona horaria"
          required
          defaultValue="America/Bogota"
          disabled={busy}
          options={TIMEZONE_OPTIONS}
        />
        <p
          className="text-muted"
          style={{ fontSize: 11, marginTop: 6 }}
        >
          Determina cuándo se generan los turnos diarios.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          style={{
            color: "var(--red)",
            fontSize: 12,
            letterSpacing: "0.04em",
          }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="cmd-btn red"
        style={{ padding: "12px 18px" }}
        disabled={busy}
      >
        {busy ? "Creando…" : "Crear restaurante →"}
      </button>
    </form>
  );
}

function UnderlinedField({
  id,
  name,
  label,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={name}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={fieldStyle}
      />
    </div>
  );
}

function UnderlinedSelect({
  id,
  name,
  label,
  options,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
  options: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={{ ...fieldStyle, cursor: "pointer" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-muted block"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

const fieldStyle: React.CSSProperties = {
  borderBottom: "1.5px solid var(--ink)",
  padding: "6px 0",
  marginTop: 4,
  fontSize: 15,
  color: "var(--ink)",
  fontFamily: "inherit",
};

// Curated to the regions co-manda actually serves. IANA names submitted
// to the DB; the human label shows country + UTC offset hint for clarity.
// Bogotá first because it's the canonical default + the source of the
// FO-DB-05 paper sheet.
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/Bogota", label: "Colombia · Bogotá (UTC−5)" },
  { value: "America/Mexico_City", label: "México · Ciudad de México (UTC−6)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina · Buenos Aires (UTC−3)" },
  { value: "America/Sao_Paulo", label: "Brasil · São Paulo (UTC−3)" },
  { value: "America/Santiago", label: "Chile · Santiago (UTC−4)" },
  { value: "America/Lima", label: "Perú · Lima (UTC−5)" },
  { value: "America/Caracas", label: "Venezuela · Caracas (UTC−4)" },
  { value: "America/Guayaquil", label: "Ecuador · Guayaquil (UTC−5)" },
  { value: "America/La_Paz", label: "Bolivia · La Paz (UTC−4)" },
  { value: "America/Asuncion", label: "Paraguay · Asunción (UTC−4)" },
  { value: "America/Montevideo", label: "Uruguay · Montevideo (UTC−3)" },
  { value: "America/Panama", label: "Panamá (UTC−5)" },
  { value: "America/Costa_Rica", label: "Costa Rica (UTC−6)" },
  { value: "America/Guatemala", label: "Guatemala (UTC−6)" },
  { value: "America/El_Salvador", label: "El Salvador (UTC−6)" },
  { value: "America/Tegucigalpa", label: "Honduras · Tegucigalpa (UTC−6)" },
  { value: "America/Managua", label: "Nicaragua · Managua (UTC−6)" },
  { value: "America/Havana", label: "Cuba · La Habana (UTC−5)" },
  { value: "America/Santo_Domingo", label: "República Dominicana (UTC−4)" },
  { value: "America/Puerto_Rico", label: "Puerto Rico (UTC−4)" },
  { value: "Europe/Madrid", label: "España · Madrid (UTC+1)" },
  { value: "America/New_York", label: "EE. UU. · Este (UTC−5)" },
  { value: "America/Los_Angeles", label: "EE. UU. · Oeste (UTC−8)" },
];
