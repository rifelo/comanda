"use client";

/**
 * «Falta una tarea del turno»: the register rings over the speaker when a
 * turno task is a few minutes past its time and still undone, and keeps a
 * small strip on screen naming it — a reminder for whoever is at the bar,
 * not a report. One ring for any number of late tasks, again every 10
 * minutes while one stays late (lib/pos/alerta.ts recordatorioTareas).
 * Polls once a minute; the task is done from the tablet (/turno).
 *
 * The barista can drag the strip anywhere (the spot is remembered on this
 * screen) and hide it with ×. A hidden strip comes back with the next ring:
 * a new late task or the 10-minute repeat.
 */
import * as React from "react";
import { dentroDePantalla, recordatorioTareas, sonarRecordatorio, TAREA_GRACIA_MIN } from "@/lib/pos/alerta";
import { tareasAtrasadasPos } from "../actions";

type Tarea = { id: string; titulo: string; tarde: number };
type Punto = { x: number; y: number };

const hace = (min: number) => (min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim());

const CLAVE_POSICION = "pos.recordatorio.posicion";
/** Movement below this is a tap, not a drag. */
const UMBRAL_ARRASTRE = 6;

function leerPosicion(): Punto | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE_POSICION) ?? "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}
function guardarPosicion(p: Punto) {
  try {
    window.localStorage.setItem(CLAVE_POSICION, JSON.stringify(p));
  } catch {}
}

export function RecordatorioTareas() {
  const [tareas, setTareas] = React.useState<Tarea[]>([]);
  const [oculto, setOculto] = React.useState(false);
  const [pos, setPos] = React.useState<Punto | null>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  const caja = React.useRef<HTMLDivElement>(null);
  const arrastre = React.useRef<{ id: number; dx: number; dy: number; x0: number; y0: number; movio: boolean } | null>(null);
  const estado = React.useRef({ sonadas: new Set<string>(), ultimo: 0 });

  React.useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const r = await tareasAtrasadasPos().catch(() => null);
      if (!vivo || !r?.ok) return;
      const vencidas = r.tareas.filter((t) => t.tarde >= TAREA_GRACIA_MIN);
      if (recordatorioTareas(vencidas, estado.current, Date.now())) {
        sonarRecordatorio();
        setOculto(false); // every ring brings a hidden strip back
      }
      setTareas(vencidas);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 60_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);

  const visible = tareas.length > 0 && !oculto;

  // The remembered spot, pulled back on screen when the strip (re)appears or the window changes size.
  React.useLayoutEffect(() => {
    if (!visible) return;
    const acomodar = () => {
      const el = caja.current;
      const guardada = leerPosicion();
      if (!el || !guardada) return;
      const r = el.getBoundingClientRect();
      setPos(dentroDePantalla(guardada, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
    };
    acomodar();
    window.addEventListener("resize", acomodar);
    return () => window.removeEventListener("resize", acomodar);
  }, [visible]);

  if (!visible) return null;
  const [primera, ...resto] = tareas;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // × stays a plain tap
    const r = e.currentTarget.getBoundingClientRect();
    arrastre.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, movio: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    if (!a.movio && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < UMBRAL_ARRASTRE) return;
    if (!a.movio) setArrastrando(true);
    a.movio = true;
    const r = e.currentTarget.getBoundingClientRect();
    setPos(dentroDePantalla({ x: e.clientX - a.dx, y: e.clientY - a.dy }, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
  };
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    setArrastrando(false);
    if (a.movio && pos) guardarPosicion(pos);
  };

  return (
    <div
      ref={caja}
      className="tarea-recordatorio"
      data-arrastrando={arrastrando ? "1" : undefined}
      data-movida={pos ? "1" : undefined}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      role="status"
      aria-live="polite"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={soltar}
      onPointerCancel={soltar}
    >
      <span className="tarea-rec-icono" aria-hidden="true">!</span>
      <span className="tarea-rec-txt">
        <b>Falta: {primera.titulo}</b>
        <small>
          {hace(primera.tarde)}
          {resto.length ? ` · ${resto.length === 1 ? "1 tarea más" : `${resto.length} tareas más`} sin hacer` : ""} · márcala en la tablet
        </small>
      </span>
      <button type="button" className="tarea-rec-cerrar" onClick={() => setOculto(true)} aria-label="Ocultar el aviso hasta el próximo timbre">
        ×
      </button>
    </div>
  );
}
