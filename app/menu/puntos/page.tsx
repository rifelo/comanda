import type { Metadata } from "next";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import "../../c/[codigo]/califica.css";
import "./puntos.css";
import { PuntosClient } from "./puntos-client";

export const metadata: Metadata = {
  title: "Mis puntos · Café Pa' Yo",
  description: "Escribe tu usuario de Instagram y mira cuántos puntos llevas en Café Pa' Yo.",
  alternates: { canonical: "/puntos" },
};

/** Where customers check their points: cafepayo.com/puntos (the proxy rewrites it here). Public, no session. */
export default function PuntosPage() {
  return <PuntosClient pesosPorPunto={PESOS_POR_PUNTO} />;
}
