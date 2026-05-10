"use client";

import { useState, useTransition } from "react";
import { signIn, signUpAdmin } from "./actions";

export function LoginForm({
  mode,
  next,
}: {
  mode: "signin" | "signup";
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = mode === "signup" ? signUpAdmin : signIn;
      const result = await action(formData, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-7">
      {mode === "signup" ? (
        <UnderlinedField
          id="full_name"
          name="full_name"
          label="Nombre completo"
          autoComplete="name"
          required
        />
      ) : null}

      <UnderlinedField
        id="email"
        name="email"
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
      />

      <UnderlinedField
        id="password"
        name="password"
        label="Contraseña"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        minLength={8}
      />

      {error ? (
        <p
          role="alert"
          style={{ color: "var(--red)", fontSize: 12, letterSpacing: "0.04em" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="cmd-btn red w-full"
        style={{ padding: "14px", fontSize: 13 }}
        disabled={pending}
      >
        {pending
          ? "Procesando…"
          : mode === "signup"
            ? "Crear organización →"
            : "Entrar al turno →"}
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
