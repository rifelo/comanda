import type { Metadata } from "next";
import { instagramDeSesion, verificadoDeSesion } from "@/lib/clientes/sesion";
import { finDeTelefono, leerTokenVincular, mensajeTokenVincular } from "@/lib/clientes/telefono";
import { BASE, HOME, LOGO, MANO } from "../shell";
import { Vincular } from "./vincular-client";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vincular WhatsApp · Café Pa' Yo", robots: { index: false, follow: false } };

/**
 * cafepayo.com/menu/puntos/vincular?t=<token>: the link the WhatsApp agent
 * sends so it can answer «¿cuántos puntos llevo?». The signed token names the
 * number (24 h); the page links it to the @ — in one tap when this phone
 * already proved its @ by scanning a cup, else with the @ typed here.
 */
export default async function VincularPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const t = leerTokenVincular(token);
  const instagram = await instagramDeSesion();
  const verificado = instagram && (await verificadoDeSesion(instagram)) ? instagram : null;

  return (
    <div className="pyy">
      <div className="pyy-banda pyy-banda--entrar">
        <div className="pyy-banda__top">
          <a href={HOME} aria-label="Café Pa' Yo, ir al inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Café Pa' Yo" />
          </a>
          <a href={BASE} className="pyy-pill" style={{ padding: "8px 14px" }}>
            Mis puntos
          </a>
        </div>
        <div className="pyy-banda__sol" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MANO} alt="" className="pyy-banda__mano" />
      </div>
      {t.ok ? (
        <Vincular token={token} fin={finDeTelefono(t.token.telefono)} verificado={verificado} sugerido={instagram} />
      ) : (
        <div className="pyy-entrar">
          <h1 className="pyy-entrar__title">Vincular tu WhatsApp</h1>
          <p role="alert" className="pyy-error">
            {mensajeTokenVincular(t.motivo)}
          </p>
          <a href={BASE} className="pyy-btn pyy-btn--amarillo" style={{ marginTop: 4 }}>
            Ver mis puntos
          </a>
        </div>
      )}
    </div>
  );
}
