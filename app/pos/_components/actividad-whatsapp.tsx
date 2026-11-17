"use client";

/**
 * «La IA está atendiendo a Karl por WhatsApp»: a small live strip at the
 * bottom of the register while the agent chats with customers, and a soft
 * chime (quieter than the order alert) each time one of them writes — so the
 * team knows an order may be coming. Polls every 12 s.
 */
import * as React from "react";
import { conversacionesNuevas, sonarConversacion } from "@/lib/pos/alerta";
import { actividadWhatsapp } from "../actions";

export function ActividadWhatsapp() {
  const [activas, setActivas] = React.useState<{ id: string; nombre: string; ultimo: string }[]>([]);
  const vistas = React.useRef(new Map<string, string>());
  const primera = React.useRef(true);
  React.useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const r = await actividadWhatsapp().catch(() => null);
      if (!vivo || !r?.ok) return;
      const nuevas = conversacionesNuevas(vistas.current, r.activas);
      // The first load of the screen only learns what is going on.
      if (nuevas.length && !primera.current) sonarConversacion();
      primera.current = false;
      setActivas(r.activas);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 12_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);
  if (!activas.length) return null;
  const nombres = activas.map((a) => a.nombre);
  const quien = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return (
    <div className="wa-actividad" role="status" aria-live="polite">
      <span className="wa-pulso" aria-hidden="true" />
      La IA está atendiendo a {quien} por WhatsApp
    </div>
  );
}
