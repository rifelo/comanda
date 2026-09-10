"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/comanda/primitives";
import { registrarPos } from "./actions";

/**
 * Pairing screen shown at /pos when the device has no valid device cookie and
 * nobody is signed in. The cashier types the 8-character code an admin
 * generated in Configuración → Punto de venta; on success the page refreshes
 * and the server renders the terminal.
 */
export function PosRegister() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const display = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  const ready = clean.length === 8 && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const res = await registrarPos({ code: clean, name: name.trim() || undefined });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main
      className="cmd-paper"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 460,
          border: "1.5px solid var(--ink)",
          background: "var(--paper-lt)",
          padding: "32px 34px 28px",
        }}
      >
        <Wordmark size={40} className="tracking-[-0.02em]" />
        <div
          className="text-muted"
          style={{ fontSize: 10, letterSpacing: "0.18em", marginTop: 10, textTransform: "uppercase" }}
        >
          Punto de venta · registrar dispositivo
        </div>
        <h1 className="font-slab" style={{ fontSize: 26, margin: "14px 0 6px", lineHeight: 1.1 }}>
          Vincula esta caja a tu cuenta
        </h1>
        <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, letterSpacing: "0.02em" }}>
          Escribe el código de registro que aparece en{" "}
          <b style={{ color: "var(--ink)" }}>Configuración → Punto de venta</b>.
          Cada código sirve una sola vez.
        </p>

        <label
          className="text-muted"
          style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 22, marginBottom: 6 }}
        >
          Código de registro
        </label>
        <input
          ref={inputRef}
          value={display}
          onChange={(e) => setCode(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-1234"
          aria-label="Código de registro"
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 30,
            letterSpacing: "0.22em",
            textAlign: "center",
            textTransform: "uppercase",
            padding: "14px 12px",
            border: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
            background: "var(--paper)",
            color: "var(--ink)",
            outline: "none",
          }}
        />

        <label
          className="text-muted"
          style={{ display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 18, marginBottom: 6 }}
        >
          Nombre de esta caja <span style={{ opacity: 0.6 }}>(opcional)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Caja 1 · Barra · Domicilios"
          aria-label="Nombre de la caja"
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            padding: "10px 12px",
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            color: "var(--ink)",
            outline: "none",
          }}
        />

        {error ? (
          <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 14, letterSpacing: "0.02em" }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!ready}
          className="cmd-btn"
          style={{
            width: "100%",
            marginTop: 20,
            padding: "13px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            border: "1.5px solid var(--ink)",
            background: ready ? "var(--ink)" : "transparent",
            color: ready ? "var(--paper-lt)" : "var(--muted)",
            cursor: ready ? "pointer" : "default",
          }}
        >
          {pending ? "Validando…" : "Registrar caja"}
        </button>

        <p className="text-muted" style={{ fontSize: 10, letterSpacing: "0.04em", marginTop: 16, lineHeight: 1.5 }}>
          ¿Eres administrador? Inicia sesión en{" "}
          <a href="/login?next=/pos" style={{ color: "var(--ink)", textDecoration: "underline" }}>
            /login
          </a>{" "}
          para abrir el punto de venta con tu cuenta.
        </p>
      </form>
    </main>
  );
}
