import type { Metadata, Viewport } from "next";
import { leerCodigo } from "@/lib/calificaciones/calificaciones";
import { cargarEnlace } from "@/lib/calificaciones/calificaciones-db";
import { body, display } from "@/app/menu/fonts";
import "@/app/menu/menu.css";
import "./califica.css";
import { CalificaClient } from "./califica-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Califícanos · Café Pa' Yo", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#f1a900", width: "device-width", initialScale: 1 };

/**
 * Where the QR on the cup lands: one rating per printed label. Public, no
 * session — the code in the address is the credential. A code that was never
 * registered, already answered or too old gets a kind word and a way out.
 */
export default async function CalificaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = leerCodigo((await params).codigo);
  const enlace = codigo ? await cargarEnlace(codigo) : { estado: "desconocido" as const, items: [], puntos: 0, instagram: null };
  return (
    <div className={`pym pyc ${display.variable} ${body.variable}`}>
      <CalificaClient codigo={codigo ?? ""} estado={enlace.estado} items={enlace.items} puntos={enlace.puntos} instagram={enlace.instagram} />
    </div>
  );
}
