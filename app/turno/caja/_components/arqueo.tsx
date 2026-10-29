"use client";

import * as React from "react";
import { DENOMINACIONES_COP, totalContado } from "@/lib/caja/arqueo";
import { describirLineas, planBase, type PlanBase } from "@/lib/caja/base";
import { MOTIVO_CAJA } from "@/lib/caja/movimientos";
import type { CierreInput, EnviarCierreResult } from "@/lib/caja/cierres";
import type { CajaCierre, CajaDenominacion } from "@/lib/types";
import { IcoAlerta, IcoCheck, IcoInfo, IcoNube, IcoSigue } from "./icons";
import { hora, plata, plataSigno, type MovVista } from "./model";
import { Contador, FlowBar, type StepState } from "./parts";

export type ResultadoCierre = Extract<EnviarCierreResult, { ok: true }>;
type Draft = { cantidades: Record<string, number>; baseInicial: number | null };

const draftKey = (today: string, instanceId: string) => `caja:draft:${today}:${instanceId}`;
function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    // Drafts of the old screen kept the counts and the base as text.
    if (d?.cantidades) for (const k of Object.keys(d.cantidades)) d.cantidades[k] = Math.max(0, Math.round(Number(d.cantidades[k]) || 0));
    if (d && d.baseInicial != null) d.baseInicial = Number.isFinite(Number(d.baseInicial)) ? Math.max(0, Math.round(Number(d.baseInicial))) : null;
    return d;
  } catch {
    return null;
  }
}
export function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(key, JSON.stringify(d));
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}
export { draftKey };

const NOTAS_DIF = ["Di mal una vuelta", "Un domicilio sin registrar", "Conté mal, ya revisé", "No sé qué pasó"];

/** What the base step needs, from a result just sent or from a cierre already stored. */
interface BaseData {
  cierreId: string;
  contado: number;
  diferencia: number | null;
  baseDejada: number;
  plan: PlanBase;
  denominaciones: CajaDenominacion[];
  confirmadaAt: string | null;
  confirmadaBy: string | null;
}

function baseDeResultado(r: ResultadoCierre, contadas: CajaDenominacion[]): BaseData {
  const comparable = r.pagos.count > 0 || r.ingresos > 0 || r.salidas > 0;
  return { cierreId: r.cierreId, contado: r.contado, diferencia: comparable ? r.diferencia : null, baseDejada: r.baseDejada, plan: r.plan, denominaciones: contadas, confirmadaAt: null, confirmadaBy: null };
}
function baseDeCierre(c: CajaCierre): BaseData {
  const total = c.base_denominaciones.reduce((s, l) => s + l.valor * l.cantidad, 0);
  const enBase = new Map(c.base_denominaciones.map((l) => [l.valor, l.cantidad]));
  const resto = c.denominaciones.map((d) => ({ valor: d.valor, cantidad: d.cantidad - (enBase.get(d.valor) ?? 0) })).filter((d) => d.cantidad > 0);
  return {
    cierreId: c.id,
    contado: c.contado_cop,
    diferencia: c.pagos_count > 0 ? c.diferencia_cop : null,
    baseDejada: c.base_dejada_cop,
    plan: { objetivo: c.base_dejada_cop, lineas: c.base_denominaciones, resto, total, exacto: c.base_exacta, faltante: Math.max(0, c.base_dejada_cop - total) },
    denominaciones: c.denominaciones,
    confirmadaAt: c.base_confirmada_at,
    confirmadaBy: c.base_confirmada_by_name,
  };
}

/**
 * «Arqueo de cierre» on the tablet. 1 · blind count by denomination (the
 * expected amount shows only after sending); 2 · counted vs expected, the
 * difference and, when there is one, what happened, with the ledger the
 * expected amount comes from; 3 · the pieces that stay as base and the
 * entrega that leaves. Without internet the count waits on the tablet and
 * goes out when it's back (CajaApp sends it).
 */
