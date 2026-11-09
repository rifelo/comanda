import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { inicio } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarEscaneos } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { BASE, MENU, Pantalla } from "../shell";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escanear · Café Pa' Yo", robots: { index: false, follow: false } };

/**
 * «Escanear»: the points come from the QR printed on each cup, opened with the
 * phone's own camera (a web page can't read it as reliably on every phone),
 * so this tab says how, and shows the last cup that counted.
 */
export default async function EscanearPage() {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(BASE);
  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const ultimo = cliente ? inicio(await cargarEscaneos(org, cliente.id)).ultimos[0] : undefined;

  return (
    <Pantalla instagram={instagram} tab="escanear">
      <section aria-labelledby="pyy-esc" className="pyy-card pyy-card--amarillo">
        <h1 id="pyy-esc" className="pyy-h1">Escanea tu vaso</h1>
        <ol className="pyy-pasos">
          <li>Abre la cámara de tu celular y apunta al QR que viene en el sticker de tu vaso.</li>
          <li>Toca el enlace que aparece: se abre cafepayo.com con tu bebida.</li>
          <li>
            <span>
              Toca <strong>«Solo sumar mis puntos»</strong> (o califícanos) y escribe <strong style={{ overflowWrap: "anywhere" }}>@{instagram}</strong>.
            </span>
          </li>
        </ol>
        <span style={{ fontSize: 13, lineHeight: "18px" }}>Cada QR suma una sola vez. Si se te pasó, pídele a la persona en caja que te ayude.</span>
      </section>

      {ultimo ? (
        <section aria-labelledby="pyy-ult" className="pyy-lista">
          <h2 id="pyy-ult" className="pyy-h2">Tu último escaneo</h2>
          <div className="pyy-item">
            <div>
              <b>{ultimo.nombre}</b>
              <span className="pyy-meta">
                {ultimo.cuando} · {ultimo.valor}
              </span>
            </div>
            <span className="pyy-chip">+{ultimo.puntos}</span>
          </div>
        </section>
      ) : (
        <p className="pyy-vacio">Todavía no has escaneado ningún vaso con @{instagram}. ¡El próximo café ya suma!</p>
      )}

      <a href={MENU} className="pyy-btn">
        Ver el menú
      </a>
    </Pantalla>
  );
}
