"use client";

import * as React from "react";
import { verPuntos, type PuntosResult } from "./actions";

const ART = "/menu/art";
/** The menu lives at the root of the café's own domain, whatever host served this page. */
const MENU = "https://cafepayo.com";
/** The last handle checked on this phone, so coming back shows the balance at once. */
const RECUERDO = "pym:instagram";

const leer = () => {
  try {
    return window.localStorage.getItem(RECUERDO) ?? "";
  } catch {
    return "";
  }
};
const guardar = (v: string | null) => {
  try {
    if (v) window.localStorage.setItem(RECUERDO, v);
    else window.localStorage.removeItem(RECUERDO);
  } catch {
    /* private mode: nothing to remember */
  }
};

type Saldo = Extract<PuntosResult, { ok: true }>;

export function PuntosClient({ pesosPorPunto }: { pesosPorPunto: number }) {
  const [usuario, setUsuario] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saldo, setSaldo] = React.useState<Saldo | null>(null);

  async function consultar(handle: string) {
    setBusy(true);
    setError(null);
    let res: PuntosResult;
    try {
      res = await verPuntos({ instagram: handle });
    } catch {
      res = { ok: false, error: "No pudimos consultar tus puntos. Revisa tu conexión e intenta de nuevo." };
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.ultimaVisita) guardar(res.instagram);
    setSaldo(res);
  }

  // Coming back on the same phone: show the balance without asking again.
  React.useEffect(() => {
    const antes = leer();
    if (!antes) return;
    let vigente = true;
    verPuntos({ instagram: antes })
      .then((res) => {
        if (!vigente || !res.ok || !res.ultimaVisita) return;
        setUsuario(res.instagram);
        setSaldo(res);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  function otraCuenta() {
    guardar(null);
    setSaldo(null);
    setUsuario("");
    setError(null);
  }

  const pesos = `$${pesosPorPunto.toLocaleString("es-CO")}`;
  return (
    <div className="pym-page pyc-page">
      <header className="pyc-head">
        <a href={MENU} aria-label="Ir al menú de Café Pa' Yo" className="pyp-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/cafe-payo-logo-principal.svg`} alt="Café Pa' Yo" className="pyc-head__logo" />
        </a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/mano-taza.svg`} alt="" className="pym-art pyc-head__art" />
      </header>

      <main className="pyc-main">
        {saldo ? (
          <section className="pyc-step" aria-live="polite">
            <h1 className="pyc-title">{saldo.ultimaVisita ? "Tus puntos" : "Aún no tienes puntos"}</h1>
            {saldo.ultimaVisita ? (
              <div className="pyp-saldo">
                <span className="pyp-saldo__n">{saldo.puntos.toLocaleString("es-CO")}</span>
                <span className="pyp-saldo__t">{saldo.puntos === 1 ? "punto" : "puntos"}</span>
                <span className="pyp-saldo__meta">
                  @{saldo.instagram} · última visita el {saldo.ultimaVisita}
                </span>
              </div>
            ) : (
              <p className="pyc-text">
                Con <strong>@{saldo.instagram}</strong> todavía no hemos sumado nada. Escanea el QR de tu vaso, califícanos y escribe
                tu usuario: así empiezas a sumar.
              </p>
            )}
            <p className="pyc-text">
              Cada {pesos} que compras es 1 punto. Los sumas cuando calificas tu café con el QR del vaso.
            </p>
            <div className="pyc-actions">
              <a href={MENU} className="pym-pill pym-pill--wide pym-pill--solid">
                Ver el menú
              </a>
              <button type="button" className="pyc-back" onClick={otraCuenta}>
                Consultar otro usuario
              </button>
            </div>
          </section>
        ) : (
          <section className="pyc-step" aria-labelledby="pyp-q">
            <h1 id="pyp-q" className="pyc-title">Mis puntos</h1>
            <p className="pyc-text">
              Escribe tu usuario de Instagram y mira cuántos puntos llevas. Cada {pesos} que compras es 1 punto.
            </p>
            <form
              className="pyc-actions"
              onSubmit={(e) => {
                e.preventDefault();
                if (usuario.trim() && !busy) void consultar(usuario.trim());
              }}
            >
              <label className="pyc-user">
                <span aria-hidden="true" className="pyc-user__at">
                  @
                </span>
                <input
                  className="pyc-input pyc-user__input"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value.replace(/^@+/, ""));
                    setError(null);
                  }}
                  maxLength={60}
                  placeholder="tu.usuario"
                  aria-label="Tu usuario de Instagram"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              </label>
              {error && (
                <p role="alert" className="pyc-error">
                  {error}
                </p>
              )}
              <button type="submit" className="pym-pill pym-pill--wide pym-pill--solid" disabled={busy || !usuario.trim()}>
                {busy ? "Consultando…" : "Ver mis puntos"}
              </button>
              <a href={MENU} className="pyc-back">
                Volver al menú
              </a>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