export function ArqueoFlow(props: {
  today: string;
  tz: string;
  actorName: string;
  online: boolean;
  instanceId: string | null;
  instanceName: string | null;
  cierre: CajaCierre | null;
  baseInicial: number;
  baseInicialHint: string;
  baseDejadaSugerida: number;
  movimientos: MovVista[];
  resultado: { r: ResultadoCierre; contadas: CajaDenominacion[] } | null;
  pendiente: boolean;
  enviar: (input: CierreInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  guardarNota: (cierreId: string, nota: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  confirmar: (cierreId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  ajustar: (cierreId: string, baseDejada: number) => Promise<{ ok: true; plan: PlanBase } | { ok: false; error: string }>;
  onSalir: () => void;
}) {
  const { resultado, cierre } = props;
  const [paso, setPaso] = React.useState<"contar" | "resultado" | "base">(resultado ? "resultado" : cierre ? "base" : "contar");
  // A result arriving later (sent from the offline queue) takes the screen to it.
  React.useEffect(() => {
    if (resultado) queueMicrotask(() => setPaso((p) => (p === "contar" ? "resultado" : p)));
  }, [resultado]);
  const steps = (p: "contar" | "resultado" | "base"): Array<{ label: string; s: StepState }> => {
    const order = ["contar", "resultado", "base"];
    const at = order.indexOf(p);
    return ["Contar", "Resultado", "Base"].map((label, i) => ({ label, s: i < at ? "done" : i === at ? "on" : "todo" }));
  };

  if (paso === "contar" || (!resultado && !cierre)) return <Conteo {...props} steps={steps("contar")} />;
  if (paso === "resultado" && resultado) return <Resultado {...props} r={resultado.r} steps={steps("resultado")} onNext={() => setPaso("base")} />;
  const data = resultado ? baseDeResultado(resultado.r, resultado.contadas) : baseDeCierre(cierre!);
  return <Base {...props} data={data} steps={steps("base")} onBack={resultado ? () => setPaso("resultado") : props.onSalir} />;
}

function Conteo({ today, actorName, online, instanceId, instanceName, baseInicial, baseInicialHint, baseDejadaSugerida, pendiente, enviar, onSalir, steps }: Parameters<typeof ArqueoFlow>[0] & { steps: Array<{ label: string; s: StepState }> }) {
  const [cant, setCant] = React.useState<Record<string, number>>({});
  const [baseIni, setBaseIni] = React.useState<number>(baseInicial);
  const [editBase, setEditBase] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const loaded = React.useRef(false);
  const key = instanceId ? draftKey(today, instanceId) : null;

  // Counting takes minutes: a reload or a lost tab must not lose it.
  React.useEffect(() => {
    if (!key || loaded.current) return;
    loaded.current = true;
    const d = readDraft(key);
    if (d) {
      queueMicrotask(() => {
        setCant(d.cantidades ?? {});
        if (d.baseInicial != null) setBaseIni(d.baseInicial);
      });
    }
  }, [key]);
  React.useEffect(() => {
    if (key && loaded.current) writeDraft(key, { cantidades: cant, baseInicial: baseIni });
  }, [key, cant, baseIni]);

  const lines = DENOMINACIONES_COP.map((valor) => ({ valor, cantidad: cant[valor] ?? 0 }));
  const contado = totalContado(lines);
  const billetes = lines.filter((l) => l.valor >= 2000).reduce((s, l) => s + l.cantidad, 0);
  const monedas = lines.filter((l) => l.valor < 2000).reduce((s, l) => s + l.cantidad, 0);

  async function doEnviar() {
    if (!instanceId || sending) return;
    if (contado === 0 && !window.confirm("No contaste nada: la caja quedaría en $ 0. ¿Enviar de todos modos?")) return;
    setSending(true);
    setError(null);
    const r = await enviar({ shiftInstanceId: instanceId, denominaciones: lines.filter((l) => l.cantidad > 0).map((l) => ({ valor: l.valor, cantidad: Math.round(Number(l.cantidad)) })), baseInicial: Math.max(0, Math.round(Number(baseIni) || 0)), baseDejada: Math.max(0, Math.round(Number(baseDejadaSugerida) || 0)) });
    setSending(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <>
      <FlowBar back="Cancelar" onBack={onSalir} title="Arqueo de cierre" tone="ink" pick={instanceName ?? undefined} steps={steps} />
      <div className="cj-split">
        <section className="cj-col">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className="cj-lab">Cuenta todo lo que hay en el cajón</span>
            <span className="cj-mute" style={{ fontSize: 12 }}>Toca + / − o escribe la cantidad</span>
          </div>
          {!instanceId ? (
            <div className="cj-empty">Hoy no hay turnos en esta sede. Abre el turno primero desde la pantalla de Turno.</div>
          ) : (
            <div className="cj-den-grid">
              {DENOMINACIONES_COP.map((valor) => {
                const c = cant[valor] ?? 0;
                const tipo = valor >= 2000 ? "Billetes" : "Monedas";
                return (
                  <div key={valor} className="cj-den-card" data-on={c > 0 ? "1" : undefined}>
                    <span className="cj-den-card-top">
                      <b className="cj-slab">{plata(valor)}{valor === 1000 ? <small className="cj-mute" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}> · moneda</small> : null}</b>
                      <span className="cj-mute" style={{ fontSize: 12 }}>= {plata(c * valor)}</span>
                    </span>
                    <span className="cj-den-card-row">
                      <Contador value={c} onChange={(v) => setCant((x) => ({ ...x, [valor]: v }))} label={`${tipo} de ${plata(valor)}`} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <aside className="cj-aside">
          <div className="cj-card" style={{ padding: "18px 20px" }}>
            <span className="cj-lab">Total contado · en vivo</span>
            <span className="cj-slab cj-total">{plata(contado)}</span>
            <span className="cj-mute" style={{ fontSize: 13 }}>{billetes + monedas} piezas · {billetes} billetes · {monedas} monedas</span>
          </div>
          <div className="cj-info"><IcoInfo />Conteo a ciegas: el esperado se muestra solo después de enviar, para que el conteo sea real.</div>
          <div className="cj-card soft">
            <span className="cj-lab">Base con la que abrió</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {editBase ? (
                <input className="cj-field sm" style={{ width: 180 }} inputMode="numeric" autoFocus aria-label="Base con la que abrió" value={baseIni ? String(baseIni) : ""} onChange={(e) => setBaseIni(Number(e.target.value.replace(/\D/g, "").slice(0, 8)) || 0)} />
              ) : (
                <span className="cj-slab" style={{ fontSize: 24 }}>{plata(baseIni)}</span>
              )}
              <button type="button" className="cj-btn xs" onClick={() => setEditBase((e) => !e)}>{editBase ? "Listo" : "Corregir"}</button>
            </div>
            <span className="cj-mute" style={{ fontSize: 12, lineHeight: 1.4 }}>{baseInicialHint}</span>
          </div>
          <div className="cj-grow" />
          {pendiente && <div className="cj-warn amber"><IcoNube size={20} />El conteo está guardado en la tablet: se envía solo cuando vuelva el internet.</div>}
          {!online && !pendiente && <div className="cj-warn amber"><IcoNube size={20} />Sin internet: el arqueo también se puede hacer. Se envía al dueño cuando vuelva.</div>}
          {error && <div role="alert" className="cj-warn red"><IcoAlerta />{error}</div>}
          <span className="cj-fine">Tarjeta y transferencia no se cuentan aquí; salen del POS. Cuenta {actorName}.</span>
          <button type="button" className="cj-btn dark big" disabled={!instanceId || sending || pendiente} onClick={() => void doEnviar()}>{sending ? "Enviando…" : pendiente ? "En espera de internet…" : "Enviar conteo"}</button>
        </aside>
      </div>
    </>
  );
}

function Resultado({ tz, online, r, movimientos, baseInicialHint, guardarNota, onSalir, steps, onNext }: Parameters<typeof ArqueoFlow>[0] & { r: ResultadoCierre; steps: Array<{ label: string; s: StepState }>; onNext: () => void }) {
  const comparable = r.pagos.count > 0 || r.ingresos > 0 || r.salidas > 0;
  const hayDif = comparable && r.diferencia !== 0;
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t0 = Date.parse(r.ventana.desde);
  const t1 = Date.parse(r.ventana.hasta);
  const enVentana = movimientos.filter((m) => !m.anuladoAt && !m.espera && Date.parse(m.at) >= t0 && Date.parse(m.at) < t1).sort((a, b) => a.at.localeCompare(b.at));
  const tone = !comparable ? "ok" : r.diferencia < 0 ? "bad" : r.diferencia > 0 ? "over" : "ok";

  async function siguiente() {
    if (hayDif) {
      if (nota.trim().length < 3) return;
      setBusy(true);
      setError(null);
      const res = await guardarNota(r.cierreId, nota.trim());
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    }
    onNext();
  }

  return (
    <>
      <FlowBar back="Inicio" onBack={onSalir} title="Arqueo de cierre" tone="ink" pick="Arqueo enviado · pendiente de aprobar" steps={steps} />
      <div className="cj-split">
        <section className="cj-col">
          <div className="cj-vs">
            <div className="cj-card"><span className="cj-lab">Contaste</span><span className="cj-slab">{plata(r.contado)}</span></div>
            <div className="cj-card"><span className="cj-lab">Debería haber</span><span className="cj-slab">{comparable ? plata(r.esperado) : "—"}</span></div>
          </div>
          <div className={`cj-diff ${tone}`}>
            <span className="cj-lab" style={{ color: "inherit" }}>Diferencia</span>
            <b className="cj-slab">{!comparable ? "Sin ventas para comparar" : r.diferencia === 0 ? "Cuadra ✓" : r.diferencia < 0 ? `Faltan ${plata(-r.diferencia)}` : `Sobran ${plata(r.diferencia)}`}</b>
            {!comparable && <span style={{ fontSize: 13 }}>No hubo pagos en el POS ni movimientos en este turno.</span>}
          </div>
          {hayDif && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="cj-lab">Hay diferencia: cuéntanos qué pasó · obligatorio</span>
                <textarea className="cj-textarea" value={nota} onChange={(e) => setNota(e.target.value.slice(0, 300))} aria-label="Nota sobre la diferencia" rows={3} />
              </label>
              <div className="cj-chips">
                {NOTAS_DIF.map((f) => (
                  <button key={f} type="button" className="cj-chip" style={{ minHeight: 48, fontSize: 14 }} aria-pressed={nota === f} onClick={() => setNota(f)}>{f}</button>
                ))}
              </div>
            </>
          )}
          <div className="cj-grow" />
          {error && <div role="alert" className="cj-warn red"><IcoAlerta />{error}</div>}
          {hayDif && !online && <div className="cj-warn amber"><IcoNube size={20} />Sin internet: la nota se guarda cuando vuelva.</div>}
          <button type="button" className="cj-btn dark tall" disabled={busy || (hayDif && (nota.trim().length < 3 || !online))} onClick={() => void siguiente()}>
            {busy ? "Guardando…" : "Siguiente: armar la base"} <IcoSigue />
          </button>
        </section>
        <aside className="cj-aside">
          <span className="cj-lab">De dónde sale el esperado</span>
          <div className="cj-ledger">
            <div><span><b>Base</b> con la que abrió<br /><small>{baseInicialHint}</small></span><span>{plata(r.baseInicial)}</span></div>
            <div><span><b>Ventas en efectivo</b> · {r.pagos.count} pago{r.pagos.count === 1 ? "" : "s"} del POS</span><span>+ {plata(r.pagos.efectivo)}</span></div>
            {enVentana.map((m) => (
              <div key={m.key}>
                <span><b>{m.tipo === "ingreso" ? "Entrada" : "Salida"}</b> · {MOTIVO_CAJA[m.motivo].label} · {hora(m.at, tz)}{m.by ? ` · ${m.by.split(" ")[0]}` : ""}<br /><small>“{m.justificacion}”</small></span>
                <span className={m.tipo === "ingreso" ? "cj-in" : "cj-out"}>{m.tipo === "ingreso" ? "+" : "−"} {plata(m.monto)}</span>
              </div>
            ))}
            <div className="tot"><span>Debería haber</span><span>{plata(r.esperado)}</span></div>
          </div>
          <div className="cj-card soft">
            <span className="cj-lab">Solo informativo · no se cuentan en el cajón</span>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <span>Tarjeta <b>{plata(r.pagos.tarjeta)}</b></span>
              <span>Transferencias <b>{plata(r.pagos.transferencia)}</b></span>
              <span>Total del turno <b>{plata(r.pagos.efectivo + r.pagos.tarjeta + r.pagos.transferencia)}</b></span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Base({ actorName, tz, online, data, confirmar, ajustar, onSalir, steps, onBack }: Parameters<typeof ArqueoFlow>[0] & { data: BaseData; steps: Array<{ label: string; s: StepState }>; onBack: () => void }) {
  const [plan, setPlan] = React.useState<PlanBase>(data.plan);
  const [baseDejada, setBaseDejada] = React.useState(data.baseDejada);
  const [ajuste, setAjuste] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<string | null>(data.confirmadaAt);
  const enBase = new Map(plan.lineas.map((l) => [l.valor, l.cantidad]));
  const contadas = data.denominaciones.filter((d) => d.cantidad > 0).sort((a, b) => b.valor - a.valor);
  const entrega = data.contado - plan.total;
  const resto = contadas.map((d) => ({ valor: d.valor, cantidad: d.cantidad - (enBase.get(d.valor) ?? 0) })).filter((d) => d.cantidad > 0);
  const preview = ajuste !== null && ajuste !== "" ? planBase(contadas, Number(ajuste)) : null;

  async function doConfirm() {
    setBusy(true);
    setError(null);
    const r = await confirmar(data.cierreId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setHecho(new Date().toISOString());
  }
  async function doAjustar() {
    if (ajuste === null || ajuste === "") return;
    setBusy(true);
    setError(null);
    const r = await ajustar(data.cierreId, Number(ajuste));
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPlan(r.plan);
    setBaseDejada(Number(ajuste));
    setAjuste(null);
  }

  const fila = (d: CajaDenominacion) => {
    const n = enBase.get(d.valor) ?? 0;
    const coin = d.valor < 2000;
    return (
      <div key={d.valor} className="cj-piece" data-on={n > 0 ? "1" : undefined}>
        <span className="cj-slab cj-piece-v">{plata(d.valor)}</span>
        <span className="cj-slab cj-piece-n">{n}</span>
        <span className={`cj-piece-stack ${coin ? "coin" : ""}`} aria-hidden="true">{Array.from({ length: Math.min(n, 8) }, (_, i) => <span key={i} />)}</span>
        <small>{n === 0 ? "todos salen" : `= ${plata(n * d.valor)}`}</small>
      </div>
    );
  };

  return (
    <>
      <FlowBar back="Atrás" onBack={onBack} title="Arqueo de cierre" tone="ink" pick={hecho ? "Base confirmada ✓" : "Arqueo enviado · pendiente de aprobar"} steps={steps} />
      <div className="cj-split">
        <section className="cj-col">
          <div className="cj-card soft" style={{ borderColor: "var(--ink)" }}>
            <span className="cj-lab">Deja esto en el cajón para mañana · base {plata(baseDejada)}</span>
            <span className="cj-mute" style={{ fontSize: 13 }}>Las piezas más pequeñas se quedan; los billetes grandes salen.</span>
          </div>
          {!plan.exacto && <div className="cj-warn red"><IcoAlerta />Con lo contado no se arma la base exacta: quedan {plata(plan.total)} (faltan {plata(plan.faltante)}). Consigue cambio o ajusta la base.</div>}
          {contadas.length === 0 ? (
            <div className="cj-empty">No se contó efectivo: no hay piezas para la base.</div>
          ) : (
            <div className="cj-tray">
              {contadas.some((d) => d.valor >= 2000) && <div className="cj-tray-col"><span className="cj-lab">Billetes</span>{contadas.filter((d) => d.valor >= 2000).map(fila)}</div>}
              {contadas.some((d) => d.valor < 2000) && <div className="cj-tray-col"><span className="cj-lab">Monedas</span>{contadas.filter((d) => d.valor < 2000).map(fila)}</div>}
            </div>
          )}
          <div className="cj-grow" />
          {error && <div role="alert" className="cj-warn red"><IcoAlerta />{error}</div>}
          {hecho ? (
            <>
              <div className="cj-warn green"><IcoCheck />Base armada y confirmada{data.confirmadaBy ? ` por ${data.confirmadaBy}` : ` por ${actorName}`} a las {hora(hecho, tz)}.</div>
              <button type="button" className="cj-btn dark tall" onClick={onSalir}>Volver a Caja</button>
            </>
          ) : (
            <button type="button" className="cj-btn green tall" disabled={busy || !online || contadas.length === 0} onClick={() => void doConfirm()}>
              <IcoCheck size={24} w={3} />{busy ? "Guardando…" : online ? "Ya armé la base" : "Sin internet: confirma cuando vuelva"}
            </button>
          )}
        </section>
        <aside className="cj-aside">
          <div className="cj-card" style={{ padding: "18px 20px" }}>
            <span className="cj-lab">Entrega · sale del cajón para el dueño</span>
            <span className="cj-slab cj-total" style={{ color: entrega < 0 ? "var(--red)" : undefined }}>{plataSigno(entrega)}</span>
            {resto.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {resto.map((d) => (
                  <span key={d.valor} className="cj-kv"><span>{d.cantidad} × {plata(d.valor)}</span><b>{plata(d.cantidad * d.valor)}</b></span>
                ))}
              </div>
            )}
            <span className="cj-mute" style={{ fontSize: 12, lineHeight: 1.45 }}>Mételo en el sobre con la fecha. El dueño lo recibe y aprueba el arqueo desde el panel.</span>
          </div>
          <div className="cj-card soft">
            <span className="cj-lab">Resumen del cierre</span>
            <span className="cj-kv"><span>Contado</span><b>{plata(data.contado)}</b></span>
            <span className="cj-kv"><span>Diferencia</span><b style={{ color: data.diferencia == null ? undefined : data.diferencia < 0 ? "var(--red)" : data.diferencia > 0 ? "var(--amber)" : "var(--green)" }}>{data.diferencia == null ? "—" : plataSigno(data.diferencia)}</b></span>
            <span className="cj-kv"><span>Base que queda</span><b>{plata(plan.total)}</b></span>
            <span className="cj-kv"><span>Entrega</span><b>{plataSigno(entrega)}</b></span>
            {plan.lineas.length > 0 && <span className="cj-mute" style={{ fontSize: 12 }}>{describirLineas(plan.lineas, plata)}</span>}
          </div>
          <div className="cj-grow" />
          {!hecho && (ajuste === null ? (
            <button type="button" className="cj-btn ghost" disabled={!online} onClick={() => setAjuste(String(baseDejada))}>No me alcanzan las piezas · ajustar base</button>
          ) : (
            <div className="cj-card soft">
              <span className="cj-lab">Base que queda para mañana</span>
              <input className="cj-field sm" inputMode="numeric" autoFocus aria-label="Nueva base" value={ajuste} onChange={(e) => setAjuste(e.target.value.replace(/\D/g, "").slice(0, 8))} />
              {preview && <span className="cj-mute" style={{ fontSize: 12 }}>{preview.exacto ? `Se arma con ${describirLineas(preview.lineas, plata)}.` : `Solo se arman ${plata(preview.total)}.`}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cj-btn sm dark" disabled={busy || ajuste === ""} onClick={() => void doAjustar()}>Recalcular</button>
                <button type="button" className="cj-btn sm" onClick={() => setAjuste(null)}>Cancelar</button>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
