"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { DENOMINACIONES_COP, parseCantidad, totalContado } from "@/lib/caja/arqueo";
import type { CajaInstance } from "@/lib/caja/cierres";
import type { CajaCierreStatus } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { enviarCierreCaja, type EnviarCierreResult } from "./actions";

export interface CajaExisting {
  status: CajaCierreStatus;
  contado: number;
  diferencia: number;
  submitted_at: string;
}

type Step = { kind: "contar" } | { kind: "done"; result: Extract<EnviarCierreResult, { ok: true }> };
type Draft = { cantidades: Record<string, string>; baseInicial: string; baseDejada: string; nota: string };

const draftKey = (today: string, instanceId: string) => `caja:draft:${today}:${instanceId}`;
function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(key, JSON.stringify(d));
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const numInput = (tone: "bad" | "ok" | "idle"): React.CSSProperties => ({
  width: 118,
  height: 48,
  padding: "0 10px",
  textAlign: "right",
  border: `1.5px solid ${tone === "bad" ? "var(--red)" : tone === "ok" ? "var(--green)" : "var(--rule)"}`,
  borderRadius: 4,
  background: "var(--paper-lt)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: 18,
  fontWeight: 700,
  outline: "none",
});
const money = (n: number) => (n < 0 ? `-${posMoney(-n)}` : posMoney(n));

/** Pick the turno most likely being closed: the open one that started latest. */
function defaultInstance(instances: CajaInstance[], existing: Record<string, CajaExisting>): string | null {
  const open = instances.filter((i) => i.status === "open" && (!existing[i.id] || existing[i.id].status === "rechazado"));
  const pool = open.length ? open : instances.filter((i) => !existing[i.id] || existing[i.id].status === "rechazado");
  return pool.length ? pool[pool.length - 1].id : instances[0]?.id ?? null;
}

