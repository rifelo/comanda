"use client";

import { useActionState } from "react";
import { signInWithPassword } from "./actions";

/**
 * Email + password sign-in (password set by the owner in Equipo). A plain
 * form action: on success the server `redirect()`s, on failure it returns
 * the message. (React 19 resets the form after the action: both fields come
 * back empty after a wrong password.)
 */
export function PasswordForm({ next, submitLabel = "Entrar", autoFocus = false }: { next?: string; submitLabel?: string; autoFocus?: boolean }) {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="lg-fieldset">
        <span className="lg-label">Correo</span>
        <input
          name="email"
          type="email"
          required
          inputMode="email"
          autoCapitalize="none"
          autoComplete="username"
          autoFocus={autoFocus}
          className="lg-field"
          aria-invalid={state?.error ? true : undefined}
        />
      </label>
      <label className="lg-fieldset">
        <span className="lg-label">Contraseña</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="lg-field"
          aria-invalid={state?.error ? true : undefined}
        />
      </label>
      {state?.error ? (
        <p role="alert" className="lg-alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="lg-btn">
        {pending ? "Entrando…" : submitLabel}
      </button>
    </form>
  );
}
