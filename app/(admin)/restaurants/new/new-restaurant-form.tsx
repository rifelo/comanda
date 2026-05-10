"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRestaurant } from "./actions";

/**
 * Client wrapper around the createRestaurant Server Action. Mirrors the login
 * form's pattern: useTransition + manual error display + router.push on
 * success. Avoids the Server-Action-redirect-from-form failure mode where
 * Next 16 returns "unexpected response" after stale-action-ID HMR.
 */
export function NewRestaurantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createRestaurant(null, formData);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      router.push(`/restaurants/${r.id}`);
      router.refresh();
    });
  }

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
        disabled={pending}
      />

      <div>
        <UnderlinedField
          id="timezone"
          name="timezone"
          label="Zona horaria"
          required
          defaultValue="America/Bogota"
          placeholder="America/Bogota"
          disabled={pending}
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
        disabled={pending}
      >
        {pending ? "Creando…" : "Crear restaurante →"}
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
      <label
        htmlFor={id}
        className="text-muted block"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={{
          borderBottom: "1.5px solid var(--ink)",
          padding: "6px 0",
          marginTop: 4,
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
