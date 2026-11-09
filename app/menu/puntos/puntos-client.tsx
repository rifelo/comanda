"use client";

import * as React from "react";
import { entrar, type EntrarState } from "./actions";

const HOME = "https://cafepayo.com";
const LOGO = "/brand/payo-mark.svg";

/** «Mis puntos — entrar con Instagram»: the first screen of Mi Pa'Yo. */
export function Entrar({ pesosPorPunto, ir }: { pesosPorPunto: number; ir: string | null }) {
  const [state, action, pending] = React.useActionState<EntrarState, FormData>(entrar, { error: null, valor: "" });
  const [usuario, setUsuario] = React.useState(state.valor);
  const pesos = `$${pesosPorPunto.toLocaleString("es-CO")}`;
  return (
    <div className="pyy">
      <div className="pyy-banda pyy-banda--entrar">
        <div className="pyy-banda__top">
          <a href={HOME} aria-label="Café Pa' Yo, ir al inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Café Pa' Yo" />
          </a>
          <a href="/menu" className="pyy-pill" style={{ padding: "8px 14px" }}>
            Ver el menú
          </a>
        </div>
        <div className="pyy-banda__sol" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/menu/art/mano-taza.svg" alt="" className="pyy-banda__mano" />
      </div>
      <form action={action} className="pyy-entrar">
        {ir && <input type="hidden" name="ir" value={ir} />}
        <h1 className="pyy-entrar__title">Mira cuántos puntos llevas</h1>
        <p>
          Escribe tu usuario de Instagram. <strong>Cada {pesos} que compras es 1 punto.</strong>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          <label htmlFor="ig" className="pyy-label">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
            </svg>
            Tu usuario de Instagram
          </label>
          <div className="pyy-campo">
            <span aria-hidden="true">@</span>
            <input
              id="ig"
              name="instagram"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value.replace(/^@+/, ""))}
              maxLength={60}
              placeholder="tu.usuario.de.instagram"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby="ig-ayuda"
            />
          </div>
          <span id="ig-ayuda" className="pyy-meta--s">
            Escríbelo tal como aparece en tu perfil, sin la @. Es el mismo usuario que escribes cuando escaneas el QR de tu vaso.
          </span>
        </div>
        {state.error && (
          <p role="alert" className="pyy-error">
            {state.error}
          </p>
        )}
        <button type="submit" className="pyy-btn pyy-btn--amarillo" style={{ marginTop: 4 }} disabled={pending || !usuario.trim()}>
          {pending ? "Entrando…" : "Ver mis puntos"}
        </button>
        <div className="pyy-firma">
          <span>Tómalo con calma. O con doble shot.</span>
          <span className="pyy-meta--s">Síguenos en @cafepayo</span>
        </div>
      </form>
    </div>
  );
}
