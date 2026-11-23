"use client";

/**
 * «Falta una tarea del turno»: the register rings over the speaker when a
 * turno task is a few minutes past its time and still undone, and keeps a
 * small strip on screen naming it — a reminder for whoever is at the bar,
 * not a report. One ring for any number of late tasks, again every 10
 * minutes while one stays late (lib/pos/alerta.ts recordatorioTareas).
 * Polls once a minute; the task is done from the tablet (/turno).
 */
import * as React from "react";
import { recordatorioTareas, sonarRecordatorio, TAREA_GRACIA_MIN } from "@/lib/pos/alerta";
import { tareasAtrasadasPos } from "../actions";

type Tarea = { id: string; titulo: string; tarde: number };

const hace = (min: number) => (min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim());

export function RecordatorioTareas() {
  const [tareas, setTareas] = React.useState<Tarea[]>([]);
  const estado = React.useRef({ sonadas: new Set<string>(), ultimo: 0 });
  React.useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const r = await tareasAtrasadasPos().catch(() => null);
      if (!vivo || !r?.ok) return;
      const vencidas = r.tareas.filter((t) => t.tarde >= TAREA_GRACIA_MIN);
      if (recordatorioTareas(vencidas, estado.current, Date.now())) sonarRecordatorio();
      setTareas(vencidas);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 60_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);
  if (!tareas.length) return null;
  const [primera, ...resto] = tareas;
  return (
    <div className="tarea-recordatorio" role="status" aria-live="polite">
      <span className="tarea-rec-icono" aria-hidden="true">!</span>
      <span className="tarea-rec-txt">
        <b>Falta: {primera.titulo}</b>
        <small>
          {hace(primera.tarde)}
          {resto.length ? ` · ${resto.length === 1 ? "1 tarea más" : `${resto.length} tareas más`} sin hacer` : ""} · márcala en la tablet
        </small>
      </span>
    </div>
  );
}
