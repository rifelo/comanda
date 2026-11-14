import type { Progreso as ProgresoT } from "@/lib/clientes/premios";

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
