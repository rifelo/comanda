"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { DENOMINACIONES_COP, parseCantidad, totalContado } from "@/lib/caja/arqueo";
import { baseEstado, describirLineas, planBase, sencilloDe, type PlanBase } from "@/lib/caja/base";
import type { BaseActionResult, BaseSugerida, CajaInstance, CierreInput, EnviarCierreResult, ValidarBaseInput } from "@/lib/caja/cierres";
import type { CajaCierre, CajaCierreStatus, CajaDenominacion } from "@/lib/types";
import { fechaCorta, formatTime } from "@/lib/utils";

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
const sectionLabel: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--rule)", margin: "18px 0 6px" };
const money = (n: number) => (n < 0 ? `-${posMoney(-n)}` : posMoney(n));

/** Pick the turno most likely being closed: the open one that started latest. */
function defaultInstance(instances: CajaInstance[], existing: Record<string, CajaCierre>): string | null {
  const open = instances.filter((i) => i.status === "open" && (!existing[i.id] || existing[i.id].status === "rechazado"));
  const pool = open.length ? open : instances.filter((i) => !existing[i.id] || existing[i.id].status === "rechazado");
  return pool.length ? pool[pool.length - 1].id : instances[0]?.id ?? null;
}

/**
 * The arqueo screen, shared by the shop tablet (/turno/caja) and the staff
 * shift screen (/shift/[id]/caja). Blind count by denomination, the base
 * the drawer opened with (pre-filled with what the last cierre left) and the
 * base that stays for tomorrow; the comparison with the POS shows only after
 * sending, and the owner approves from the panel. The plan de base (which
 * pieces stay in the drawer) previews live, is confirmed by whoever closes
 * and validated by whoever opens the next turno. `submit`, `confirmBase`
 * and `validateBase` are the server actions of whichever surface renders it.
 */
