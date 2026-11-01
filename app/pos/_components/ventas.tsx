"use client";

/**
 * Ventas.dc.html — /pos/ventas, «Hoy en ventas». The team's numbers for
 * today, yesterday or this week: Vendido (vs. the same span a week ago),
 * Pedidos, Ticket promedio, Meta del día; sales by hour; best sellers by
 * units (+ the Favoritos nobody bought, «Ofrécelos»); how people paid; and
 * who rang up what. Aggregation in lib/pos/ventas.ts (server action
 * `resumenVentas`); offline the same summary runs over this device's sales.
 *
 * Refreshes with every sale: the pending-orders list (`s.pendientes`) is
 * reloaded after each sale and each nudge from another station, and the
 * outbox changes when this one sells — either one triggers a reload.
 */
import * as React from "react";
import { resumenVentas, type ResumenVentasResult } from "../actions";
import { useCatalog, usePos, closeVentas, openOrdenes, offerUnsold, ventasLocales } from "../pos-store";
import {
  VENTAS_PERIODOS,
  deltaPct,
  etiquetaComparacion,
  fechaLarga,
  metaDelPeriodo,
  resumirVentas,
  ventanaVentas,
  type ResumenVentas,
  type VentasPeriodo,
} from "@/lib/pos/ventas";
import { favoritos } from "./catalog";
import { Clock, IconBack, money } from "./ordenes";
import { initials, useNow } from "./ticket";

const PERIODO_LABEL: Record<VentasPeriodo, string> = { hoy: "Hoy", ayer: "Ayer", semana: "Esta semana" };
const PERIODO_WORD: Record<VentasPeriodo, string> = { hoy: "hoy", ayer: "ayer", semana: "esta semana" };
const METODO_LABEL = { efectivo: "Efectivo", transferencia: "Transferencia", datafono: "Datáfono" } as const;
const META_KEY = "pos:meta-diaria";

interface VentasData {
  periodo: VentasPeriodo;
  resumen: ResumenVentas;
  /** null offline: there is nothing to compare this device's sales with. */
  antes: number | null;
  metaDiaria: number | null;
  nombres: Record<string, string>;
  local: boolean;
  at: number;
}

/** A server answer, or null when the server can't be reached (15 s). */
async function fetchResumen(periodo: VentasPeriodo): Promise<ResumenVentasResult | null> {
  try {
    return await Promise.race([
      resumenVentas({ periodo }),
      new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
    ]);
  } catch {
    return null;
  }
}

function readMeta(): number | null {
  try { return Number(window.localStorage.getItem(META_KEY)) || null; } catch { return null; }
}

/** What this device sold in the period (offline). */
function resumenLocal(periodo: VentasPeriodo): ResumenVentas {
  const now = Date.now();
  const w = ventanaVentas(periodo, now);
  const rows = ventasLocales().filter((o) => {
    const t = Date.parse(o.createdAt);
    return t >= w.desde && t < w.hasta;
  });
  return resumirVentas(rows, { periodo, now });
}

