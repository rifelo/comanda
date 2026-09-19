"use client";

import { useActionState } from "react";
import { signInWithPassword } from "./actions";

/**
 * Email + password sign-in for staff who got their password from the admin
 * (Configuración → Equipo). A plain form action: on success the server
 * `redirect()`s, on failure it returns the message to show.
 */
export function PasswordForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  const input: React.CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: 16,
    padding: "12px 12px",
    border: `1px solid ${state?.error ? "var(--red)" : "var(--ink)"}`,
    background: "var(--paper)",
    color: "var(--ink)",
    outline: "none",
    borderRadius: 2,
  };
  return (
    <form action={action} className="space-y-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input
        name="email"
        type="email"
        required
        inputMode="email"
        autoCapitalize="none"
        autoComplete="username"
        placeholder="correo"
        aria-label="Correo"
        style={input}
      />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="contraseña"
        aria-label="Contraseña"
        style={input}
      />
      {state?.error ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: 12, letterSpacing: "0.04em" }}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="cmd-btn w-full" style={{ padding: 14, fontSize: 13 }}>
        {pending ? "Entrando…" : "Entrar con contraseña"}
      </button>
    </form>
  );
}
