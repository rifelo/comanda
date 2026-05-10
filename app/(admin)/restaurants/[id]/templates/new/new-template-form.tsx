"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTemplate } from "./actions";

export function NewTemplateForm({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shift, setShift] = useState<"day" | "night">("day");

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set("restaurant_id", restaurantId);
    formData.set("shift", shift);
    startTransition(async () => {
      const r = await createTemplate(null, formData);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      router.push(`/templates/${r.id}`);
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
        label="Nombre de la plantilla"
        required
        maxLength={120}
        placeholder="Ej: Cajero · Turno Día"
        disabled={pending}
      />

      <div>
        <div
          className="text-muted block"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Turno
        </div>
        <div className="flex gap-2">
          {([
            ["day", "Día"],
            ["night", "Noche"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setShift(value)}
              disabled={pending}
              className={shift === value ? "cmd-btn" : "cmd-btn ghost"}
              style={{ flex: 1 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p
        className="text-muted"
        style={{ fontSize: 11, marginTop: 6 }}
      >
        La plantilla se crea vacía. Después podrás agregar las tareas desde el
        editor.
      </p>

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
        {pending ? "Creando…" : "Crear plantilla →"}
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
