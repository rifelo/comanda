import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { coleccion, insignias, rachaDiasActual, type Insignia } from "@/lib/clientes/coleccion";
import { cargarCarta, cargarCliente, cargarEscaneos, cargarPodios } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { BASE, Pantalla } from "../shell";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi colección · Café Pa' Yo", robots: { index: false, follow: false } };

/**
 * «Mi colección»: one card per drink of the menu with how many times you had
 * it (untried ones dimmed, to invite trying), progress per group, and the
 * recognition badges. Points and rewards live in Premios; this is the fun part.
 */
export default async function ColeccionPage() {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(`${BASE}?ir=coleccion`);
  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const [escaneos, { carta, fuera }, podios] = await Promise.all([
    cliente ? cargarEscaneos(org, cliente.id) : Promise.resolve([]),
    cargarCarta(org),
    cliente ? cargarPodios(org, cliente.id) : Promise.resolve([]),
  ]);
  const col = coleccion(escaneos, carta, fuera);
  const badges = insignias(escaneos, carta, podios, fuera);
  const ganadas = badges.filter((b) => b.ganada).length;
  const racha = rachaDiasActual(escaneos);

  return (
    <Pantalla instagram={instagram} tab="coleccion">
      <section aria-labelledby="pyy-col" className="pyy-puntos">
        <h1 id="pyy-col" className="pyy-h1">Mi colección</h1>
        <div className="pyy-dos">
          <div className="pyy-tile pyy-tile--crema">
            <span className="pyy-n">{col.bebidas}</span>
            <span className="pyy-meta--s">{col.bebidas === 1 ? "bebida tomada" : "bebidas tomadas"}</span>
          </div>
          <div className="pyy-tile pyy-tile--crema">
            <span className="pyy-n">
              {col.descubiertas}/{col.carta}
            </span>
            <span className="pyy-meta--s">de la carta descubiertas</span>
          </div>
        </div>
        <div className="pyy-racha" aria-label={`Racha actual: ${racha} ${racha === 1 ? "día" : "días"} seguidos con café`}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.6.8-2.8 1.6-3.6.2 1.4 1 2.1 1.9 2.1C11 8 11 5.5 12 3zM8 21h8" />
          </svg>
          <span>
            {racha > 0 ? (
              <>
                Racha de <strong className="pyy-n">{racha}</strong> {racha === 1 ? "día" : "días"}. Ven mañana y súmale uno.
              </>
            ) : (
              <>Empieza una racha: un café hoy y otro mañana.</>
            )}
          </span>
        </div>
      </section>

      <section aria-labelledby="pyy-ins" className="pyy-col" style={{ gap: 10 }}>
        <div className="pyy-seccion__head">
          <h2 id="pyy-ins" className="pyy-h2">Insignias</h2>
          <span className="pyy-meta">
            {ganadas} de {badges.length}
          </span>
        </div>
        <ul className="pyy-insignias">
          {badges.map((b) => (
            <BadgeItem key={b.id} b={b} />
          ))}
        </ul>
      </section>

      {col.grupos.map((g) => (
        <section key={g.grupo} aria-labelledby={`pyy-g-${g.grupo}`} className="pyy-col" style={{ gap: 10 }}>
          <div className="pyy-seccion__head">
            <h2 id={`pyy-g-${g.grupo}`} className="pyy-h2">{g.grupo}</h2>
            <span className="pyy-meta">
              {g.descubiertas} de {g.total}
            </span>
          </div>
          <div className="pyy-prog__barra" role="progressbar" aria-valuemin={0} aria-valuemax={g.total} aria-valuenow={g.descubiertas} aria-label={`${g.grupo} descubiertas`}>
            <span style={{ width: `${Math.round((g.descubiertas / g.total) * 100)}%` }} />
          </div>
          <ul className="pyy-album">
            {g.cartas.map((c) => (
              <li key={c.nombre} className={`pyy-carta${c.veces ? "" : " pyy-carta--nueva"}`}>
                <Taza />
                <span className="pyy-carta__nombre">{c.nombre}</span>
                {c.veces ? <span className="pyy-chip">×{c.veces}</span> : <span className="pyy-meta--s">Sin probar</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {col.pasadas.length > 0 && (
        <section aria-labelledby="pyy-pas" className="pyy-col" style={{ gap: 10 }}>
          <h2 id="pyy-pas" className="pyy-h2">Ediciones pasadas</h2>
          <ul className="pyy-album">
            {col.pasadas.map((c) => (
              <li key={c.nombre} className="pyy-carta">
                <Taza />
                <span className="pyy-carta__nombre">{c.nombre}</span>
                <span className="pyy-chip">×{c.veces}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {col.bebidas === 0 && (
        <p className="pyy-vacio">
          Tu colección empieza con tu primer vaso: escanea el QR del sticker y escribe <strong>@{instagram}</strong>.
        </p>
      )}
    </Pantalla>
  );
}

function BadgeItem({ b }: { b: Insignia }) {
  return (
    <li className={`pyy-insignia${b.ganada ? " pyy-insignia--ganada" : ""}`}>
      <span className="pyy-insignia__sello" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {b.ganada ? <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" /> : <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />}
        </svg>
      </span>
      <span className="pyy-col">
        <b>{b.nombre}</b>
        <span className="pyy-meta--s">{b.detalle}</span>
        {b.progreso && (
          <span className="pyy-meta--s">
            {b.ganada ? "Siguiente nivel: " : ""}
            {b.progreso.actual} de {b.progreso.meta}
          </span>
        )}
      </span>
      <span className="pyy-sr">{b.ganada ? "Ganada" : "Por ganar"}</span>
    </li>
  );
}

function Taza() {
  return (
    <svg aria-hidden="true" className="pyy-carta__art" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8h11l-1.2 11.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8zM5 8h13M9 4.5c0 1 1 1 1 2M13 4.5c0 1 1 1 1 2" />
    </svg>
  );
}