export function CajaScreen({ actor, sedeName, today, tz, instances, baseSugerida, existing }: {
  actor: { name: string; isAdmin: boolean };
  sedeName: string;
  today: string;
  tz: string;
  instances: CajaInstance[];
  baseSugerida: number;
  existing: Record<string, CajaExisting>;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ kind: "contar" });
  const [instanceId, setInstanceId] = React.useState<string | null>(() => defaultInstance(instances, existing));
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({});
  const [baseInicial, setBaseInicial] = React.useState(String(baseSugerida));
  const [baseDejada, setBaseDejada] = React.useState(String(baseSugerida));
  const [nota, setNota] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const loaded = React.useRef<string | null>(null);

  // Resume the draft of the chosen turno (counting takes minutes; a refresh must not lose it).
  React.useEffect(() => {
    if (!instanceId || loaded.current === instanceId) return;
    loaded.current = instanceId;
    const d = readDraft(draftKey(today, instanceId));
    setCantidades(d?.cantidades ?? {});
    setBaseInicial(d?.baseInicial ?? String(baseSugerida));
    setBaseDejada(d?.baseDejada ?? String(baseSugerida));
    setNota(d?.nota ?? "");
  }, [instanceId, today, baseSugerida]);
  React.useEffect(() => {
    if (!instanceId || step.kind !== "contar" || loaded.current !== instanceId) return;
    writeDraft(draftKey(today, instanceId), { cantidades, baseInicial, baseDejada, nota });
  }, [instanceId, step, cantidades, baseInicial, baseDejada, nota, today]);

  const lines = DENOMINACIONES_COP.map((valor) => ({ valor, cantidad: parseCantidad(cantidades[valor] ?? "") ?? 0 }));
  const contado = totalContado(lines);
  const invalid = DENOMINACIONES_COP.filter((v) => (cantidades[v] ?? "").trim() !== "" && parseCantidad(cantidades[v]) === null).length;
  const filled = DENOMINACIONES_COP.filter((v) => parseCantidad(cantidades[v] ?? "") !== null).length;
  const baseIni = parseCantidad(baseInicial);
  const baseDej = parseCantidad(baseDejada);
  const basesOk = baseIni !== null && baseDej !== null;
  const current = instances.find((i) => i.id === instanceId) ?? null;
  const blocked = current ? existing[current.id] && existing[current.id].status !== "rechazado" : true;

  async function submit() {
    if (!current || sending || blocked) return;
    if (!basesOk) {
      setError("Revisa la base inicial y la base que queda.");
      return;
    }
    if (filled === 0 && !window.confirm("No contaste ninguna denominación: la caja quedaría en $0. ¿Enviar de todos modos?")) return;
    if (baseDej > contado && !window.confirm(`La base que queda (${posMoney(baseDej)}) es mayor que lo contado (${posMoney(contado)}). ¿Enviar de todos modos?`)) return;
    setSending(true);
    setError(null);
    const res = await enviarCierreCaja({
      shiftInstanceId: current.id,
      denominaciones: lines.filter((l) => l.cantidad > 0),
      baseInicial: baseIni,
      baseDejada: baseDej,
      note: nota.trim() || undefined,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    writeDraft(draftKey(today, current.id), null);
    setStep({ kind: "done", result: res });
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      {/* top bar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Caja<span style={{ color: "var(--red)" }}>.</span></span>
        <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName} · {today}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={actor.name}>{actor.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/turno" style={chip}>← Turno</Link>
          {actor.isAdmin && <Link href={`/hoy/${today}`} style={chip}>Panel</Link>}
        </div>
      </div>

      {step.kind === "contar" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 130px", maxWidth: 760, width: "100%", margin: "0 auto" }}>
            {/* which turno */}
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>¿De qué turno es la caja?</div>
            {instances.length === 0 ? (
              <div style={{ border: "1px dashed var(--rule)", borderRadius: 6, padding: "12px 14px", fontSize: 12.5, color: "var(--muted)" }}>Hoy no hay turnos abiertos ni cerrados en esta sede. Abre el turno primero desde la pantalla de Turno.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {instances.map((i) => {
                  const on = i.id === instanceId;
                  const ex = existing[i.id];
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setInstanceId(i.id)}
                      style={{ ...chip, height: 44, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)", gap: 8 }}
                    >
                      <span style={{ fontWeight: 700 }}>{i.template_name}</span>
                      <span style={{ opacity: 0.75 }}>{i.inicio.slice(0, 5)}–{i.fin.slice(0, 5)}</span>
                      {ex && <span style={{ opacity: 0.9 }}>{ex.status === "rechazado" ? "· rechazado" : "· ✓ enviado"}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {current && existing[current.id] && (
              <div style={{ marginTop: 12, border: `1px solid ${blocked ? "var(--green)" : "var(--red)"}`, borderRadius: 6, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
                {blocked ? (
                  <>
                    <b style={{ color: "var(--green)" }}>✓ Ya se envió el cierre de este turno</b> a las {formatTime(existing[current.id].submitted_at, tz)} · contado {posMoney(existing[current.id].contado)} · diferencia {money(existing[current.id].diferencia)}.
                    {existing[current.id].status === "pendiente" ? " Está pendiente de revisión del dueño." : " Ya fue aprobado."}
                  </>
                ) : (
                  <><b style={{ color: "var(--red)" }}>El cierre anterior fue rechazado.</b> Cuenta de nuevo y envíalo.</>
                )}
              </div>
            )}

            {current && !blocked && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 6px", fontSize: 12, color: "var(--muted)" }}>
                  <span>Cuenta <b style={{ color: "var(--ink)" }}>{actor.name}</b> · {current.template_name}</span>
                </div>
                <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--rule)", marginBottom: 6 }}>Efectivo en la caja</div>
                {DENOMINACIONES_COP.map((valor) => {
                  const raw = cantidades[valor] ?? "";
                  const n = parseCantidad(raw);
                  const tone = raw.trim() !== "" && n === null ? "bad" : n !== null ? "ok" : "idle";
                  return (
                    <div key={valor} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cmd-num" style={{ fontSize: 15, fontWeight: 700 }}>{posMoney(valor)}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{valor >= 2000 ? "billete" : "moneda"}</div>
                      </div>
                      <span className="cmd-num" style={{ minWidth: 96, textAlign: "right", fontSize: 12, color: n ? "var(--ink)" : "var(--muted)" }}>{n ? posMoney(valor * n) : "—"}</span>
                      <input
                        inputMode="numeric"
                        value={raw}
                        onChange={(e) => setCantidades((c) => ({ ...c, [valor]: e.target.value }))}
                        aria-label={`Cantidad de ${posMoney(valor)}`}
                        placeholder="0"
                        style={numInput(tone)}
                      />
                    </div>
                  );
                })}

                <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--rule)", margin: "18px 0 6px" }}>Base</div>
                <BaseRow label="Base inicial" hint="Con lo que abrió la caja hoy (la base que dejó el turno anterior)." value={baseInicial} onChange={setBaseInicial} />
                <BaseRow label="Base que queda para mañana" hint="Se resta de la entrega." value={baseDejada} onChange={setBaseDejada} />

                <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--rule)", margin: "18px 0 6px" }}>Nota</div>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} placeholder="Algo que el dueño deba saber (un gasto pagado de caja, un vuelto mal dado…)" aria-label="Nota del cierre" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none", resize: "vertical" }} />

                <section style={{ marginTop: 16, border: "1px dashed var(--rule)", borderRadius: 6, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6 }}>
                  <b>Cómo cerrar bien.</b> Cuenta todo lo que hay en la caja, incluida la base. No mires el POS antes: el sistema compara al final con las ventas en efectivo del turno y el dueño revisa.
                </section>
              </>
            )}
          </div>

          {current && !blocked && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--paper-lt)", borderTop: "1.5px solid var(--ink)", display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Total contado</div>
                <div className="cmd-num font-slab" style={{ fontSize: 24, lineHeight: 1.1 }}>{posMoney(contado)}</div>
              </div>
              {invalid > 0 && <span style={{ fontSize: 12, color: "var(--red)" }}>{invalid} con valor inválido</span>}
              {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
              <button type="button" className="cmd-btn red" onClick={() => void submit()} disabled={sending || invalid > 0 || !basesOk} style={{ marginLeft: "auto", height: 52, padding: "0 22px", fontSize: 13 }}>
                {sending ? "Enviando…" : "Enviar cierre"}
              </button>
            </div>
          )}
        </>
      )}

      {step.kind === "done" && <CajaResult result={step.result} person={actor.name} tz={tz} turno={current?.template_name ?? ""} />}
    </div>
  );
}

