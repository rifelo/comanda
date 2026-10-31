"use client";

import * as React from "react";
import { signInAsMember } from "./actions";
import { GoogleSignInButton } from "./google-signin-button";
import { PasswordForm } from "./password-form";

export type RosterTile = { id: string; name: string; initials: string };

/**
 * «¿Quién eres?» — the login on a paired device (tablet / register). The
 * device already fixed the sede; the person taps their tile and types their
 * password. «Otra cuenta» falls back to email + password for anyone not on
 * the roster (or a Google account with a password).
 */
export function TeamLogin({ roster, next }: { roster: RosterTile[]; next?: string }) {
  const [state, action, pending] = React.useActionState(signInAsMember, null);
  const [picked, setPicked] = React.useState<string | null>(roster.length === 1 ? roster[0].id : null);
  const [other, setOther] = React.useState(roster.length === 0);
  const pwRef = React.useRef<HTMLInputElement>(null);

  function pick(id: string) {
    setPicked(id);
    // Next thing they do is type the password.
    window.requestAnimationFrame(() => pwRef.current?.focus());
  }

  if (other) {
    return (
      <div className="flex flex-col gap-5">
        <PasswordForm next={next} autoFocus={roster.length > 0} />
        <div className="lg-sep">o</div>
        <GoogleSignInButton next={next} />
        {roster.length > 0 ? (
          <button type="button" className="lg-link inline-flex" onClick={() => setOther(false)}>
            ← Volver a las personas
          </button>
        ) : null}
      </div>
    );
  }

  const labels = tileLabels(roster);
  const pickedName = picked ? labels.get(picked) : undefined;
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5">
        <div className="lg-people" role="group" aria-label="Elige tu nombre">
          {roster.map((p) => (
            <button
              key={p.id}
              type="button"
              className="lg-person"
              aria-pressed={picked === p.id}
              onClick={() => pick(p.id)}
            >
              <span className="lg-avatar" aria-hidden>
                {p.initials}
              </span>
              <span className="lg-name">{labels.get(p.id)}</span>
            </button>
          ))}
        </div>
        {picked ? <input type="hidden" name="profileId" value={picked} /> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <label className="lg-fieldset">
          <span className="lg-label">{pickedName ? `Contraseña de ${pickedName}` : "Contraseña"}</span>
          <input
            ref={pwRef}
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
        <button type="submit" className="lg-btn lg" disabled={!picked || pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <GoogleSignInButton next={next} />
      <button type="button" className="lg-link inline-flex" onClick={() => setOther(true)}>
        Otra cuenta
      </button>
    </div>
  );
}

/** «Pipe Cipagauta» → «Pipe»; tiles are small and first names are how the team calls each other. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** First name, or «Jesus R.» when two people share it. */
function tileLabels(roster: RosterTile[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const p of roster) count.set(firstName(p.name).toLowerCase(), (count.get(firstName(p.name).toLowerCase()) ?? 0) + 1);
  return new Map(
    roster.map((p) => {
      const first = firstName(p.name);
      if ((count.get(first.toLowerCase()) ?? 0) < 2) return [p.id, first];
      const second = p.name.trim().split(/\s+/)[1];
      return [p.id, second ? `${first} ${second[0].toUpperCase()}.` : p.name];
    }),
  );
}
