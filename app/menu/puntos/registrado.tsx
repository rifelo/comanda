import type { Registro } from "@/lib/clientes/mi-payo";

const BASE = "/menu/puntos";
const LOGO = "/menu/art/cafe-payo-logo-principal.svg";

/** «Después de escanear el QR» (Claude Design, Mi Pa'Yo). Plain markup: rendered by the QR page's client component. */
export function Registrado({ r }: { r: Registro }) {
  const ranking =
    r.puesto === null
      ? null
      : r.puestoAntes !== null && r.puestoAntes > r.puesto
        ? { v: `#${r.puestoAntes} → #${r.puesto}`, t: "subiste en el ranking del mes" }
        : r.puestoAntes === null
          ? { v: `#${r.puesto}`, t: "entraste al ranking del mes" }
          : { v: `#${r.puesto}`, t: "tu puesto en el ranking del mes" };
  return (
    <div className="pyy pyy--amarillo" role="status" aria-live="polite">
      <div className="pyy-scan">
        <div className="pyy-scan__top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Café Pa' Yo" />
          <a href={BASE} aria-label="Cerrar" className="pyy-cerrar">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </a>
        </div>

        <div className="pyy-scan__hola">
          <span className="pyy-k" style={{ fontSize: 13 }}>
            QR escaneado · hoy {r.hora}
          </span>
          <h1 className="pyy-scan__title">
            ¡Listo,
            <br />
            {r.nombre ?? `@${r.instagram}`}!
          </h1>
          <span className="pyy-scan__lema">Tómalo con calma. O con doble shot.</span>
        </div>

        <section aria-label="Bebida registrada" className="pyy-reg">
          <div className="pyy-reg__fila">
            <div>
              <span className="pyy-k pyy-meta">Registramos</span>
              <span className="pyy-fav__nombre">{r.bebida}</span>
              <span className="pyy-meta" style={{ overflowWrap: "anywhere" }}>
                {r.valor} · a nombre de @{r.instagram}
              </span>
            </div>
            <span className="pyy-chip">+{r.puntos}</span>
          </div>
          <hr />
          <div className="pyy-reg__dos">
            <div>
              <span className="pyy-n">{r.total.toLocaleString("es-CO")}</span>
              <span>puntos ahora</span>
            </div>
            {ranking && (
              <div>
                <span className="pyy-n">{ranking.v}</span>
                <span>{ranking.t}</span>
              </div>
            )}
          </div>
          {r.veces > 1 && (
            <span style={{ fontSize: 13, lineHeight: "18px" }}>
              {r.bebida} número <strong>{r.veces}</strong>.{r.esFavorito ? " Sigue siendo tu favorito." : ""}
            </span>
          )}
        </section>

        <div className="pyy-scan__go">
          <a href={`${BASE}/ranking`} className="pyy-btn pyy-btn--cafe">
            Ver el ranking
          </a>
          <a href={`${BASE}/insights`} className="pyy-btn">
            Mis insights
          </a>
        </div>
      </div>
    </div>
  );
}
