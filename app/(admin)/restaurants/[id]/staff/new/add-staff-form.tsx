"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStaffMember } from "./actions";

export function AddStaffForm({
  restaurantId,
  restaurantName,
  adminEmail,
}: {
  restaurantId: string;
  restaurantName: string;
  adminEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reused: boolean; email: string } | null>(
    null,
  );

  function onSubmit(formData: FormData) {
    setError(null);
    setDone(null);
    formData.set("restaurant_id", restaurantId);
    const email = String(formData.get("email") ?? "").trim();
    startTransition(async () => {
      const r = await addStaffMember(null, formData);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      setDone({ reused: !!r.reused, email });
      router.refresh();
    });
  }

  if (done) {
    const isSelfAdd =
      done.reused &&
      adminEmail &&
      done.email.toLowerCase() === adminEmail.toLowerCase();
    return (
      <div style={{ padding: "24px 32px", maxWidth: 520 }}>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          {isSelfAdd
            ? `Listo. Ahora también apareces en el equipo de ${restaurantName} — encontrarás sus turnos en "Mi turno".`
            : done.reused
              ? `${done.email} ya existía en tu organización — ahora también tiene acceso a ${restaurantName}.`
              : `Listo. Pídele a ${done.email} que entre a ${typeof window !== "undefined" ? window.location.origin : ""} e inicie sesión con Google usando ese mismo correo.`}
        </p>
        <div className="flex gap-2" style={{ marginTop: 18 }}>
          <button
            type="button"
            className="cmd-btn ghost"
            onClick={() => router.push(`/restaurants/${restaurantId}`)}
          >
            ← Volver al restaurante
          </button>
          <button
            type="button"
            className="cmd-btn"
            onClick={() => setDone(null)}
          >
            Agregar otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={onSubmit}
      className="space-y-7"
      style={{ padding: "24px 32px", maxWidth: 460 }}
    >
      <UnderlinedField
        id="full_name"
        name="full_name"
        label="Nombre completo"
        required
        maxLength={120}
        placeholder="Ej: Mariana Castaño"
        autoComplete="name"
        disabled={pending}
      />

      <div>
        <UnderlinedField
          id="email"
          name="email"
          type="email"
          label="Correo Google"
          required
          maxLength={120}
          placeholder="cajero@gmail.com"
          autoComplete="off"
          inputMode="email"
          disabled={pending}
        />
        <p
          className="text-muted"
          style={{ fontSize: 11, marginTop: 6 }}
        >
          Tiene que ser el mismo correo con el que el staff inicia sesión en
          Google.
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
        {pending ? "Agregando…" : "Agregar al equipo →"}
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