// ── number formats ──────────────────────────────────────────────
const dec1 = (n: number) => n.toFixed(1).replace(".", ",");
/** 9 → «9 a. m.», 12 → «12 m.», 15 → «3 p. m.». */
function horaLarga(h: number): string {
  const hh = ((h + 23) % 24) + 1;
  if (h === 12) return "12 m.";
  if (h === 0 || h === 24) return "12 a. m.";
  return h < 12 ? `${hh} a. m.` : `${hh - 12} p. m.`;
}
/** «9–10 a. m.», «11 a. m.–12 m.», «3–4 p. m.». */
function rangoHora(h: number): string {
  const a = horaLarga(h);
  const b = horaLarga(h + 1);
  const suf = (x: string) => x.replace(/^\d+\s*/, "");
  return suf(a) === suf(b) ? `${a.split(" ")[0]}–${b}` : `${a}–${b}`;
}
/** «6:32» Bogotá. */
function clockOf(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3_600_000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function VentasPage() {
  const s = usePos();
  const [periodo, setPeriodo] = React.useState<VentasPeriodo>("hoy");
  const [data, setData] = React.useState<VentasData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const req = React.useRef(0);

  const load = React.useCallback(async (p: VentasPeriodo) => {
    const id = ++req.current;
    const r = await fetchResumen(p);
    if (id !== req.current) return;
    if (r && r.ok) {
      try { window.localStorage.setItem(META_KEY, String(r.metaDiaria ?? "")); } catch { /* ignore */ }
      setError(null);
      setData({ periodo: p, resumen: r.resumen, antes: r.antes, metaDiaria: r.metaDiaria, nombres: r.nombres, local: false, at: r.at });
      return;
    }
    if (r && !r.ok) {
      setError(r.error);
      return;
    }
    // No server: only what this device sold.
    setError(null);
    setData({ periodo: p, resumen: resumenLocal(p), antes: null, metaDiaria: readMeta(), nombres: {}, local: true, at: Date.now() });
  }, []);

  // Period change → reload at once.
  React.useEffect(() => {
    const t = window.setTimeout(() => void load(periodo), 0);
    return () => window.clearTimeout(t);
  }, [periodo, load]);

  // Every sale (here or at another station) reloads the pending list; follow it.
  const saleSig = `${s.pendientes.map((o) => `${o.id}:${o.status}`).join(",")}|${s.outbox.length}|${s.online}`;
  // The period is read from a ref: a period switch already loads above, and a
  // sale must reload the period on screen, not the one this effect was made with.
  const periodoRef = React.useRef(periodo);
  React.useEffect(() => { periodoRef.current = periodo; }, [periodo]);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => void load(periodoRef.current), 600);
    return () => window.clearTimeout(t);
  }, [saleSig, load]);

  // And once a minute while visible (the current hour moves, paid pendientes change state).
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(periodo);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [periodo, load]);

  // While another period loads, the last numbers stay up (dimmed) instead of a blank page.
  const shown = data;
  const stale = !!data && data.periodo !== periodo;
  const r = shown?.resumen ?? null;

  const clockNow = useNow();
  const subtitle = (() => {
    const now = shown?.at ?? clockNow;
    if (!now) return "";
    const p = shown?.periodo ?? periodo;
    const w = ventanaVentas(p, now);
    const when = p === "semana" ? `Semana del ${fechaLarga(w.desde).replace(/^\w/, (c) => c.toLowerCase())}` : fechaLarga(p === "ayer" ? w.desde : now);
    if (shown?.local) return `${when} · sin conexión: solo lo vendido en este dispositivo`;
    return `${when} · se actualiza con cada venta`;
  })();

  return (
    <div className="vt" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="topbar vt-top">
        <button type="button" className="icon-btn" onClick={closeVentas} aria-label="Volver a vender"><IconBack /></button>
        <div className="grow vt-title">
          <h1 className="h2">Hoy en ventas</h1>
          <span className="muted vt-sub">{subtitle}</span>
        </div>
        <Seg className="vt-seg-top" value={periodo} onChange={setPeriodo} />
        <Clock />
      </header>

      <div className={"body vt-body" + (stale ? " vt-stale" : "")} aria-busy={stale || undefined}>
        <Seg className="vt-seg-body" value={periodo} onChange={setPeriodo} />
        {error && !r && (
          <div className="empty" role="alert" style={{ flex: 1 }}>
            <span>{error}</span>
            <button type="button" className="btn ghost sm" onClick={() => void load(periodo)}>Reintentar</button>
          </div>
        )}
        {!error && !r && <div className="empty" aria-busy="true" style={{ flex: 1 }}><span>Cargando ventas…</span></div>}
        {r && shown && (
          <>
            <section className="grow vt-main" aria-label="Resumen">
              <Kpis d={shown} />
              <PorHora r={r} />
              <PorBarista r={r} nombres={shown.nombres} />
            </section>
            <aside className="vt-side">
              <MasVendidos r={r} periodo={shown.periodo} />
              <ComoPagaron r={r} porVerificar={s.pendientes.filter((o) => o.porVerificar === "transferencia").length} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function Seg({ className, value, onChange }: { className: string; value: VentasPeriodo; onChange: (p: VentasPeriodo) => void }) {
  return (
    <div className={"seg " + className} role="group" aria-label="Periodo">
      {VENTAS_PERIODOS.map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}>{PERIODO_LABEL[p]}</button>
      ))}
    </div>
  );
}
function MasVendidos({ r, periodo }: { r: ResumenVentas; periodo: VentasPeriodo }) {
  const catalog = useCatalog();
  const top = r.productos.slice(0, 8);
  const max = top[0]?.qty ?? 0;
  const sold = new Set(r.productos.map((p) => p.key));
  const unsold = favoritos(catalog).filter((p) => !sold.has(p.id) && p.stock !== "sin");
  const word = PERIODO_WORD[periodo];
  return (
    <section className="card vt-top8" aria-labelledby="vt-top">
      <div className="vt-h">
        <h2 id="vt-top" className="h2">Más vendidos {word}</h2>
        <span className="muted">unidades</span>
      </div>
      {top.length === 0 && <p className="muted vt-none">Todavía no se ha vendido nada {word}.</p>}
      {top.map((p, i) => (
        <div key={p.key} className="vt-rank">
          <span className="rn">{i + 1}</span>
          <span className="nm">{p.name}</span>
          <span className="tr"><span style={{ width: `${max ? Math.max(4, Math.round((p.qty / max) * 100)) : 0}%` }} /></span>
          <span className="ct">{p.qty}</span>
        </div>
      ))}
      <div className="vt-unsold">
        {unsold.length ? (
          <>
            <span className="muted grow">Sin vender {word}: {unsold.map((p) => p.name).join(", ")}</span>
            <button type="button" className="vt-offer" onClick={() => offerUnsold(`Sin vender ${word}`, unsold.map((p) => p.id))}>
              <span className="pill brand">Ofrécelos</span>
            </button>
          </>
        ) : (
          <span className="muted">Todos los favoritos se vendieron {word}.</span>
        )}
      </div>
    </section>
  );
}

