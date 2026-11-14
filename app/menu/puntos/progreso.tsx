import { PREMIOS, type Progreso as ProgresoT } from "@/lib/clientes/premios";

const BASE = "/menu/puntos";

/** The bar toward the next reward (or the rewards already reachable). Plain markup: used by server pages and the QR's client screen. */
export function Progreso({ p, puntos, enlace = true }: { p: ProgresoT; puntos: number; enlace?: boolean }) {
  const listo = p.disponibles[p.disponibles.length - 1];
  return (
    <section aria-label="Tu próximo premio" className="pyy-prog">
      <div className="pyy-prog__head">
        <span className="pyy-h2">
          {p.siguiente ? (
            <>Te faltan <span className="pyy-n">{p.faltan}</span> para «{p.siguiente.titulo}»</>
          ) : (
            <>¡Ya puedes canjear «{listo?.titulo}»!</>
          )}
        </span>
      </div>
      <div className="pyy-prog__barra" role="progressbar" aria-valuemin={0} aria-valuemax={p.siguiente?.puntos ?? puntos} aria-valuenow={puntos} aria-label="Puntos hacia el próximo premio">
        <span style={{ width: `${p.pct}%` }} />
      </div>
      {listo && p.siguiente && <span className="pyy-meta">Ya tienes para «{listo.titulo}». Puedes canjearlo o seguir sumando.</span>}
      {enlace && (
        <a href={`${BASE}/premios`} className="pyy-prog__ir">
          {p.disponibles.length ? "Canjear un premio" : "Ver los premios"}
        </a>
      )}
    </section>
  );
}

/**
 * The path to the rewards: a soft rail, the walked part in amarillo, a round
 * stop per reward (checked once reached) with its name under it, and a knob
 * at the customer's points carrying the number. Used on Inicio and Premios.
 */
export function Camino({ puntos }: { puntos: number }) {
  const tope = PREMIOS[PREMIOS.length - 1].puntos;
  const pct = Math.min(100, Math.max(0, (puntos / tope) * 100));
  const enHito = PREMIOS.some((x) => x.puntos === puntos) || puntos >= tope;
  return (
    <div className="pyy-camino2">
      <div className="pyy-camino2__pista" role="progressbar" aria-valuemin={0} aria-valuemax={tope} aria-valuenow={Math.min(puntos, tope)} aria-label={`${puntos} de ${tope} puntos`}>
        <span className="pyy-camino2__hecho" style={{ width: `${pct}%` }} />
        {PREMIOS.map((x) => (
          <span key={x.id} className={`pyy-camino2__parada${puntos >= x.puntos ? " pyy-camino2__parada--lista" : ""}`} style={{ left: `${(x.puntos / tope) * 100}%` }} aria-hidden="true">
            {puntos >= x.puntos ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5 9-10" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h11l-1.2 11.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8zM5 8h13" />
              </svg>
            )}
          </span>
        ))}
        {!enHito && (
          <span className="pyy-camino2__yo" style={{ left: `${pct}%` }} aria-hidden="true">
            <b>{puntos}</b>
          </span>
        )}
      </div>
      <div className="pyy-camino2__nombres" aria-hidden="true">
        {PREMIOS.map((x) => (
          <span key={x.id} style={{ left: `${(x.puntos / tope) * 100}%` }} className={puntos >= x.puntos ? "pyy-camino2__nombre--listo" : undefined}>
            <b>{x.puntos}</b>
            {x.corto}
          </span>
        ))}
      </div>
    </div>
  );
}
