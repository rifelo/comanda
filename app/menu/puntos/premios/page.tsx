import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hora, miles } from "@/lib/clientes/mi-payo";
import { cargarCliente } from "@/lib/clientes/mi-payo-db";
import { BONO_BIENVENIDA, HORA_FIN_MANANA, PREMIOS, progreso } from "@/lib/clientes/premios";
import { codigoCanje } from "@/lib/clientes/premios-codigo";
import { instagramDeSesion, verificadoDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { Progreso } from "../progreso";
import { BASE, Pantalla } from "../shell";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Premios · Café Pa' Yo", robots: { index: false, follow: false } };

/**
 * «Premios»: the ladder, how points are earned, and — on a phone that scanned
 * one of this @'s cups — the 4-digit code the register asks for to redeem.
 */
export default async function PremiosPage({ searchParams }: { searchParams: Promise<{ canjear?: string }> }) {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(`${BASE}?ir=premios`);
  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const puntos = cliente?.puntos ?? 0;
  const p = progreso(puntos);
  const verificado = cliente ? await verificadoDeSesion(instagram) : false;
  const quiere = (await searchParams).canjear;
  const elegido = PREMIOS.find((x) => x.id === quiere && puntos >= x.puntos) ?? null;
  const codigo = elegido && cliente && verificado ? codigoCanje(cliente.id) : null;

  return (
    <Pantalla instagram={instagram} tab="inicio">
      <div className="pyy-col" style={{ gap: 4 }}>
        <h1 className="pyy-h1">Premios</h1>
        <span className="pyy-meta">
          Llevas <strong className="pyy-n">{miles(puntos)}</strong> {puntos === 1 ? "punto" : "puntos"}.
        </span>
      </div>

      {elegido && (
        <section aria-labelledby="pyy-cod" className="pyy-codigo" role="status">
          <h2 id="pyy-cod" className="pyy-h2">{elegido.titulo}</h2>
          {codigo ? (
            <>
              <span className="pyy-meta">Muéstrale este código a la persona en caja:</span>
              <span className="pyy-codigo__n" aria-label={`Código ${codigo.codigo.split("").join(" ")}`}>{codigo.codigo}</span>
              <span className="pyy-meta">Sirve hasta las {hora(codigo.hasta)}. Al canjear se descuentan {elegido.puntos} puntos.</span>
            </>
          ) : (
            <span style={{ fontSize: 14, lineHeight: "20px" }}>
              Para canjear, escanea desde este celular el QR de uno de tus vasos con <strong>@{instagram}</strong>. Así sabemos que eres tú.
            </span>
          )}
          <a href={`${BASE}/premios`} className="pyy-link">Cerrar</a>
        </section>
      )}

      <Progreso p={p} puntos={puntos} enlace={false} />

      <section aria-labelledby="pyy-esc" className="pyy-col" style={{ gap: 10 }}>
        <h2 id="pyy-esc" className="pyy-h2">La escalera</h2>
        {PREMIOS.map((x) => {
          const listo = puntos >= x.puntos;
          return (
            <div key={x.id} className={`pyy-premio${listo ? " pyy-premio--listo" : ""}`}>
              <div className="pyy-premio__pts">
                <span className="pyy-n">{x.puntos}</span>
                <span className="pyy-meta--s">puntos</span>
              </div>
              <div className="pyy-col" style={{ flexGrow: 1 }}>
                <b>{x.titulo}</b>
                <span className="pyy-meta">{x.detalle}</span>
              </div>
              {listo ? (
                <a href={`${BASE}/premios?canjear=${x.id}`} className="pyy-pill">Canjear</a>
              ) : (
                <span className="pyy-meta--s" style={{ flexShrink: 0 }}>faltan {x.puntos - puntos}</span>
              )}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="pyy-como" className="pyy-card">
        <h2 id="pyy-como" className="pyy-h2">Cómo sumas</h2>
        <ul className="pyy-reglas">
          <li>1 punto por cada $1.000 que compras: escanea el QR de tu vaso y escribe tu @.</li>
          <li><strong>Mañana doble:</strong> lo que pides antes de las {HORA_FIN_MANANA}:00 a. m. suma el doble.</li>
          <li>+{BONO_BIENVENIDA} puntos de bienvenida con tu primer escaneo.</li>
          <li>Al canjear se descuentan los puntos del premio; los adicionales (leche, shot extra) se pagan aparte.</li>
          <li>Un premio por visita. Los puntos no se cambian por dinero.</li>
        </ul>
      </section>
    </Pantalla>
  );
}