function Kpis({ d }: { d: VentasData }) {
  const r = d.resumen;
  const word = PERIODO_WORD[d.periodo];
  const delta = d.antes === null ? null : deltaPct(r.vendido, d.antes);
  const cmp = etiquetaComparacion(d.periodo, d.at);
  const vsText = d.antes === null
    ? "Sin comparación mientras no hay conexión"
    : delta === null
      ? `Sin ventas ${cmp}`
      : r.vendido === 0
        ? `${money(d.antes)} ${cmp}`
        : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)} % vs. ${cmp}`;
  const extras = [
    r.cancelados ? plural(r.cancelados, "cancelado", "cancelados") : "",
    r.sinPagar ? `${r.sinPagar} sin pagar` : "",
  ].filter(Boolean).join(" · ");
  const meta = metaDelPeriodo(d.metaDiaria, d.periodo);
  const pct = meta ? Math.floor((r.vendido / meta) * 100) : null;
  return (
    <div className="vt-kpis">
      <div className="vt-kpi">
        <span className="label">Vendido {word}</span>
        <span className={"v" + (money(r.vendido).length > 9 ? " long" : "")}>{money(r.vendido)}</span>
        <span className={"d" + (r.vendido > 0 && delta !== null && delta > 0 ? " up" : r.vendido > 0 && delta !== null && delta < 0 ? " down" : "")}>{vsText}</span>
      </div>
      <div className="vt-kpi">
        <span className="label">Pedidos</span>
        <span className="v">{r.pedidos}</span>
        <span className="d">{extras || (r.pedidos ? "Todos pagados, ninguno cancelado" : "Sin pedidos todavía")}</span>
      </div>
      <div className="vt-kpi">
        <span className="label">Ticket promedio</span>
        <span className={"v" + (money(r.ticket).length > 9 ? " long" : "")}>{money(r.ticket)}</span>
        <span className="d">{r.pagadas ? `${dec1(r.itemsPorPedido)} ítems por pedido` : "Sin ventas pagadas"}</span>
      </div>
      <div className="vt-kpi meta">
        <span className="label">{d.periodo === "semana" ? "Meta de la semana" : "Meta del día"}</span>
        <span className="v">{pct === null ? "—" : `${pct} %`}</span>
        <span className="d">
          {meta === null
            ? "Sin meta · se pone en Ajustes › Sede"
            : r.vendido >= meta
              ? `¡Cumplida! ${money(r.vendido - meta)} por encima de ${money(meta)}`
              : `Faltan ${money(meta - r.vendido)} para ${money(meta)}`}
        </span>
      </div>
    </div>
  );
}

function PorHora({ r }: { r: ResumenVentas }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(0, ...r.horas.map((h) => h.total));
  const peak = max > 0 ? r.horas.find((h) => h.total === max)! : null;
  const now = r.horaActual;
  const summary = peak
    ? `Ventas por hora: pico de ${money(peak.total)} entre ${rangoHora(peak.hora)}${now !== null ? `; son las ${horaLarga(now)}` : ""}`
    : "Ventas por hora: aún sin ventas";
  return (
    <div className="card vt-hours-card" aria-labelledby="vt-ph">
      <div className="vt-h">
        <h2 id="vt-ph" className="h2">Ventas por hora</h2>
        <span className="muted">
          {peak ? `Pico ${rangoHora(peak.hora)} · ${money(peak.total)}` : "Aún sin ventas"}
          {now !== null ? " · en gris, las horas que faltan" : ""}
        </span>
      </div>
      <div className="vt-hours" role="group" aria-label={summary} style={{ gridTemplateColumns: `repeat(${r.horas.length}, minmax(0, 1fr))` }} onPointerLeave={() => setHover(null)}>
        {r.horas.map((h, i) => {
          const kind = now === null || h.hora < now ? "past" : h.hora === now ? "now" : "future";
          const pct = kind === "future" ? 8 : max ? (h.total / max) * 100 : 0;
          const isPeak = peak?.hora === h.hora;
          const label = `${rangoHora(h.hora)}: ${kind === "future" ? "aún no llega" : `${money(h.total)} · ${plural(h.pedidos, "pedido", "pedidos")}`}`;
          return (
            <div
              key={h.hora}
              className="hcol"
              tabIndex={0}
              aria-label={label}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((v) => (v === i ? null : v))}
              onClick={() => setHover((v) => (v === i ? null : i))}
            >
              {hover === i && <span className="vt-tip" role="tooltip">{label}</span>}
              <div className="hwell">
                <div className={"hbar " + kind} style={{ height: `${kind === "future" ? 8 : Math.max(kind === "now" ? 3 : 1, pct)}%` }}>
                  {isPeak ? <span className="hval">{money(h.total)}</span> : kind === "now" ? <span className="hval">ahora</span> : null}
                </div>
              </div>
              <span className="hlab">{h.hora}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PorBarista({ r, nombres }: { r: ResumenVentas; nombres: Record<string, string> }) {
  const s = usePos();
  const catalog = useCatalog();
  const nameOf = (id: string | null) => {
    if (!id) return "Sin persona";
    return nombres[id] || catalog.equipo.find((m) => m.id === id)?.name || (s.person?.id === id ? s.person.name : "") || "Alguien del equipo";
  };
  return (
    <div className="card tight vt-bar" aria-labelledby="vt-pb">
      <h2 id="vt-pb" className="h2">Por barista</h2>
      {r.personas.length === 0 ? (
        <p className="muted vt-none">Nadie ha vendido todavía.</p>
      ) : (
        <div className="vt-people">
          {r.personas.map((p) => {
            const name = nameOf(p.id);
            return (
              <div key={p.id ?? "-"} className="vt-person">
                <span className="avatar">{initials(name)}</span>
                <span className="grow">
                  <span className="vt-pn">{name.split(" ")[0] || name}</span>
                  <span className="muted vt-ps">desde {clockOf(p.desde)}</span>
                </span>
                <span className="num vt-pv">{p.pedidos} · {money(p.total)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComoPagaron({ r, porVerificar }: { r: ResumenVentas; porVerificar: number }) {
  const sum = r.pagos.reduce((n, p) => n + p.amount, 0);
  return (
    <section className="card tight vt-pay" aria-labelledby="vt-pm">
      <h2 id="vt-pm" className="h2">Cómo pagaron</h2>
      {r.pagos.map((p) => (
        <div key={p.method} className="pay">
          <span className="pct">{sum ? Math.round((p.amount / sum) * 100) : 0} %</span>
          <span className="grow">{METODO_LABEL[p.method]}</span>
          <span className="amt">{p.count} · {money(p.amount)}</span>
        </div>
      ))}
      {porVerificar > 0 && (
        <div className="pay vt-verify">
          <span className="pct" style={{ color: "var(--late)" }}>{porVerificar}</span>
          <span className="grow">Transferencia{porVerificar === 1 ? "" : "s"} por verificar</span>
          <button type="button" className="btn ghost sm" onClick={() => openOrdenes("pendiente")}>Ver</button>
        </div>
      )}
    </section>
  );
}