function BaseRow({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const n = parseCantidad(value);
  const tone = value.trim() !== "" && n === null ? "bad" : n !== null ? "ok" : "idle";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{hint}</div>
      </div>
      <span className="cmd-num" style={{ minWidth: 96, textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{n !== null ? posMoney(n) : "—"}</span>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="0" style={numInput(tone)} />
    </div>
  );
}

function CajaResult({ result, person, tz, turno }: { result: Extract<EnviarCierreResult, { ok: true }>; person: string; tz: string; turno: string }) {
  const r = result;
  const tone = r.diferencia < 0 ? "var(--red)" : r.diferencia > 0 ? "var(--amber)" : "var(--green)";
  const verdict = r.pagos.count === 0
    ? "Sin pagos registrados en el POS en esta ventana: no hay con qué comparar."
    : r.diferencia === 0
      ? "✓ La caja cuadra."
      : r.diferencia < 0
        ? `Faltan ${posMoney(-r.diferencia)} frente a lo que el POS esperaba.`
        : `Sobran ${posMoney(r.diferencia)} frente a lo que el POS esperaba.`;
  return (
    <div style={{ padding: "22px 20px 40px", maxWidth: 760, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ border: "1.5px solid var(--ink)", borderRadius: 10, padding: "20px 22px", background: "var(--paper-lt)" }}>
        <div className="font-slab" style={{ fontSize: 26 }}>Cierre enviado<span style={{ color: "var(--green)" }}>.</span></div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Contó {person}{turno ? ` · ${turno}` : ""} · queda pendiente de revisión del dueño.</div>
        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          <Stat k="Contado" v={posMoney(r.contado)} />
          <Stat k="Esperado" v={r.pagos.count === 0 ? "—" : posMoney(r.esperado)} />
          <Stat k="Diferencia" v={r.pagos.count === 0 ? "—" : money(r.diferencia)} color={r.pagos.count === 0 ? undefined : tone} />
          <Stat k="Base que queda" v={posMoney(r.baseDejada)} />
          <Stat k="Entrega" v={money(r.entrega)} color={r.entrega < 0 ? "var(--red)" : undefined} />
        </div>
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: r.pagos.count === 0 ? "var(--muted)" : tone }}>{verdict}</div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Ventas del POS en la ventana</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, padding: "8px 0" }}>
          <div>Ventana: {formatTime(r.ventana.desde, tz)} – {formatTime(r.ventana.hasta, tz)} · {r.pagos.count} pago{r.pagos.count === 1 ? "" : "s"}</div>
          <div>Efectivo <b className="cmd-num">{posMoney(r.pagos.efectivo)}</b> · Tarjeta <b className="cmd-num">{posMoney(r.pagos.tarjeta)}</b> · Transferencia <b className="cmd-num">{posMoney(r.pagos.transferencia)}</b></div>
          <div style={{ color: "var(--muted)" }}>Esperado = base inicial {posMoney(r.baseInicial)} + efectivo {posMoney(r.pagos.efectivo)}.</div>
        </div>
      </div>
      <Link href="/turno" className="cmd-btn" style={{ textDecoration: "none", alignSelf: "flex-start", height: 48, display: "inline-flex", alignItems: "center" }}>← Volver al turno</Link>
    </div>
  );
}

function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{k}</div>
      <div className="cmd-num font-slab" style={{ fontSize: 24, color: color ?? "var(--ink)" }}>{v}</div>
    </div>
  );
}