export function CajaScreen({ actor, sedeName, today, tz, instances, baseSugerida, existing, historial, submit, confirmBase, validateBase, backHref, backLabel, panelHref }: {
  actor: { name: string; isAdmin: boolean };
  sedeName: string;
  today: string;
  tz: string;
  instances: CajaInstance[];
  baseSugerida: BaseSugerida;
  /** The live (or latest rejected) cierre of each instance, by instance id. */
  existing: Record<string, CajaCierre>;
  /** Recent cierres of the sede, newest first: the trail of the base. */
  historial: CajaCierre[];
  submit: (input: CierreInput) => Promise<EnviarCierreResult>;
  confirmBase: (cierreId: string) => Promise<BaseActionResult>;
  validateBase: (input: ValidarBaseInput) => Promise<BaseActionResult>;
  backHref: string;
  backLabel: string;
  panelHref?: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ kind: "contar" });
  const [instanceId, setInstanceId] = React.useState<string | null>(() => defaultInstance(instances, existing));
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({});
  const [baseInicial, setBaseInicial] = React.useState(String(baseSugerida.monto));
  const [baseDejada, setBaseDejada] = React.useState(String(baseSugerida.monto));
  const [nota, setNota] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const loaded = React.useRef<string | null>(null);
  const sugerida = baseSugerida.monto;

  // Resume the draft of the chosen turno (counting takes minutes; a refresh must not lose it).
  React.useEffect(() => {
    if (!instanceId || loaded.current === instanceId) return;
    loaded.current = instanceId;
    const d = readDraft(draftKey(today, instanceId));
    setCantidades(d?.cantidades ?? {});
    setBaseInicial(d?.baseInicial ?? String(sugerida));
    setBaseDejada(d?.baseDejada ?? String(sugerida));
    setNota(d?.nota ?? "");
  }, [instanceId, today, sugerida]);
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
  const plan = React.useMemo(() => (baseDej !== null && contado > 0 ? planBase(lines, baseDej) : null), [lines, baseDej, contado]);
  // The base the previous turno left, still to be checked by whoever opens this one.
  const porValidar = baseSugerida.cierre && !baseSugerida.cierre.base_validada_at && baseSugerida.cierre.shift_instance_id !== instanceId ? baseSugerida.cierre : null;
  const baseHint = baseSugerida.fecha
    ? `Base que dejó ${baseSugerida.turno ?? "el cierre"} del ${fechaCorta(baseSugerida.fecha)}${baseSugerida.counted_by_name ? ` (${baseSugerida.counted_by_name})` : ""}: ${posMoney(sugerida)}.`
    : "Con lo que abrió la caja hoy. No hay un cierre anterior registrado.";

  async function doSubmit() {
    if (!current || sending || blocked) return;
    if (!basesOk) {
      setError("Revisa la base inicial y la base que queda.");
      return;
    }
    if (filled === 0 && !window.confirm("No contaste ninguna denominación: la caja quedaría en $0. ¿Enviar de todos modos?")) return;
    if (baseDej > contado && !window.confirm(`La base que queda (${posMoney(baseDej)}) es mayor que lo contado (${posMoney(contado)}). ¿Enviar de todos modos?`)) return;
    if (baseSugerida.fecha && baseDej !== sugerida && !window.confirm(`Vas a dejar una base distinta a la de siempre (${posMoney(sugerida)} → ${posMoney(baseDej)}). ¿Es correcto?`)) return;
    setSending(true);
    setError(null);
    const res = await submit({
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
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName} · {today}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={actor.name}>{actor.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={backHref} style={chip}>← {backLabel}</Link>
          {actor.isAdmin && panelHref && <Link href={panelHref} style={chip}>Panel</Link>}
        </div>
      </div>

      {step.kind === "contar" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 130px", maxWidth: 760, width: "100%", margin: "0 auto" }}>
            {porValidar && <BaseValidarCard cierre={porValidar} tz={tz} validate={validateBase} onDone={() => router.refresh()} />}

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
                    <b style={{ color: "var(--green)" }}>✓ Ya se envió el cierre de este turno</b> a las {formatTime(existing[current.id].submitted_at, tz)} · contado {posMoney(existing[current.id].contado_cop)} · diferencia {existing[current.id].pagos_count === 0 ? "—" : money(existing[current.id].diferencia_cop)}.
                    {existing[current.id].status === "pendiente" ? " Está pendiente de revisión del dueño." : " Ya fue aprobado."}
                  </>
                ) : (
                  <><b style={{ color: "var(--red)" }}>El cierre anterior fue rechazado.</b> Cuenta de nuevo y envíalo.</>
                )}
              </div>
            )}

            {current && blocked && existing[current.id] && (
              <BaseConfirmCard cierre={existing[current.id]} tz={tz} confirm={confirmBase} onDone={() => router.refresh()} />
            )}

            {current && !blocked && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 6px", fontSize: 12, color: "var(--muted)" }}>
                  <span>Cuenta <b style={{ color: "var(--ink)" }}>{actor.name}</b> · {current.template_name}</span>
                </div>
                <div style={{ ...sectionLabel, margin: "0 0 6px" }}>Efectivo en la caja</div>
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

                {plan && <PlanPreview plan={plan} />}

                <div style={sectionLabel}>Base</div>
                <BaseRow
                  label="Base inicial"
                  hint={baseHint}
                  value={baseInicial}
                  onChange={setBaseInicial}
                  suggestion={baseSugerida.fecha && baseIni !== sugerida ? { monto: sugerida, onUse: () => setBaseInicial(String(sugerida)) } : null}
                />
                <BaseRow
                  label="Base que queda para mañana"
                  hint="Se queda en la caja para abrir mañana; se resta de la entrega."
                  value={baseDejada}
                  onChange={setBaseDejada}
                  suggestion={baseSugerida.fecha && baseDej !== sugerida ? { monto: sugerida, onUse: () => setBaseDejada(String(sugerida)) } : null}
                />

                <div style={sectionLabel}>Nota</div>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} placeholder="Algo que el dueño deba saber (un gasto pagado de caja, un vuelto mal dado…)" aria-label="Nota del cierre" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none", resize: "vertical" }} />

                <section style={{ marginTop: 16, border: "1px dashed var(--rule)", borderRadius: 6, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6 }}>
                  <b>Cómo cerrar bien.</b> Cuenta todo lo que hay en la caja, incluida la base. No mires el POS antes: el sistema compara al final con las ventas en efectivo del turno y el dueño revisa. Deja siempre la misma base para mañana y anota cualquier gasto que salió de la caja.
                </section>
              </>
            )}

            <HistorialBase rows={historial} tz={tz} />
          </div>

          {current && !blocked && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--paper-lt)", borderTop: "1.5px solid var(--ink)", display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Total contado</div>
                <div className="cmd-num font-slab" style={{ fontSize: 24, lineHeight: 1.1 }}>{posMoney(contado)}</div>
              </div>
              {baseDej !== null && contado > 0 && (
                <div className="hidden sm:block">
                  <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Entrega</div>
                  <div className="cmd-num" style={{ fontSize: 16, lineHeight: 1.3, color: contado - baseDej < 0 ? "var(--red)" : "var(--ink)" }}>{money(contado - baseDej)}</div>
                </div>
              )}
              {invalid > 0 && <span style={{ fontSize: 12, color: "var(--red)" }}>{invalid} con valor inválido</span>}
              {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
              <button type="button" className="cmd-btn red" onClick={() => void doSubmit()} disabled={sending || invalid > 0 || !basesOk} style={{ marginLeft: "auto", height: 52, padding: "0 22px", fontSize: 13 }}>
                {sending ? "Enviando…" : "Enviar cierre"}
              </button>
            </div>
          )}
        </>
      )}

      {step.kind === "done" && <CajaResult result={step.result} person={actor.name} tz={tz} turno={current?.template_name ?? ""} backHref={backHref} backLabel={backLabel} confirm={confirmBase} />}
    </div>
  );
}

