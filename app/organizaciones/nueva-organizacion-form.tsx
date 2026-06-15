"use client";

/**
 * NuevaOrganizacionForm — inline "create your org" form on the selector.
 *
 * Modeled on app/(admin)/catalogo/nueva-categoria-form.tsx: a single field,
 * useTransition for the pending state, manual FormData, inline error in
 * var(--red). Enter submits, Esc clears the field.
 */
import * as React from "react";
import { createOrganization } from "./actions";

export function NuevaOrganizacionForm() {
  const [nombre, setNombre] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = nombre.trim();
    if (!trimmed) {
      setError("Requerido");
      return;
    }
    const fd = new FormData();
    fd.set("name", trimmed);
    setError(null);
    startTransition(async () => {
      // On success this redirects, so control never returns here.
      const r = await createOrganization(null, fd);
      if (r && !r.ok) {
        setError(r.error ?? "Algo salió mal.");
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setNombre("");
      setError(null);
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      style={{
        marginTop: 24,
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        padding: "14px 12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Nueva organización
      </div>

      <div>
        <label
          htmlFor="no-nombre"
          className="text-muted block"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Nombre de la organización *
        </label>
        <input
          id="no-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Daniel's Burger"
          disabled={pending}
          autoComplete="off"
          className="block w-full bg-transparent outline-none"
          style={{
            borderBottom: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
            padding: "4px 0",
            marginTop: 2,
            fontSize: 14,
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        {error ? (
          <p style={{ color: "var(--red)", fontSize: 11, marginTop: 4 }}>
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="cmd-btn"
        style={{ marginTop: 2 }}
      >
        {pending ? "Creando…" : "Crear organización"}
      </button>
    </div>
  );
}
