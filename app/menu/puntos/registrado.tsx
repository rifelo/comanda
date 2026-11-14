import type { Registro } from "@/lib/clientes/mi-payo";
import { progreso } from "@/lib/clientes/premios";
import { Progreso } from "./progreso";

const BASE = "/menu/puntos";
const MANO = "/menu/art/mano-taza.svg";

/** «Después de escanear el QR» (Claude Design, Mi Pa'Yo). Plain markup: rendered by the QR page's client component. */
export function Registrado({ r }: { r: Registro }) {
  const ranking =
    r.puesto === null ? null : r.puestoAntes !== null && r.puestoAntes > r.puesto ? `#${r.puestoAntes} → #${r.puesto}` : `#${r.puesto}`;
  const tipo = r.tipo === "caliente" ? "Caliente" : r.tipo === "frio" ? "Fría" : null;
  return (
    <div className="pyy" role="status" aria-live="polite">
      <div className="pyy-banda pyy-banda--escaneo">
        <div className="pyy-banda__top">
          <span className="pyy-pill" style={{ padding: "8px 14px" }}>
            QR escaneado · {r.hora}
          </span>
          <a href={BASE} aria-label="Cerrar" className="pyy-cerrar">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </a>
        </div>
        <div className="pyy-banda__sol" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MANO} alt="" className="pyy-banda__mano" />
      </div>

      <div className="pyy-hoja">
        <div className="pyy-col" style={{ gap: 4 }}>
          <h1>¡Listo{r.nombre ? `, ${r.nombre}` : ""}!</h1>
          <span className="pyy-meta" style={{ fontSize: 14, lineHeight: "19px", overflowWrap: "anywhere" }}>
            Registramos tu bebida a nombre de @{r.instagram}.
          </span>
        </div>

        <div className="pyy-reg">
          <div className="pyy-col" style={{ flexGrow: 1 }}>
            <span className="pyy-fav__nombre">{r.bebida}</span>
            <span className="pyy-meta">
              {r.valor}
              {tipo ? ` · ${tipo}` : ""}
            </span>
          </div>
          <span className="pyy-chip">+{r.puntos}</span>
        </div>

        {(r.insignias ?? []).length > 0 && (
          <a href={`${BASE}/coleccion`} className="pyy-nueva-insignia">
            <span aria-hidden="true">★</span>
            <span>
              {(r.insignias ?? []).length === 1 ? "¡Nueva insignia!" : "¡Nuevas insignias!"} <strong>{(r.insignias ?? []).join(" · ")}</strong>
            </span>
          </a>
        )}

        {(r.mananaDoble || (r.bienvenida ?? 0) > 0) && (
          <div className="pyy-bonos">
            {r.mananaDoble && <span className="pyy-pill">Mañana doble · tus puntos van ×2</span>}
            {(r.bienvenida ?? 0) > 0 && <span className="pyy-pill">+{r.bienvenida} de bienvenida</span>}
          </div>
        )}

        <div className="pyy-dos">
          <div className="pyy-tile pyy-tile--crema">
            <span className="pyy-meta--s">Puntos ahora</span>
            <span className="pyy-n" style={{ fontSize: 26, lineHeight: "32px" }}>
              {r.total.toLocaleString("es-CO")}
            </span>
          </div>
          {ranking && (
            <div className="pyy-tile pyy-tile--crema">
              <span className="pyy-meta--s">Ranking del mes</span>
              <span className="pyy-n" style={{ fontSize: 26, lineHeight: "32px" }}>
                {ranking}
              </span>
            </div>
          )}
        </div>

        <Progreso p={progreso(r.total)} puntos={r.total} />

        {r.veces > 1 && (
          <span style={{ fontSize: 14, lineHeight: "20px" }}>
            Es tu {r.bebida.toLocaleLowerCase("es")} número <strong>{r.veces}</strong>.{r.esFavorito ? " Sigue siendo tu favorito." : ""}
          </span>
        )}

        <div className="pyy-hoja__go">
          <a href={`${BASE}/ranking`} className="pyy-btn pyy-btn--amarillo">
            Ver el ranking
          </a>
          <a href={`${BASE}/coleccion`} className="pyy-btn">
            Mi colección
          </a>
        </div>
      </div>
    </div>
  );
}
