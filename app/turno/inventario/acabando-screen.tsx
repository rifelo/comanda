"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  armarVista,
  buildInsumos,
  conPendientes,
  contar,
  encolar,
  MARCAS,
  metaInsumo,
  NOTAS_RAPIDAS,
  parecidosA,
  rail,
  zonasCon,
  type Insumo,
  type Marca,
  type MarcaPendiente,
  type Vista,
} from "@/lib/inventario/acabando";
import type { AcabandoData } from "@/lib/inventario/acabando-db";
import { ZONAS } from "@/lib/inventario/niveles";
import { agregarNoListado, marcarInsumos } from "./actions";

type ZonaAlta = (typeof ZONAS)[number];
type VerificarItem = { id: string; name: string; ubicacion: string | null };
type Draft = { nombre: string; zona: ZonaAlta; marca: "poco" | "agotado"; nota: string };

const COLA_KEY = "acabando:cola";
const GUARDADO_MS = 4000;
const REINTENTO_MS = 15000;

function leerCola(): MarcaPendiente[] {
  try {
    const raw = window.localStorage.getItem(COLA_KEY);
    const v = raw ? (JSON.parse(raw) as MarcaPendiente[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function guardarCola(cola: MarcaPendiente[]) {
  try {
    if (cola.length) window.localStorage.setItem(COLA_KEY, JSON.stringify(cola));
    else window.localStorage.removeItem(COLA_KEY);
  } catch {
    /* private mode: the queue lives in memory only */
  }
}

function useEnLinea(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

// Layout lives in classes (never inline `display`): the rail turns into a tab
// grid under 900 px, the row buttons grow on the portrait tablet.
const CSS = `
.acab { --acab-poco: var(--brand); --acab-agot: var(--late); --acab-ok: var(--ok); --acab-ok-ink: var(--ok);
  --acab-row: var(--surface);
  --acab-row-poco: var(--brand-soft);
  --acab-row-agot: var(--late-soft);
  --acab-row-camino: var(--surface-2);
  height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); color: var(--text); font-family: inherit; }
.acab button { font-family: inherit; color: inherit; cursor: pointer; }
.acab button:focus-visible, .acab a:focus-visible, .acab input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.acab-head { flex-shrink: 0; min-height: 72px; box-sizing: border-box; display: flex; align-items: center; gap: 16px; padding: 12px 28px; background: var(--bg); }
.acab-title { margin: 0; font-weight: 700; font-size: 20px; line-height: 1.2; white-space: nowrap; }
.acab-search { height: 52px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--acab-row); }
.acab-search input { flex: 1; min-width: 0; height: 44px; border: none; outline: none; background: transparent; font: inherit; font-size: 15px; color: var(--ink); }
.acab-search-head { flex: 0 1 360px; min-width: 200px; }
.acab-search-bar { display: none; }
.acab-pill { display: flex; height: 48px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-weight: 600; font-size: 15px; flex-shrink: 0; }
.acab-online { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.acab-pill > span { display: flex; align-items: center; justify-content: center; padding: 0 14px; white-space: nowrap; }
.acab-pill > span + span { border-left: 1px solid var(--line); }
.acab-actor { height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-lt); font-size: 14px; font-weight: 700; text-decoration: none; color: var(--ink); white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.acab-clock { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12px; min-width: 76px; }
.acab-dot { width: 8px; height: 8px; border-radius: 4px; display: inline-block; }
.acab-offline { flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 12px 28px; background: var(--strong); color: var(--on-strong); }
.acab-body { flex: 1; min-height: 0; display: flex; }
.acab-rail { width: 260px; flex-shrink: 0; box-sizing: border-box; padding: 4px 16px 16px 28px; background: var(--bg); display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.acab-railbtn { min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 14px; text-align: left; }
.acab-railbtn[aria-pressed="true"] { border-color: transparent; }
.acab-railbtn .acab-sub { font-size: 13px; opacity: .75; }
.acab-badge { min-width: 26px; height: 26px; box-sizing: border-box; padding: 0 7px; border-radius: 999px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.acab-railgap { margin-bottom: 10px; }
.acab-spacer { flex: 1; min-height: 8px; }
.acab-add { min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 1px dashed var(--line); border-radius: 14px; background: transparent; font-size: 15px; font-weight: 600; text-align: left; line-height: 1.3; }
.acab-tools { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; }
.acab-tool { min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface); font-size: 16px; font-weight: 600; color: var(--text); text-decoration: none; }
.acab-tool small { font-size: 13px; font-weight: 400; color: var(--muted); }
.acab-main { flex: 1; min-width: 0; overflow-y: auto; box-sizing: border-box; padding: 4px 28px 28px 12px; display: flex; flex-direction: column; gap: 16px; }
.acab-h2 { margin: 0; font-weight: 700; font-size: 20px; }
.acab-h3 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: var(--muted); }
.acab-h3::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.acab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 8px 14px; align-items: start; }
.acab-item { display: flex; flex-direction: column; min-width: 0; }
.acab-row { min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--acab-row); min-width: 0; }
.acab-row[data-marca="poco"] { background: var(--acab-row-poco); }
.acab-row[data-marca="agotado"] { background: var(--acab-row-agot); }
.acab-row[data-camino="1"] { background: var(--acab-row-camino); }
.acab-row[data-guardado="1"] { border: 2px solid var(--acab-ok); }
.acab-row[data-espera="1"] { border-style: dashed; }
.acab-name { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acab-meta { font-size: 13px; font-weight: 400; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
.acab-meta[data-tono="poco"] { color: var(--text); }
.acab-meta[data-tono="agotado"] { color: var(--late); }
.acab-meta[data-tono="camino"] { color: var(--text); font-weight: 600; }
.acab-meta[data-tono="ok"] { color: var(--ok); font-weight: 600; }
.acab-btns { display: flex; gap: 4px; flex-shrink: 0; padding: 4px; border-radius: 12px; background: var(--surface-2); }
.acab-btns[data-camino="1"] { opacity: .38; }
.acab-mb { height: 44px; border: none; border-radius: 9px; background: transparent; color: var(--muted) !important; font-size: 15px; font-weight: 600; }
.acab-mb[data-m="hay"] { width: 60px; } .acab-mb[data-m="poco"] { width: 66px; } .acab-mb[data-m="agotado"] { width: 88px; }
.acab-mb[aria-pressed="true"][data-m="hay"] { background: var(--surface); color: var(--ok) !important; box-shadow: var(--shadow-1); }
.acab-mb[aria-pressed="true"][data-m="poco"] { background: var(--brand); color: var(--on-brand) !important; }
.acab-mb[aria-pressed="true"][data-m="agotado"] { background: var(--late); color: #ffffff !important; }
.acab-note-btn { width: 48px; height: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.acab-note-btn[data-on="1"] { background: var(--surface-2); }
.acab-tag { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--surface-2); color: var(--text); white-space: nowrap; }
.acab-notepanel { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px; margin: -1px 10px 0; border: 1px solid var(--line); border-top: none; border-radius: 0 0 14px 14px; background: var(--surface-2); }
.acab-notepanel input { flex: 1 1 170px; height: 48px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--acab-row); font: inherit; font-size: 14px; color: var(--ink); }
.acab-chip { height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 14px; font-weight: 600; }
.acab-solid { height: 56px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 24px; border: 1px solid transparent; border-radius: 12px; background: var(--brand); color: var(--on-brand) !important; font-size: 17px; font-weight: 700; }
.acab-solid:disabled { opacity: .4; cursor: default; }
.acab-ghost { height: 56px; padding: 0 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 17px; font-weight: 700; }
.acab-card { box-sizing: border-box; padding: 28px; border: 1px solid var(--line); border-radius: 16px; background: var(--acab-row); display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; margin: 24px auto 0; width: min(560px, 100%); }
.acab-okcard { border-style: solid; }
.acab-form-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.acab-form { box-sizing: border-box; padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--acab-row); display: flex; flex-direction: column; gap: 18px; }
.acab-label { font-size: 13px; font-weight: 600; color: var(--muted); }
.acab-field { height: 56px; box-sizing: border-box; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font: inherit; font-size: 17px; font-weight: 600; color: var(--text); width: 100%; }
.acab-field.sm { height: 48px; font-size: 14px; font-weight: 400; }
.acab-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.acab-zonas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.acab-opt { min-height: 52px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 15px; font-weight: 600; }
.acab-opt[aria-pressed="true"] { background: var(--strong); color: var(--on-strong); border-color: var(--strong); }
.acab-opt.poco[aria-pressed="true"] { background: var(--brand); color: var(--on-brand); border-color: var(--brand); }
.acab-opt.agot[aria-pressed="true"] { background: var(--acab-agot); color: #fff; }
.acab-aside { box-sizing: border-box; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.acab-sugg { min-height: 56px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--acab-row); text-align: left; }
.acab-flash { border: none; border-radius: 12px; padding: 12px 16px; font-size: 15px; font-weight: 600; color: var(--ok); background: var(--ok-soft); }
.acab-error { border: none; border-radius: 12px; padding: 12px 16px; font-size: 15px; font-weight: 600; color: var(--late); background: var(--late-soft); }
.acab-tools-bottom { display: none; }
.acab-verif { flex-shrink: 0; box-sizing: border-box; padding: 18px; border: 2px solid var(--brand); border-radius: 16px; background: var(--surface); display: flex; flex-direction: column; gap: 14px; }
.acab-verif-top { display: flex; align-items: center; gap: 14px; }
.acab-verif-icon { width: 48px; height: 48px; flex-shrink: 0; border-radius: 12px; background: var(--brand-soft); color: var(--text); display: flex; align-items: center; justify-content: center; }
.acab-verif-list { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
.acab-vrow { min-height: 60px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 8px 10px 8px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); min-width: 0; }
.acab-vdot { width: 22px; height: 22px; flex-shrink: 0; box-sizing: border-box; border: 2px solid var(--line); border-radius: 999px; }
.acab-verif-go { height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 10px; border-radius: 12px; background: var(--brand); color: var(--on-brand); font-size: 17px; font-weight: 700; text-decoration: none; }
@media (max-width: 1399px) and (min-width: 900px) {
  .acab-actor { display: none; }
  .acab-title { font-size: 24px; }
}
@media (max-width: 899px) {
  .acab-head { flex-wrap: wrap; padding: 14px 16px; gap: 12px; }
  .acab-title { font-size: 24px; flex: 1; }
  .acab-search-head { display: none; }
  .acab-search-bar { display: flex; height: 52px; }
  .acab-head .acab-pill { order: 5; width: 100%; height: 52px; }
  .acab-head .acab-pill > span { flex: 1; }
  .acab-body { flex-direction: column; overflow-y: auto; }
  .acab-rail { width: auto; flex-direction: row; flex-wrap: wrap; overflow: visible; border-right: none; border-bottom: 1px solid var(--line); padding: 12px 16px; gap: 8px; }
  .acab-rail > .acab-search-bar { flex-basis: 100%; }
  .acab-railbtn { flex: 1 1 140px; min-height: 52px; }
  .acab-railgap { margin-bottom: 0; }
  .acab-spacer, .acab-rail .acab-tools { display: none; }
  .acab-add { flex-basis: 100%; min-height: 52px; }
  .acab-main { overflow: visible; padding: 16px; }
  .acab-grid { grid-template-columns: minmax(0, 1fr); }
  .acab-verif-list { grid-template-columns: minmax(0, 1fr); }
  .acab-row { min-height: 66px; }
  .acab-name { font-size: 16px; }
  .acab-meta { font-size: 12px; }
  .acab-mb { height: 48px; font-size: 15px; }
  .acab-mb[data-m="hay"] { width: 84px; } .acab-mb[data-m="poco"] { width: 92px; } .acab-mb[data-m="agotado"] { width: 116px; }
  .acab-form-wrap { grid-template-columns: minmax(0, 1fr); }
  .acab-zonas { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .acab-tools-bottom { display: flex; }
}
@media (max-width: 560px) {
  /* Phone: the name gets its own line, the three marks fill the line below. */
  .acab-row { flex-wrap: wrap; padding: 10px 10px 10px 14px; row-gap: 8px; }
  .acab-row > :first-child { flex: 1 1 100% !important; }
  .acab-btns { flex: 1; }
  .acab-mb, .acab-mb[data-m="hay"], .acab-mb[data-m="poco"], .acab-mb[data-m="agotado"] { flex: 1; width: auto; font-size: 14px; }
  .acab-actor { display: none; }
}
`;

const Lapiz = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
);
const Lupa = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
);
const Mas = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
const Reloj = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const Camion = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
);
const SinRed = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M8.5 8.6A5 5 0 0 0 6 18h11" /><path d="M10.7 6.1A6 6 0 0 1 17.7 10 4 4 0 0 1 20.8 15.6" /></svg>
);

/**
 * «¿Qué se está acabando?» on the shop tablet. A tap saves at once (no
 * «Enviar»): it goes to a queue kept in localStorage and is sent right away;
 * without internet it waits there (dashed border + clock) and goes out by
 * itself when the connection is back. The row confirms in place for 4 s.
 */
export function AcabandoScreen({ data, today, actorName, isAdmin, verificar, porLlegar }: {
  data: AcabandoData;
  today: string;
  actorName: string;
  isAdmin: boolean;
  /** Today's open verification tasks from the inventory assistant, in walking order. */
  verificar: VerificarItem[];
  porLlegar: number;
}) {
  const router = useRouter();
  const online = useEnLinea();
  const base = React.useMemo(() => buildInsumos({ ...data, today }), [data, today]);
  const zonas = React.useMemo(() => zonasCon(base), [base]);

  const [vista, setVista] = React.useState<Vista>(() => zonas[0] ?? "marcado");
  const [q, setQ] = React.useState("");
  const [noteId, setNoteId] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [cola, setCola] = React.useState<MarcaPendiente[]>([]);
  // Taps the server confirmed, kept until the refreshed list carries them.
  const [aplicadas, setAplicadas] = React.useState<MarcaPendiente[]>([]);
  const [guardadoId, setGuardadoId] = React.useState<string | null>(null);
  const [fallo, setFallo] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({ nombre: "", zona: "Barra", marca: "agotado", nota: "" });
  const [guardando, setGuardando] = React.useState(false);
  const enviando = React.useRef(false);
  const guardadoTimer = React.useRef<number | undefined>(undefined);
  const avisoTimer = React.useRef<number | undefined>(undefined);
  const cargada = React.useRef(false);

  // The queue survives a reload or a lost tab.
  React.useEffect(() => {
    if (cargada.current) return;
    cargada.current = true;
    const ids = new Set(data.items.map((i) => i.id));
    const c = leerCola().filter((p) => ids.has(p.ingredienteId));
    if (c.length) queueMicrotask(() => setCola(c));
  }, [data.items]);
  React.useEffect(() => {
    if (cargada.current) guardarCola(cola);
  }, [cola]);
  // A fresh list from the server already has what was confirmed.
  React.useEffect(() => {
    queueMicrotask(() => setAplicadas([]));
  }, [data]);
  React.useEffect(() => () => {
    window.clearTimeout(guardadoTimer.current);
    window.clearTimeout(avisoTimer.current);
  }, []);

  const mostrarAviso = React.useCallback((tipo: "ok" | "error", texto: string) => {
    setAviso({ tipo, texto });
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 6000);
  }, []);

  const enviar = React.useCallback(async (lote: MarcaPendiente[]) => {
    if (enviando.current || !lote.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    enviando.current = true;
    try {
      const res = await marcarInsumos({ items: lote.map((p) => ({ ingredienteId: p.ingredienteId, marca: p.marca, note: p.note, at: p.at })) });
      const sent = (p: MarcaPendiente) => lote.some((s) => s.ingredienteId === p.ingredienteId && s.at === p.at);
      if (res.ok) {
        setFallo(false);
        setCola((c) => c.filter((p) => !sent(p)));
        setAplicadas((a) => lote.reduce((acc, p) => encolar(acc, p), a));
        const last = lote[lote.length - 1];
        setGuardadoId(last.ingredienteId);
        window.clearTimeout(guardadoTimer.current);
        guardadoTimer.current = window.setTimeout(() => setGuardadoId(null), GUARDADO_MS);
        router.refresh();
      } else if (res.sinAcceso) {
        setFallo(true);
        mostrarAviso("error", res.error);
      } else {
        // The server refused it (an item left the list): drop it, say so.
        setCola((c) => c.filter((p) => !sent(p)));
        mostrarAviso("error", res.error);
        router.refresh();
      }
    } catch {
      // No answer: the taps stay queued and go out with the next retry.
      setFallo(true);
    } finally {
      enviando.current = false;
    }
  }, [router, mostrarAviso]);

  // Send what is queued as soon as it can: now, when the internet is back, and every 15 s while something waits.
  React.useEffect(() => {
    if (!cola.length || !online) return;
    // Deferred: the send updates state when it answers, never inside this effect's own pass.
    queueMicrotask(() => void enviar(cola));
    const id = window.setInterval(() => void enviar(leerCola()), REINTENTO_MS);
    return () => window.clearInterval(id);
  }, [cola, online, enviar]);

  const rows = React.useMemo(() => conPendientes(base, [...aplicadas, ...cola]), [base, aplicadas, cola]);
  const enEspera = React.useMemo(() => new Set(cola.map((p) => p.ingredienteId)), [cola]);
  const esperaVisible = !online || fallo;
  const counts = contar(rows);
  const entradas = rail(rows);
  const vistaArmada = addOpen ? null : armarVista(rows, vista, q);
  const sugerencias = addOpen ? parecidosA(draft.nombre, rows) : [];

  function marcar(x: Insumo, marca: Marca, note: string | null = x.note) {
    if (x.nuevo) return;
    const p: MarcaPendiente = { ingredienteId: x.id, marca, note: note?.trim() || null, at: new Date().toISOString(), by: actorName };
    setCola((c) => encolar(c, p));
    setAviso(null);
  }

  function abrirNota(x: Insumo) {
    if (noteId === x.id) {
      setNoteId(null);
      return;
    }
    setNoteId(x.id);
    setNoteDraft(x.note ?? "");
  }
  function guardarNota(x: Insumo, texto: string) {
    setNoteId(null);
    if ((texto.trim() || null) === (x.note ?? null)) return;
    marcar(x, x.marca, texto);
  }

  function irA(v: Vista) {
    setVista(v);
    setQ("");
    setAddOpen(false);
  }
  function abrirAlta(nombre: string) {
    const zona = (ZONAS as readonly string[]).includes(vista) ? (vista as ZonaAlta) : "Barra";
    setDraft({ nombre, zona, marca: "agotado", nota: "" });
    setQ("");
    setAddOpen(true);
  }
  async function guardarAlta() {
    const nombre = draft.nombre.trim();
    if (nombre.length < 2 || guardando) return;
    if (!online) {
      mostrarAviso("error", "Sin conexión: agrégalo cuando vuelva el internet. Lo que está en la lista sí se puede marcar.");
      return;
    }
    setGuardando(true);
    try {
      const res = await agregarNoListado({ nombre, zona: draft.zona, marca: draft.marca, nota: draft.nota.trim() || undefined });
      if (res.ok) {
        setAddOpen(false);
        setVista(draft.zona);
        mostrarAviso("ok", res.repetida ? `«${nombre}» ya estaba avisado: el dueño lo tiene en Por pedir.` : `Guardado ✓ · «${nombre}» quedó marcado y el dueño lo ve en Por pedir.`);
        router.refresh();
      } else if (res.existe) {
        const existente = rows.find((r) => r.id === res.existe!.id);
        if (existente) {
          marcar(existente, draft.marca, draft.nota || existente.note);
          setAddOpen(false);
          setVista(existente.zona);
          mostrarAviso("ok", `Ya estaba en la lista como «${existente.name}»: quedó marcado ${draft.marca === "agotado" ? "agotado" : "en poco"}.`);
        } else mostrarAviso("error", res.error);
      } else mostrarAviso("error", res.error);
    } catch {
      mostrarAviso("error", "No se pudo guardar. Revisa el internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const searchProps = {
    value: q,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setQ(e.target.value);
      setAddOpen(false);
    },
    placeholder: "Buscar insumo…",
    "aria-label": "Buscar insumo en todas las zonas",
    type: "search" as const,
    autoComplete: "off",
  };
  const borrar = q ? (
    <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" style={{ width: 36, height: 36, border: "none", borderRadius: 12, background: "var(--paper)", fontSize: 16, fontWeight: 800 }}>×</button>
  ) : null;

  const tools = (
    <>
      <Link href="/turno/inventario/recibir" className="acab-tool">
        <span style={{ flex: 1 }}>Recibir pedido<br /><small>{porLlegar ? `${porLlegar} por llegar` : "nada por llegar"}</small></span>
      </Link>
      <Link href="/turno/inventario/merma" className="acab-tool">
        <span style={{ flex: 1 }}>Registrar merma<br /><small>se cayó, se dañó, se venció</small></span>
      </Link>
      {isAdmin && <Link href="/inventario/pedidos" className="acab-tool">Por pedir · panel →</Link>}
    </>
  );

  return (
    <div className="acab">
      <style>{CSS}</style>
      {/* The app header (title, person, clock) comes from EquipoShell; this bar keeps search + the tally. */}
      <header className="acab-head">
        <label className="acab-search acab-search-head"><Lupa /><input {...searchProps} />{borrar}</label>
        <div style={{ flexGrow: 1 }} />
        <div className="acab-pill" role="status" aria-live="polite">
          {counts.poco || counts.agotado ? (
            <>
              <span style={{ background: "var(--brand-soft)" }}>{counts.poco} en poco</span>
              <span style={{ background: "var(--late-soft)", color: "var(--late)" }}>{counts.agotado} agotado</span>
            </>
          ) : (
            <span style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>Nada en poco ni agotado</span>
          )}
          <span style={{ background: "var(--surface)", color: "var(--muted)", fontWeight: 500 }}>{counts.camino} en camino</span>
        </div>
        <span className="acab-online" style={{ color: online ? "var(--ok)" : "var(--late)" }} title={actorName}>
          <span className="acab-dot" style={{ background: online ? "var(--ok)" : "var(--late)" }} />{online ? "En línea" : "Sin conexión"}
        </span>
      </header>

      {esperaVisible && cola.length > 0 && (
        <div className="acab-offline" role="status">
          <SinRed />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{online ? "No se pudo enviar" : "Sin conexión"}</span>
            <span style={{ fontSize: 13 }}>{online ? "Se reintenta solo en unos segundos." : "Se guarda cuando vuelva el internet."}</span>
          </div>
          <span style={{ padding: "6px 10px", borderRadius: 12, background: "var(--acab-poco)", color: "#1f1a14", fontSize: 12, fontWeight: 800 }}>{cola.length} en espera</span>
        </div>
      )}

      <div className="acab-body">
        <nav className="acab-rail" aria-label="Zonas">
          <label className="acab-search acab-search-bar"><Lupa /><input {...searchProps} />{borrar}</label>
          {entradas.map((r) => {
            const on = !q && !addOpen && vista === r.vista;
            return (
              <button
                key={r.vista}
                type="button"
                onClick={() => irA(r.vista)}
                aria-pressed={on}
                className={`acab-railbtn${r.vista === "marcado" ? " acab-railgap" : ""}`}
                style={{ background: on ? "var(--ink)" : "var(--paper-lt)", color: on ? "var(--paper-lt)" : "var(--ink)" }}
              >
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="font-bold" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.label}</span>
                  <span className="acab-sub">{r.sub}</span>
                </span>
                {r.flags > 0 && (
                  <span className="acab-badge" style={{ background: r.urgente ? "var(--acab-agot)" : "var(--acab-poco)", color: r.urgente ? "#fff" : "#1f1a14" }} aria-label={`${r.flags} marcados`}>{r.flags}</span>
                )}
              </button>
            );
          })}
          <div className="acab-spacer" />
          <button type="button" className="acab-add" onClick={() => abrirAlta("")} style={{ background: addOpen ? "var(--acab-row-poco)" : "transparent" }}>
            <Mas /> Algo que no está en la lista
          </button>
          <div className="acab-tools">{tools}</div>
        </nav>

        <main className="acab-main">
          {aviso && <div className={aviso.tipo === "ok" ? "acab-flash" : "acab-error"} role={aviso.tipo === "ok" ? "status" : "alert"}>{aviso.texto}</div>}

          {!addOpen && !q && verificar.length > 0 && <VerificarCard items={verificar} />}

          {addOpen ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h2 className="acab-h2">Agregar algo que no está</h2>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Queda marcado y el dueño lo ve en Por pedir</span>
              </div>
              <div className="acab-form-wrap">
                <form className="acab-form" onSubmit={(e) => { e.preventDefault(); void guardarAlta(); }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span className="acab-label">1 · ¿QUÉ SE ACABÓ?</span>
                    <input className="acab-field" value={draft.nombre} onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))} placeholder="Ej: leche de coco, vasos 16 oz…" maxLength={80} autoFocus />
                  </label>
                  <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    <legend className="acab-label" style={{ marginBottom: 8 }}>2 · ¿CÓMO ESTÁ?</legend>
                    <div className="acab-two">
                      <button type="button" className="acab-opt poco" aria-pressed={draft.marca === "poco"} onClick={() => setDraft((d) => ({ ...d, marca: "poco" }))} style={{ minHeight: 64, fontSize: 16, fontWeight: 800 }}>POCO <span style={{ fontWeight: 400, fontSize: 12 }}>· queda menos de 1</span></button>
                      <button type="button" className="acab-opt agot" aria-pressed={draft.marca === "agotado"} onClick={() => setDraft((d) => ({ ...d, marca: "agotado" }))} style={{ minHeight: 64, fontSize: 16, fontWeight: 800 }}>AGOTADO <span style={{ fontWeight: 400, fontSize: 12 }}>· no queda nada</span></button>
                    </div>
                  </fieldset>
                  <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                    <legend className="acab-label" style={{ marginBottom: 8 }}>3 · ¿DÓNDE SE GUARDA?</legend>
                    <div className="acab-zonas">
                      {ZONAS.map((z) => (
                        <button key={z} type="button" className="acab-opt" aria-pressed={draft.zona === z} onClick={() => setDraft((d) => ({ ...d, zona: z }))}>{z}</button>
                      ))}
                    </div>
                  </fieldset>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span className="acab-label">NOTA PARA EL DUEÑO · OPCIONAL</span>
                    <input className="acab-field sm" value={draft.nota} onChange={(e) => setDraft((d) => ({ ...d, nota: e.target.value }))} placeholder="Marca, tamaño, para qué se usa…" maxLength={200} />
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="submit" className="acab-solid" style={{ flex: 1 }} disabled={draft.nombre.trim().length < 2 || guardando}>{guardando ? "Guardando…" : "Guardar y avisar al dueño"}</button>
                    <button type="button" className="acab-ghost" onClick={() => setAddOpen(false)}>Cancelar</button>
                  </div>
                </form>
                <aside className="acab-aside" aria-label="Insumos parecidos">
                  <span className="acab-label">¿ES ALGUNO DE ESTOS?</span>
                  {sugerencias.length ? (
                    sugerencias.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="acab-sugg"
                        onClick={() => {
                          marcar(s, draft.marca);
                          setAddOpen(false);
                          setVista(s.zona);
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.zona} · tocar para marcarlo {draft.marca === "agotado" ? "agotado" : "en poco"}</span>
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>Mientras escribes, aquí aparecen insumos parecidos para no crear uno repetido.</span>
                  )}
                </aside>
              </div>
            </>
          ) : vistaArmada ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h2 className="acab-h2">{vistaArmada.titulo}</h2>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{vistaArmada.sub}</span>
              </div>

              {vistaArmada.todoEnOrden && (
                <div className="acab-card acab-okcard">
                  <div style={{ width: 72, height: 72, borderRadius: 36, border: "1px solid var(--line)", background: "color-mix(in srgb, var(--acab-ok) 14%, var(--paper-lt))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--acab-ok-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </div>
                  <span className="font-bold" style={{ fontSize: 28, color: "var(--acab-ok-ink)" }}>Todo en orden ✓</span>
                  <span style={{ fontSize: 14, maxWidth: 380, lineHeight: 1.45 }}>Nada se está acabando. Si ves algo bajo, márcalo en <b>POCO</b> antes de que se agote.</span>
                  {zonas[0] && <button type="button" className="acab-ghost" style={{ height: 48 }} onClick={() => irA(zonas[0])}>Ver los {rows.length} insumos</button>}
                </div>
              )}

              {vistaArmada.secciones.map((s) => (
                <section key={s.label} style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label={s.label}>
                  <h3 className="acab-h3">{s.label}</h3>
                  <div className="acab-grid">
                    {s.items.map((x) => (
                      <Fila
                        key={x.id}
                        x={x}
                        today={today}
                        conZona={s.conZona}
                        guardado={guardadoId === x.id && !enEspera.has(x.id)}
                        enEspera={esperaVisible && enEspera.has(x.id)}
                        noteOpen={noteId === x.id}
                        noteDraft={noteDraft}
                        onNoteDraft={setNoteDraft}
                        onMarcar={(m) => marcar(x, m)}
                        onToggleNote={() => abrirNota(x)}
                        onGuardarNota={(t) => guardarNota(x, t)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {vistaArmada.sinResultados && (
                <div className="acab-card">
                  <span className="font-bold" style={{ fontSize: 22 }}>«{q.trim()}» no está en la lista</span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>Revisa cómo está escrito. Si de verdad no está, agrégalo: queda marcado y el dueño lo ve en Por pedir.</span>
                  <button type="button" className="acab-solid" onClick={() => abrirAlta(q.trim())}><Mas /> Agregar «{q.trim()}»</button>
                </div>
              )}

              <div className="acab-tools acab-tools-bottom">{tools}</div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Fila({ x, today, conZona, guardado, enEspera, noteOpen, noteDraft, onNoteDraft, onMarcar, onToggleNote, onGuardarNota }: {
  x: Insumo;
  today: string;
  conZona: boolean;
  guardado: boolean;
  enEspera: boolean;
  noteOpen: boolean;
  noteDraft: string;
  onNoteDraft: (v: string) => void;
  onMarcar: (m: Marca) => void;
  onToggleNote: () => void;
  onGuardarNota: (texto: string) => void;
}) {
  const meta = metaInsumo(x, today, { guardado, enEspera, conZona });
  const tono = guardado ? "ok" : x.pedido ? "camino" : x.marca === "hay" ? undefined : x.marca;
  const camino = x.pedido ? "1" : undefined;
  return (
    <div className="acab-item">
      <div className="acab-row" data-marca={x.marca} data-camino={camino} data-guardado={guardado ? "1" : undefined} data-espera={enEspera ? "1" : undefined} data-insumo={x.name}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div className="acab-name">{x.name}{x.marca !== "hay" && !x.nuevo && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}> · {x.pack}</span>}</div>
          <div className="acab-meta" data-tono={tono}>
            {enEspera && <Reloj />}
            {x.pedido && !guardado && <Camion />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</span>
          </div>
        </div>
        {x.nuevo ? (
          <span className="acab-tag">LO REVISA EL DUEÑO</span>
        ) : (
          <>
            <div className="acab-btns" data-camino={camino}>
              {(["hay", "poco", "agotado"] as const).map((m) => (
                <button key={m} type="button" className="acab-mb" data-m={m} aria-pressed={x.marca === m} aria-label={`${x.name}: ${MARCAS[m].label.toLowerCase()}`} onClick={() => onMarcar(m)}>
                  {MARCAS[m].boton}
                </button>
              ))}
            </div>
            <button type="button" className="acab-note-btn" data-on={noteOpen || x.note ? "1" : undefined} onClick={onToggleNote} aria-label={`Nota para ${x.name}`} aria-expanded={noteOpen}>
              <Lapiz />
            </button>
          </>
        )}
      </div>
      {noteOpen && (
        <form className="acab-notepanel" onSubmit={(e) => { e.preventDefault(); onGuardarNota(noteDraft); }}>
          <input value={noteDraft} onChange={(e) => onNoteDraft(e.target.value)} placeholder="Nota corta (opcional)" aria-label={`Nota para ${x.name}`} maxLength={120} autoFocus />
          {NOTAS_RAPIDAS.map((c) => (
            <button key={c} type="button" className="acab-chip" onClick={() => onGuardarNota(c)}>{c}</button>
          ))}
          <button type="submit" className="acab-chip" style={{ background: "var(--ink)", color: "var(--paper-lt)", fontWeight: 800 }}>Guardar</button>
        </form>
      )}
    </div>
  );
}

/** «Verificar insumos» (canvas Main): what the assistant asks to count today, and the door to the count. */
function VerificarCard({ items }: { items: VerificarItem[] }) {
  return (
    <section className="acab-verif" aria-labelledby="acab-verif-t">
      <div className="acab-verif-top">
        <span className="acab-verif-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9.5 13l2 2 3.5-4" /></svg>
        </span>
        <h2 id="acab-verif-t" className="acab-h2" style={{ fontSize: 22, lineHeight: 1.25 }}>Verificar insumos</h2>
      </div>
      <ul className="acab-verif-list">
        {items.map((v) => (
          <li key={v.id} className="acab-vrow">
            <span className="acab-vdot" aria-hidden="true" />
            <span className="acab-name" style={{ flex: 1, minWidth: 0 }}>{v.name}</span>
            {v.ubicacion && <span className="acab-tag">{v.ubicacion}</span>}
          </li>
        ))}
      </ul>
      <Link href="/turno/inventario/verificar" className="acab-verif-go">
        Empezar a verificar
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
    </section>
  );
}
