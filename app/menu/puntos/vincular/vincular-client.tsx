"use client";

import * as React from "react";
import { vincular, type VincularState } from "./actions";

const INICIAL: VincularState = { error: null, valor: "", listo: null };

/**
 * The form of the link page. With a verified @ on this phone: one button.
 * Otherwise the customer types their @ (same field as «Ver mis puntos»).
 */
export function Vincular({ token, fin, verificado, sugerido }: { token: string; fin: string; verificado: string | null; sugerido: string | null }) {
  const [state, action, pending] = React.useActionState<VincularState, FormData>(vincular, INICIAL);
  const [escribir, setEscribir] = React.useState(!verificado);
  const [usuario, setUsuario] = React.useState(verificado ? "" : (sugerido ?? ""));

  if (state.listo) {
    return (
      <div className="pyy-entrar">
        <h1 className="pyy-entrar__title">¡Listo, @{state.listo}!</h1>
        <p>
          Tu WhatsApp ({fin}) quedó vinculado. <strong>Ya puedes preguntarnos por WhatsApp cuántos puntos llevas</strong> o qué premio te alcanza.
        </p>
        <a href="/menu/puntos" className="pyy-btn pyy-btn--amarillo" style={{ marginTop: 4 }}>
          Ver mis puntos
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="pyy-entrar">
      <input type="hidden" name="t" value={token} />
      {verificado && !escribir ? (
        <>
          <input type="hidden" name="modo" value="verificado" />
          <h1 className="pyy-entrar__title">Vincular tu WhatsApp con @{verificado}</h1>
          <p>
            Así te contestamos por WhatsApp ({fin}) <strong>cuántos puntos llevas, qué premio te alcanza y qué has pedido.</strong>
          </p>
        </>
      ) : (
        <>
          <h1 className="pyy-entrar__title">Vincular tu WhatsApp</h1>
          <p>
            Escribe tu usuario de Instagram y te contestamos por WhatsApp ({fin}) <strong>cuántos puntos llevas y qué premio te alcanza.</strong>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <label htmlFor="ig" className="pyy-label">
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
              El mismo usuario que escribes cuando escaneas el QR de tu vaso, sin la @.
            </span>
          </div>
        </>
      )}
      {state.error && (
        <p role="alert" className="pyy-error">
          {state.error}
        </p>
      )}
      <button type="submit" className="pyy-btn pyy-btn--amarillo" style={{ marginTop: 4 }} disabled={pending || (escribir && !usuario.trim())}>
        {pending ? "Vinculando…" : "Vincular mi WhatsApp"}
      </button>
      {verificado && !escribir && (
        <button type="button" className="pyy-link" onClick={() => setEscribir(true)}>
          No soy @{verificado} · usar otro usuario
        </button>
      )}
    </form>
  );
}
