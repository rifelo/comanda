"use client";

import * as React from "react";
import { tuPedido, type EstadoEnlace, type ItemCalificado } from "@/lib/calificaciones/calificaciones";
import { calificar } from "./actions";

const ART = "/menu/art";
/** The menu lives at the root of the café's own domain, whatever host served this page. */
const MENU = "https://cafepayo.com";
const PALABRA = ["", "Mal", "Regular", "Bien", "Muy bien", "Excelente"];
/** Seconds the thank-you stays before Instagram opens. */
const ESPERA = 5;

type Paso = "estrellas" | "sugerencia" | "puntos" | "gracias";

const Estrella = ({ on, size = 44 }: { on: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

export function CalificaClient({ codigo, estado, items, puntos, instagram }: {
  codigo: string;
  estado: EstadoEnlace;
  items: ItemCalificado[];
  /** Points this purchase earns with an @. */
  puntos: number;
  /** The shop's Instagram handle. */
  instagram: string | null;
}) {
  const [paso, setPaso] = React.useState<Paso>("estrellas");
  const [estrellas, setEstrellas] = React.useState(0);
  const [sugerencia, setSugerencia] = React.useState("");
  const [usuario, setUsuario] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cerrado, setCerrado] = React.useState<EstadoEnlace | null>(estado === "valido" ? null : estado);
  const [ganados, setGanados] = React.useState<{ puntos: number; total: number | null } | null>(null);
  const ig = instagram ? `https://www.instagram.com/${instagram}` : null;
  const pedido = tuPedido(items);

  async function enviar(conUsuario: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    let res: Awaited<ReturnType<typeof calificar>>;
    try {
      res = await calificar({ codigo, estrellas, sugerencia: sugerencia.trim() || undefined, instagram: conUsuario ? usuario.trim() || undefined : undefined });
    } catch {
      res = { ok: false, error: "No pudimos enviar tu calificación. Revisa tu conexión e intenta de nuevo." };
    }
    setBusy(false);
    if (!res.ok) {
      if (res.estado && res.estado !== "valido") setCerrado(res.estado);
      else setError(res.error);
      return;
    }
    setGanados({ puntos: res.puntos, total: res.total });
    setPaso("gracias");
  }

  if (cerrado) return <Cerrado estado={cerrado} ig={ig} instagram={instagram} />;
  if (paso === "gracias") return <Gracias estrellas={estrellas} ganados={ganados} conSugerencia={sugerencia.trim().length > 0} pedido={pedido} ig={ig} instagram={instagram} />;

  const n = paso === "estrellas" ? 1 : paso === "sugerencia" ? 2 : 3;
  return (
    <div className="pym-page pyc-page">
      <header className="pyc-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/cafe-payo-logo-principal.svg`} alt="Café Pa' Yo" className="pyc-head__logo" />
        <ol className="pyc-dots" aria-label={`Paso ${n} de 3`}>
          {[1, 2, 3].map((i) => <li key={i} className={i <= n ? "pyc-dot pyc-dot--on" : "pyc-dot"} />)}
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/mano-taza.svg`} alt="" className="pym-art pyc-head__art" />
      </header>

      <main className="pyc-main">
        {paso === "estrellas" && (
          <section className="pyc-step" aria-labelledby="pyc-q1">
            <h1 id="pyc-q1" className="pyc-title">¿Cómo estuvo {pedido}?</h1>
            <p className="pyc-text">Toca las estrellas. Nos toma diez segundos y nos ayuda un montón.</p>
            <div role="radiogroup" aria-label="Calificación de 1 a 5 estrellas" className="pyc-stars">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={estrellas === v} aria-label={`${v} ${v === 1 ? "estrella" : "estrellas"}: ${PALABRA[v]}`} className={v <= estrellas ? "pyc-star pyc-star--on" : "pyc-star"} onClick={() => setEstrellas(v)}>
                  <Estrella on={v <= estrellas} />
                </button>
              ))}
            </div>
            <p className="pyc-word" aria-live="polite">{PALABRA[estrellas] || " "}</p>
            <button type="button" className="pym-pill pym-pill--wide pym-pill--solid pyc-cta" disabled={estrellas === 0} onClick={() => setPaso("sugerencia")}>Continuar</button>
          </section>
        )}

        {paso === "sugerencia" && (
          <section className="pyc-step" aria-labelledby="pyc-q2">
            <h1 id="pyc-q2" className="pyc-title">{estrellas <= 3 ? "¿Qué podemos mejorar?" : "¿Algo que quieras contarnos?"}</h1>
            <p className="pyc-text">Es opcional. Lo lee quien prepara tu café.</p>
            <textarea className="pyc-input pyc-textarea" value={sugerencia} onChange={(e) => setSugerencia(e.target.value)} maxLength={500} rows={4} placeholder="Tu sugerencia…" aria-label="Tu sugerencia (opcional)" autoFocus />
            <div className="pyc-actions">
              <button type="button" className="pym-pill pym-pill--wide pym-pill--solid" onClick={() => setPaso("puntos")}>{sugerencia.trim() ? "Continuar" : "Saltar"}</button>
              <button type="button" className="pyc-back" onClick={() => setPaso("estrellas")}>Volver</button>
            </div>
          </section>
        )}

        {paso === "puntos" && (
          <section className="pyc-step" aria-labelledby="pyc-q3">
            <h1 id="pyc-q3" className="pyc-title">Acumula puntos y guarda tu café</h1>
            <p className="pyc-text">
              Escribe tu usuario de Instagram y {puntos > 0 ? <>sumas <strong>{puntos} {puntos === 1 ? "punto" : "puntos"}</strong> con este pedido</> : "empiezas a sumar puntos"}. Guardamos {pedido === "tu pedido" ? "lo que pediste" : pedido} para la próxima.
            </p>
            <label className="pyc-user">
              <span aria-hidden="true" className="pyc-user__at">@</span>
              <input className="pyc-input pyc-user__input" value={usuario} onChange={(e) => { setUsuario(e.target.value.replace(/^@+/, "")); setError(null); }} maxLength={60} placeholder="tu.usuario" aria-label="Tu usuario de Instagram (opcional)" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" enterKeyHint="send" onKeyDown={(e) => { if (e.key === "Enter" && usuario.trim()) void enviar(true); }} />
            </label>
            {error && <p role="alert" className="pyc-error">{error}</p>}
            <div className="pyc-actions">
              <button type="button" className="pym-pill pym-pill--wide pym-pill--solid" disabled={busy || !usuario.trim()} onClick={() => void enviar(true)}>{busy ? "Enviando…" : "Enviar y sumar puntos"}</button>
              <button type="button" className="pym-pill pym-pill--wide" disabled={busy} onClick={() => void enviar(false)}>Enviar sin puntos</button>
              <button type="button" className="pyc-back" disabled={busy} onClick={() => setPaso("sugerencia")}>Volver</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** The animated goodbye: thanks, what was earned, and on to Instagram. */
function Gracias({ estrellas, ganados, conSugerencia, pedido, ig, instagram }: {
  estrellas: number;
  ganados: { puntos: number; total: number | null } | null;
  conSugerencia: boolean;
  pedido: string;
  ig: string | null;
  instagram: string | null;
}) {
  const [quedan, setQuedan] = React.useState(ESPERA);
  const [pausa, setPausa] = React.useState(false);
  React.useEffect(() => {
    if (!ig || pausa) return;
    if (quedan <= 0) {
      window.location.assign(ig);
      return;
    }
    const t = window.setTimeout(() => setQuedan((q) => q - 1), 1000);
    return () => window.clearTimeout(t);
  }, [quedan, ig, pausa]);

  const promesa = estrellas <= 3
    ? "Gracias por decírnoslo. Vamos a mejorar, y tu próxima visita va a ser mejor que esta."
    : conSugerencia
      ? "Leemos cada mensaje. Vamos a seguir mejorando con lo que nos cuentas."
      : "Nos alegra el día. Vamos a seguir mejorando para que siempre sea así.";
  return (
    <div className="pym-page pyc-page pyc-thanks" role="status" aria-live="polite">
      <div className="pyc-thanks__stars" aria-label={`${estrellas} de 5 estrellas`}>
        {[1, 2, 3, 4, 5].map((v) => (
          <span key={v} className={v <= estrellas ? "pyc-pop pyc-pop--on" : "pyc-pop"} style={{ animationDelay: `${0.15 + v * 0.12}s` }}><Estrella on={v <= estrellas} size={34} /></span>
        ))}
      </div>
      <h1 className="pyc-thanks__title">¡Gracias!</h1>
      <p className="pyc-thanks__text">{promesa}</p>
      {ganados && ganados.total !== null && (
        <div className="pyc-earned">
          <span className="pyc-earned__n">+{ganados.puntos}</span>
          <span className="pyc-earned__t">{ganados.puntos === 1 ? "punto" : "puntos"} · llevas <strong>{ganados.total}</strong>. Guardamos {pedido === "tu pedido" ? "lo que pediste" : pedido}.</span>
        </div>
      )}
      {ig ? (
        <div className="pyc-thanks__go">
          <a href={ig} className="pym-pill pym-pill--wide pyc-thanks__btn">Ir a @{instagram}</a>
          {!pausa && quedan > 0 && (
            <p className="pyc-thanks__count">Te llevamos a nuestro Instagram en {quedan}… <button type="button" className="pyc-back pyc-back--light" onClick={() => setPausa(true)}>Quedarme aquí</button></p>
          )}
        </div>
      ) : (
        <a href={MENU} className="pym-pill pym-pill--wide pyc-thanks__btn">Ver el menú</a>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ART}/mano-taza-amarilla.svg`} alt="" className="pym-art pyc-thanks__art" />
    </div>
  );
}

