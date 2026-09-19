"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/comanda/primitives";
import { signInTurno, signOutTurno } from "../auth-actions";

/**
 * Tablet sign-in: the sede is already known (device cookie); the person in
 * charge of the shift types their email + password. On success we only
 * `router.refresh()` — the page re-runs `loadTurnoGate()` and renders the
 * board (never `router.push` inside a transition).
 */
export function TurnoLogin({ sedeName, error: gateError }: { sedeName: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const ready = email.trim().length > 3 && password.length > 0 && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const r = await signInTurno({ email: email.trim(), password });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ width: "100%", maxWidth: 480, border: "1.5px solid var(--ink)", borderRadius: 10, background: "var(--paper-lt)", padding: "30px 32px 26px", boxShadow: "3px 3px 0 rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <Wordmark size={30} className="tracking-[-0.02em]" />
          <span className="text-muted" style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase" }}>{sedeName}</span>
        </div>
        <h1 className="font-slab" style={{ fontSize: 30, lineHeight: 1.05, margin: "18px 0 6px" }}>
          Turno<span style={{ color: "var(--red)" }}>.</span>
        </h1>
        <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Entra con tu correo y contraseña. Todo lo que marques queda a tu nombre hasta que cierres el turno.
        </p>

        {gateError && (
          <div role="alert" style={{ marginTop: 16, padding: "10px 12px", border: "1.5px solid var(--amber)", background: "color-mix(in srgb, var(--amber) 12%, transparent)", borderRadius: 6, fontSize: 12.5, lineHeight: 1.5 }}>
            {gateError}
            {/* Its own form: a nested <form> inside the login form is invalid HTML. */}
            <form action={signOutTurno} style={{ marginTop: 10 }}>
              <button type="submit" className="cmd-btn sm">Cerrar sesión</button>
            </form>
          </div>
        )}

        <form onSubmit={submit}>
        <label htmlFor="turno-email" className="text-muted" style={{ display: "block", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", marginTop: 22, marginBottom: 6 }}>
          Correo
        </label>
        <input
          id="turno-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          placeholder="tu@correo.com"
          style={inputStyle(!!error)}
        />

        <label htmlFor="turno-password" className="text-muted" style={{ display: "block", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", marginTop: 16, marginBottom: 6 }}>
          Contraseña
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="turno-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            style={{ ...inputStyle(!!error), paddingRight: 84 }}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", height: 36, padding: "0 10px", border: "1px solid var(--rule)", borderRadius: 3, background: "transparent", color: "var(--ink-2)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", minHeight: 0 }}
          >
            {show ? "ocultar" : "ver"}
          </button>
        </div>

        {error && (
          <p role="alert" style={{ color: "var(--red)", fontSize: 12.5, marginTop: 12, letterSpacing: ".02em" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={!ready} className="cmd-btn red" style={{ width: "100%", height: 60, fontSize: 15, marginTop: 20 }}>
          {pending ? "Entrando…" : "Entrar →"}
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <span className="text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>¿Sin contraseña? Pídesela al administrador.</span>
          <Link href="/login?next=/turno" className="cmd-link" style={{ fontSize: 11 }}>Entrar con Google</Link>
        </div>
        </form>
      </div>
    </main>
  );
}

function inputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 56,
    fontFamily: "var(--font-mono)",
    fontSize: 18,
    padding: "0 14px",
    border: `1.5px solid ${invalid ? "var(--red)" : "var(--ink)"}`,
    borderRadius: 4,
    background: "var(--paper)",
    color: "var(--ink)",
    outline: "none",
  };
}
