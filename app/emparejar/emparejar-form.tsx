"use client";

import * as React from "react";
import { emparejarDispositivo } from "./actions";

/**
 * Pairing form (formerly the /pos register screen). The person types the
 * 8-character code the owner generated in Ajustes → Dispositivos; on success
 * the server redirects to /login, which now shows the team's tiles.
 */
export function EmparejarForm() {
  const [state, action, pending] = React.useActionState(emparejarDispositivo, null);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const display = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  const ready = clean.length === 8 && !pending;

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="lg-muted lg-small">
        Escribe el código que el dueño genera en el panel, sección <b>Dispositivos</b>. Cada código sirve una sola vez.
      </p>
      <label className="lg-fieldset">
        <span className="lg-label">Código de registro</span>
        <input
          name="code"
          value={display}
          onChange={(e) => setCode(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          placeholder="ABCD-1234"
          aria-label="Código de registro"
          className="lg-field code"
          aria-invalid={state?.error ? true : undefined}
        />
      </label>
      <label className="lg-fieldset">
        <span className="lg-label">Nombre de este dispositivo (opcional)</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Caja 1 · Tablet barra"
          aria-label="Nombre del dispositivo"
          className="lg-field"
        />
      </label>
      {state?.error ? (
        <p role="alert" className="lg-alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={!ready} className="lg-btn lg">
        {pending ? "Validando…" : "Emparejar"}
      </button>
    </form>
  );
}