/** A link that cannot be answered: already used, too old, or never issued. */
function Cerrado({ estado, ig, instagram }: { estado: EstadoEnlace; ig: string | null; instagram: string | null }) {
  const usado = estado === "usado";
  return (
    <div className="pym-page pyc-page">
      <header className="pyc-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/cafe-payo-logo-principal.svg`} alt="Café Pa' Yo" className="pyc-head__logo" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/mano-taza.svg`} alt="" className="pym-art pyc-head__art" />
      </header>
      <main className="pyc-main">
        <section className="pyc-step">
          <h1 className="pyc-title">{usado ? "Ya recibimos tu calificación" : "Este enlace ya no está activo"}</h1>
          <p className="pyc-text">
            {usado ? "Gracias por contarnos cómo te fue. Cada vaso trae su propio código: la próxima vez nos calificas de nuevo." : estado === "vencido" ? "El código de este vaso venció. En tu próxima visita vas a tener uno nuevo." : "No encontramos este código. Si acabas de recibir tu café, espera un momento y vuelve a escanearlo."}
          </p>
          <div className="pyc-actions">
            <a href={MENU} className="pym-pill pym-pill--wide pym-pill--solid">Ver el menú</a>
            {ig && <a href={ig} className="pym-pill pym-pill--wide">Ir a @{instagram}</a>}
          </div>
        </section>
      </main>
    </div>
  );
}