function BaseRow({ label, hint, value, onChange, suggestion }: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  suggestion: { monto: number; onUse: () => void } | null;
}) {
  const n = parseCantidad(value);
  const tone = value.trim() !== "" && n === null ? "bad" : n !== null ? "ok" : "idle";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4 }}>{hint}</div>
        {suggestion && (
          <button type="button" onClick={suggestion.onUse} style={{ ...chip, height: 30, marginTop: 6, fontSize: 10 }}>
            Usar {posMoney(suggestion.monto)}
          </button>
        )}
      </div>
      <span className="cmd-num" style={{ minWidth: 96, textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{n !== null ? posMoney(n) : "—"}</span>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="0" style={numInput(tone)} />
    </div>
  );
}

const STATUS_LABEL: Record<CajaCierreStatus, { label: string; color: string }> = {
  pendiente: { label: "pendiente", color: "var(--amber)" },
  aprobado: { label: "aprobado", color: "var(--green)" },
  rechazado: { label: "rechazado", color: "var(--red)" },
};

/**
 * The trail of the base: what each cierre found, what it left for the next
 * day and whether the drawer squared. Lets the team check that today's base
 * inicial is what yesterday actually left.
 */
export function HistorialBase({ rows, tz }: { rows: CajaCierre[]; tz: string }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Historial de base" style={{ marginTop: 22 }}>
      <div style={{ ...sectionLabel, margin: "0 0 4px" }}>Historial de base · últimos cierres</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: "0 12px", fontSize: 12, alignItems: "center" }}>
        <div style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0" }}>Fecha</div>
        <div style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0" }}>Turno</div>
        <div style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", textAlign: "right" }}>Contado</div>
        <div style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", textAlign: "right" }}>Diferencia</div>
        <div style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", textAlign: "right" }}>Base que dejó</div>
        {rows.map((c) => {
          const st = STATUS_LABEL[c.status];
          const noPos = c.pagos_count === 0;
          const tone = c.diferencia_cop < 0 ? "var(--red)" : c.diferencia_cop > 0 ? "var(--amber)" : "var(--green)";
          const fecha = c.shift_date ?? c.submitted_at.slice(0, 10);
          return (
            <React.Fragment key={c.id}>
              <div className="cmd-num" style={{ padding: "7px 0", borderTop: "1px dashed var(--rule-soft, var(--rule))", whiteSpace: "nowrap" }}>{fechaCorta(fecha)}</div>
              <div style={{ padding: "7px 0", borderTop: "1px dashed var(--rule-soft, var(--rule))", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.shift_name ?? "—"} <span style={{ color: "var(--muted)" }}>· {formatTime(c.submitted_at, tz)}{c.counted_by_name ? ` · ${c.counted_by_name.split(" ")[0]}` : ""}</span>
                <span style={{ marginLeft: 6, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: st.color }}>{st.label}</span>
              </div>
              <div className="cmd-num" style={{ padding: "7px 0", borderTop: "1px dashed var(--rule-soft, var(--rule))", textAlign: "right" }}>{posMoney(c.contado_cop)}</div>
              <div className="cmd-num" style={{ padding: "7px 0", borderTop: "1px dashed var(--rule-soft, var(--rule))", textAlign: "right", color: noPos ? "var(--muted)" : tone }}>{noPos ? "—" : money(c.diferencia_cop)}</div>
              <div className="cmd-num" style={{ padding: "7px 0", borderTop: "1px dashed var(--rule-soft, var(--rule))", textAlign: "right", fontWeight: 700, color: c.status === "rechazado" ? "var(--muted)" : "var(--ink)" }}>
                {posMoney(c.base_dejada_cop)}
                <div style={{ fontSize: 9.5, fontWeight: 400, letterSpacing: ".06em", color: baseEstado(c).color }}>{baseEstado(c).label}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

function CajaResult({ result, person, tz, turno, backHref, backLabel, confirm }: { result: Extract<EnviarCierreResult, { ok: true }>; person: string; tz: string; turno: string; backHref: string; backLabel: string; confirm: (cierreId: string) => Promise<BaseActionResult> }) {
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
      <BaseConfirmCard
        cierre={{ id: r.cierreId, base_dejada_cop: r.baseDejada, base_denominaciones: r.plan.lineas, base_exacta: r.plan.exacto, base_confirmada_at: null, base_confirmada_by_name: null, denominaciones: r.plan.lineas.concat(r.plan.resto), contado_cop: r.contado }}
        resto={r.plan.resto}
        tz={tz}
        confirm={confirm}
      />
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Ventas del POS en la ventana</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, padding: "8px 0" }}>
          <div>Ventana: {formatTime(r.ventana.desde, tz)} – {formatTime(r.ventana.hasta, tz)} · {r.pagos.count} pago{r.pagos.count === 1 ? "" : "s"}</div>
          <div>Efectivo <b className="cmd-num">{posMoney(r.pagos.efectivo)}</b> · Tarjeta <b className="cmd-num">{posMoney(r.pagos.tarjeta)}</b> · Transferencia <b className="cmd-num">{posMoney(r.pagos.transferencia)}</b></div>
          <div style={{ color: "var(--muted)" }}>Esperado = base inicial {posMoney(r.baseInicial)} + efectivo {posMoney(r.pagos.efectivo)}.</div>
        </div>
      </div>
      <Link href={backHref} className="cmd-btn" style={{ textDecoration: "none", alignSelf: "flex-start", height: 48, display: "inline-flex", alignItems: "center" }}>← {backLabel}</Link>
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

const pieceRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))", fontSize: 14 };

/** Live preview while counting: which pieces will stay as base, and how much change that leaves. */
function PlanPreview({ plan }: { plan: PlanBase }) {
  const sen = sencilloDe(plan.lineas, plan.objetivo);
  const tone = !plan.exacto ? "var(--red)" : sen.ok ? "var(--green)" : "var(--amber)";
  return (
    <div style={{ marginTop: 14, border: `1.5px solid ${tone}`, borderRadius: 8, padding: "12px 14px", background: "var(--paper-lt)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>Base para mañana · calculada con lo contado</span>
        <span className="cmd-num font-slab" style={{ fontSize: 20 }}>{posMoney(plan.objetivo)}</span>
      </div>
      {plan.lineas.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>Sin piezas para la base.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {plan.lineas.map((l) => (
            <span key={l.valor} className="cmd-num" style={{ fontSize: 13, border: "1px solid var(--ink)", padding: "5px 9px", borderRadius: 4, background: "var(--paper)" }}>
              <b>{l.cantidad}</b> × {posMoney(l.valor)}
            </span>
          ))}
          <span className="cmd-num" style={{ fontSize: 13, padding: "5px 0", fontWeight: 700 }}>= {posMoney(plan.total)}</span>
        </div>
      )}
      <SencilloLine sen={sen} />
      <div style={{ fontSize: 11.5, color: plan.exacto ? "var(--muted)" : "var(--red)", marginTop: 6, lineHeight: 1.45 }}>
        {plan.exacto
          ? "Mezcla pensada para dar cambio en el siguiente turno; el resto de lo contado es la entrega. Al enviar, confirmas que apartaste estas piezas."
          : `Con lo contado no se arma la base exacta: quedarían ${posMoney(plan.total)} (faltan ${posMoney(plan.faltante)}). Consigue cambio o anótalo en la nota.`}
      </div>
    </div>
  );
}

/** "Sencillo: monedas $6.000 · billetes de 1.000–5.000 $44.000 …" with a verdict. */
function SencilloLine({ sen }: { sen: ReturnType<typeof sencilloDe> }) {
  if (sen.total === 0) return null;
  const parts = [
    sen.monedas > 0 ? `monedas ${posMoney(sen.monedas)}` : null,
    sen.pequenos > 0 ? `billetes de $1.000 a $5.000 ${posMoney(sen.pequenos)}` : null,
    sen.medianos > 0 ? `de $10.000 ${posMoney(sen.medianos)}` : null,
    sen.grandes > 0 ? `grandes ${posMoney(sen.grandes)}` : null,
  ].filter(Boolean);
  const verdict = sen.ok
    ? "✓ Hay sencillo suficiente."
    : sen.grandes > 0
      ? `Queda con billetes grandes (${posMoney(sen.grandes)}): en la caja no hay suficiente sencillo. Consigue cambio antes de cerrar o anótalo.`
      : "Poco sencillo: menos de la mitad de la base son monedas y billetes pequeños.";
  return (
    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
      <span style={{ color: "var(--muted)" }}>Sencillo: {parts.join(" · ")}.</span>{" "}
      <span style={{ color: sen.ok ? "var(--green)" : sen.grandes > 0 ? "var(--red)" : "var(--amber)", fontWeight: 600 }}>{verdict}</span>
      {sen.escasea.length > 0 && <span style={{ color: "var(--muted)" }}> Escasean {sen.escasea.map((v) => posMoney(v)).join(", ")}.</span>}
    </div>
  );
}

type ConfirmCierre = Pick<CajaCierre, "id" | "base_dejada_cop" | "base_denominaciones" | "base_exacta" | "base_confirmada_at" | "base_confirmada_by_name" | "denominaciones" | "contado_cop">;

/**
 * After sending: the pieces to set aside, one tick each, then "Confirmo".
 * `resto` (what leaves as entrega) is shown when known. Once confirmed the
 * card just states it, so a reload keeps the record visible.
 */
function BaseConfirmCard({ cierre, resto, tz, confirm, onDone }: { cierre: ConfirmCierre; resto?: CajaDenominacion[]; tz: string; confirm: (cierreId: string) => Promise<BaseActionResult>; onDone?: () => void }) {
  const [ticks, setTicks] = React.useState<Record<number, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = React.useState<string | null>(cierre.base_confirmada_at);
  const lineas = cierre.base_denominaciones;
  const total = lineas.reduce((s, l) => s + l.valor * l.cantidad, 0);
  const allTicked = lineas.length > 0 && lineas.every((l) => ticks[l.valor]);
  const entrega = cierre.contado_cop - total;
  const restoLines = resto ?? (() => {
    const enBase = new Map(lineas.map((l) => [l.valor, l.cantidad]));
    return cierre.denominaciones.map((d) => ({ valor: d.valor, cantidad: d.cantidad - (enBase.get(d.valor) ?? 0) })).filter((d) => d.cantidad > 0);
  })();

  async function doConfirm() {
    if (busy || !allTicked) return;
    setBusy(true);
    setError(null);
    const r = await confirm(cierre.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setConfirmedAt(new Date().toISOString());
    onDone?.();
  }

  return (
    <section aria-label="Base para mañana" style={{ marginTop: 14, border: `1.5px solid ${confirmedAt ? "var(--green)" : "var(--ink)"}`, borderRadius: 8, padding: "14px 16px", background: "var(--paper-lt)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span className="font-slab" style={{ fontSize: 20 }}>Base para mañana</span>
        <span className="cmd-num font-slab" style={{ fontSize: 20 }}>{posMoney(cierre.base_dejada_cop)}</span>
        {!cierre.base_exacta && <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>base corta: solo se pudo armar {posMoney(total)}</span>}
      </div>
      <SencilloLine sen={sencilloDe(lineas, cierre.base_dejada_cop)} />
      {confirmedAt ? (
        <div style={{ fontSize: 12.5, color: "var(--green)", marginTop: 6, fontWeight: 600 }}>
          ✓ Base armada y confirmada{cierre.base_confirmada_by_name ? ` por ${cierre.base_confirmada_by_name}` : ""} a las {formatTime(confirmedAt, tz)} · {describirLineas(lineas, posMoney)}.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>Aparta estas piezas en la caja y marca cada una. Quien abra el siguiente turno va a validar exactamente esto.</div>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
            {lineas.map((l) => {
              const on = !!ticks[l.valor];
              return (
                <li key={l.valor} style={pieceRow}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${l.cantidad} de ${posMoney(l.valor)} apartados`}
                    onClick={() => setTicks((t) => ({ ...t, [l.valor]: !on }))}
                    style={{ width: 34, height: 34, borderRadius: 6, border: `2px solid ${on ? "var(--green)" : "var(--ink)"}`, background: on ? "var(--green)" : "transparent", color: "var(--paper-lt)", fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                  >
                    {on ? "✓" : ""}
                  </button>
                  <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, minWidth: 40 }}>{l.cantidad} ×</span>
                  <span className="cmd-num" style={{ fontSize: 16, flex: 1 }}>{posMoney(l.valor)} <span style={{ fontSize: 11, color: "var(--muted)" }}>{l.valor >= 2000 ? "billete" : "moneda"}{l.cantidad === 1 ? "" : "s"}</span></span>
                  <span className="cmd-num" style={{ fontSize: 13, color: "var(--muted)" }}>{posMoney(l.valor * l.cantidad)}</span>
                </li>
              );
            })}
          </ul>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" className="cmd-btn" disabled={!allTicked || busy} onClick={() => void doConfirm()} style={{ height: 48, padding: "0 18px", fontSize: 13 }}>
              {busy ? "Guardando…" : "Confirmo: la base quedó armada"}
            </button>
            {!allTicked && lineas.length > 0 && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Marca las {lineas.length} líneas para confirmar.</span>}
            {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
          </div>
        </>
      )}
      {restoLines.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--rule)", fontSize: 12.5, lineHeight: 1.6 }}>
          <b>Entrega {money(entrega)}:</b> {describirLineas(restoLines, posMoney)} · sale de la caja para el dueño.
        </div>
      )}
    </section>
  );
}

/**
 * At the start of the next turno: the base the previous close left, piece
 * by piece, with "Está correcta" / "No cuadra" (+ what was found).
 */
function BaseValidarCard({ cierre, tz, validate, onDone }: { cierre: CajaCierre; tz: string; validate: (input: ValidarBaseInput) => Promise<BaseActionResult>; onDone?: () => void }) {
  const [mode, setMode] = React.useState<"idle" | "nocuadra">("idle");
  const [encontrado, setEncontrado] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<null | boolean>(null);
  const lineas = cierre.base_denominaciones;
  const fecha = cierre.shift_date ?? cierre.submitted_at.slice(0, 10);

  async function send(ok: boolean) {
    if (busy) return;
    const n = ok ? undefined : parseCantidad(encontrado);
    if (!ok && n === null) {
      setError("Escribe cuánto encontraste.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await validate({ cierreId: cierre.id, ok, encontrado: n ?? undefined, nota: nota.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult(ok);
    onDone?.();
  }

  const tone = result === null ? "var(--amber)" : result ? "var(--green)" : "var(--red)";
  return (
    <section aria-label="Base de apertura" style={{ marginBottom: 18, border: `1.5px solid ${tone}`, borderRadius: 8, padding: "14px 16px", background: "var(--paper-lt)" }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: tone, fontWeight: 700 }}>Base de apertura · {result === null ? "por validar" : result ? "validada" : "no cuadró"}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <span className="cmd-num font-slab" style={{ fontSize: 22 }}>{posMoney(cierre.base_dejada_cop)}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          dejada el {fechaCorta(fecha)}{cierre.shift_name ? ` · ${cierre.shift_name}` : ""}{cierre.counted_by_name ? ` · contó ${cierre.counted_by_name}` : ""}
          {cierre.base_confirmada_at ? ` · armada y confirmada${cierre.base_confirmada_by_name ? ` por ${cierre.base_confirmada_by_name}` : ""} ${formatTime(cierre.base_confirmada_at, tz)}` : " · sin confirmar por quien cerró"}
        </span>
      </div>
      {lineas.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
          {lineas.map((l) => (
            <li key={l.valor} style={{ ...pieceRow, padding: "6px 0" }}>
              <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, minWidth: 40 }}>{l.cantidad} ×</span>
              <span className="cmd-num" style={{ fontSize: 16, flex: 1 }}>{posMoney(l.valor)}</span>
              <span className="cmd-num" style={{ fontSize: 13, color: "var(--muted)" }}>{posMoney(l.valor * l.cantidad)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Ese cierre no registró la composición de la base; valida solo el monto.</div>
      )}
      {lineas.length > 0 && <SencilloLine sen={sencilloDe(lineas, cierre.base_dejada_cop)} />}
      {result === null ? (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>Cuenta lo que hay en la caja antes de vender. ¿Coincide con esto?</div>
          {mode === "nocuadra" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <label style={{ fontSize: 12.5 }}>¿Cuánto encontraste?</label>
              <input inputMode="numeric" value={encontrado} onChange={(e) => setEncontrado(e.target.value)} aria-label="Base encontrada" placeholder="0" style={numInput(encontrado.trim() !== "" && parseCantidad(encontrado) === null ? "bad" : "idle")} />
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} aria-label="Nota de la validación" placeholder="Qué faltaba o sobraba" style={{ flex: 1, minWidth: 180, height: 48, padding: "0 10px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {mode === "idle" ? (
              <>
                <button type="button" className="cmd-btn" disabled={busy} onClick={() => void send(true)} style={{ height: 48, padding: "0 18px", fontSize: 13 }}>{busy ? "Guardando…" : "✓ Está correcta"}</button>
                <button type="button" className="cmd-btn ghost" disabled={busy} onClick={() => setMode("nocuadra")} style={{ height: 48, padding: "0 18px", fontSize: 13 }}>No cuadra</button>
              </>
            ) : (
              <>
                <button type="button" className="cmd-btn red" disabled={busy} onClick={() => void send(false)} style={{ height: 48, padding: "0 18px", fontSize: 13 }}>{busy ? "Guardando…" : "Reportar que no cuadra"}</button>
                <button type="button" className="cmd-btn ghost" disabled={busy} onClick={() => setMode("idle")} style={{ height: 48, padding: "0 18px", fontSize: 13 }}>Volver</button>
              </>
            )}
            {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, marginTop: 8, color: tone, fontWeight: 600 }}>{result ? "✓ Base validada. Ya puedes abrir." : "Reportado: la base no coincidía. El dueño lo ve en el panel."}</div>
      )}
    </section>
  );
}
