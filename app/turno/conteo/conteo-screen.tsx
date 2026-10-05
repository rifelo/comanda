"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { fullCountDue, groupForCount, parseCount, pickCountList, type ConteoKind } from "@/lib/inventario/conteo";
import { NIVELES, ZONAS, cantidadLegible, dePaquetes, guiaNivel, nivelDe, nombrePaquete, piezaDe, type Nivel } from "@/lib/inventario/niveles";
import { enviarConteo, type EnviarConteoResult } from "./actions";

export interface ConteoIngrediente {
  id: string;
  name: string;
  unit: string;
  category_id: string | null;
  conteo_diario: boolean;
  archived: boolean;
  pack_qty: number | null;
  pack_label: string | null;
  pieza_qty: number | null;
  stock_critico: number;
  stock_min: number;
  stock_objetivo: number | null;
  ubicacion: string | null;
}

/** Size of the piece the item is counted in (bolsa = 900 ml), or null: counted in its unit. */
const pieza = (i: ConteoIngrediente) => piezaDe({ unit: i.unit, pack_qty: i.pack_qty === null ? null : Number(i.pack_qty), pieza_qty: i.pieza_qty === null ? null : Number(i.pieza_qty) });
/** Counted in whole pieces plus loose units when the item has a piece. */
const porPaquete = (i: ConteoIngrediente) => pieza(i) !== null;
/** Draft key of the packs box (the loose box keeps the bare id). */
const pk = (id: string) => `${id}:p`;
const nivelItem = (i: ConteoIngrediente) => ({ unit: i.unit, stock_critico: Number(i.stock_critico ?? 0), stock_min: Number(i.stock_min ?? 0), stock_objetivo: i.stock_objetivo === null ? null : Number(i.stock_objetivo), pack_qty: i.pack_qty === null ? null : Number(i.pack_qty), pieza_qty: i.pieza_qty === null ? null : Number(i.pieza_qty), pack_label: i.pack_label });

type Step = { kind: "setup" } | { kind: "count"; countKind: ConteoKind } | { kind: "done"; result: Extract<EnviarConteoResult, { ok: true }> };
type Draft = { values: Record<string, string>; notes: Record<string, string> };

const draftKey = (today: string, kind: ConteoKind) => `conteo:draft:${today}:${kind}`;
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

export function ConteoScreen({ actor, sedeName, today, ingredientes, categorias, lastCompletoAt, todayKinds }: {
  actor: { name: string; isAdmin: boolean };
  sedeName: string;
  today: string;
  ingredientes: ConteoIngrediente[];
  categorias: { id: string; label: string }[];
  lastCompletoAt: string | null;
  todayKinds: ConteoKind[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ kind: "setup" });
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bajos, setBajos] = React.useState<BajoLine[]>([]);

  const daily = pickCountList(ingredientes, "diario");
  const full = pickCountList(ingredientes, "completo");
  const due = fullCountDue(lastCompletoAt);

  // Resume a draft for this kind (the count takes minutes; a refresh must not lose it).
  function start(kind: ConteoKind) {
    const d = readDraft(draftKey(today, kind));
    if (d) {
      setValues(d.values ?? {});
      setNotes(d.notes ?? {});
    } else {
      setValues({});
      setNotes({});
    }
    setStep({ kind: "count", countKind: kind });
  }
  React.useEffect(() => {
    if (step.kind !== "count") return;
    writeDraft(draftKey(today, step.countKind), { values, notes });
  }, [step, values, notes, today]);

  const list = React.useMemo(
    () => (step.kind === "count" ? pickCountList(ingredientes, step.countKind) : []),
    [step, ingredientes],
  );
  /**
   * What was counted for an item, in stock units: packs × pack size + loose.
   * `null` = not counted yet, `"bad"` = something typed that isn't a number.
   */
  const countedOf = React.useCallback((i: ConteoIngrediente): number | null | "bad" => {
    const loose = (values[i.id] ?? "").trim();
    if (!porPaquete(i)) return loose === "" ? null : parseCount(loose) ?? "bad";
    const packs = (values[pk(i.id)] ?? "").trim();
    if (loose === "" && packs === "") return null;
    const l = loose === "" ? 0 : parseCount(loose);
    const p = packs === "" ? 0 : parseCount(packs);
    if (l === null || p === null) return "bad";
    return dePaquetes(p, l, pieza(i));
  }, [values]);
  const filled = list.filter((i) => typeof countedOf(i) === "number").length;
  const invalid = list.filter((i) => countedOf(i) === "bad").length;

  async function submit() {
    if (step.kind !== "count" || sending) return;
    const items = list
      .map((i) => ({ ingredienteId: i.id, counted: countedOf(i), note: (notes[i.id] ?? "").trim() || undefined }))
      .filter((x): x is { ingredienteId: string; counted: number; note: string | undefined } => typeof x.counted === "number");
    if (!items.length) {
      setError("Cuenta al menos un ítem.");
      return;
    }
    const missing = list.length - items.length;
    if (missing > 0 && !window.confirm(`Faltan ${missing} ítem${missing === 1 ? "" : "s"} sin contar. ¿Enviar de todos modos?`)) return;
    setSending(true);
    setError(null);
    const res = await enviarConteo({ kind: step.countKind, items });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    writeDraft(draftKey(today, step.countKind), null);
    // What came out red or amber, for the "para pedir" list on the receipt.
    const counted = new Map(items.map((x) => [x.ingredienteId, x.counted]));
    setBajos(
      list
        .filter((i) => counted.has(i.id))
        .map((i) => ({ i, nivel: nivelDe(counted.get(i.id)!, Number(i.stock_critico ?? 0), Number(i.stock_min ?? 0)), counted: counted.get(i.id)! }))
        .filter((x) => x.nivel !== "verde")
        .sort((a, b) => (a.nivel === "rojo" ? 0 : 1) - (b.nivel === "rojo" ? 0 : 1) || a.i.name.localeCompare(b.i.name, "es"))
        .map((x) => ({ id: x.i.id, name: x.i.name, nivel: x.nivel, quedan: cantidadLegible(x.counted, nivelItem(x.i)) })),
    );
    setStep({ kind: "done", result: res });
    router.refresh();
  }

  // Walked zone by zone when the items have one, else by category.
  const byCat = React.useMemo(() => groupForCount(list, categorias, ZONAS), [list, categorias]);

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      {/* top bar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Conteo<span style={{ color: "var(--red)" }}>.</span></span>
        <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName} · {today}</span>
        {step.kind === "count" && (
          <span className="cmd-num" style={{ marginLeft: 12, fontSize: 12, fontWeight: 700, color: filled === list.length ? "var(--green)" : "var(--ink)" }}>{filled} de {list.length}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={actor.name}>{actor.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/turno" style={chip}>← Turno</Link>
          {actor.isAdmin && <Link href="/inventario/conteos" style={chip}>Panel</Link>}
        </div>
      </div>

      {step.kind === "setup" && (
        <div style={{ padding: "22px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
          <section>
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>¿Qué se cuenta?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <KindCard
                title="Conteo rápido"
                count={daily.length}
                hint={daily.length ? "Lo crítico: lo que frena la venta si se acaba. Cinco minutos al cierre." : "Marca en el panel (Inventario → Niveles) qué ítems entran en el conteo rápido."}
                done={todayKinds.includes("diario")}
                disabled={daily.length === 0}
                onStart={() => start("diario")}
              />
              <KindCard
                title="Conteo completo"
                count={full.length}
                hint={due.due ? (due.days === null ? "Nunca se ha hecho. Toca hacerlo esta semana." : `El último fue hace ${due.days} días. Toca esta semana.`) : `El último fue hace ${due.days} días. Se hace una vez por semana.`}
                accent={due.due}
                done={todayKinds.includes("completo")}
                disabled={full.length === 0}
                onStart={() => start("completo")}
              />
            </div>
          </section>

          <section style={{ border: "1px dashed var(--rule)", borderRadius: 6, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2, var(--ink))" }}>
            <b>Cómo contar bien.</b> Cuenta lo que hay en estante y nevera, no lo que crees que debería haber. Lo que viene en paquete se cuenta en paquetes cerrados más lo suelto; lo abierto se pesa o se cuenta. Al escribir, cada ítem muestra su color: <b style={{ color: "var(--green)" }}>hay</b>, <b style={{ color: "var(--amber)" }}>poco</b> o <b style={{ color: "var(--red)" }}>se acabó</b>. Si algo se rompió o se botó, anótalo en el ítem. El dueño aprueba al final.
          </section>
        </div>
      )}

      {step.kind === "count" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 120px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12, color: "var(--muted)" }}>
              <span>Cuenta <b style={{ color: "var(--ink)" }}>{actor.name}</b> · {step.countKind === "diario" ? "conteo rápido" : "inventario completo"}</span>
              <button type="button" onClick={() => setStep({ kind: "setup" })} style={{ ...chip, marginLeft: "auto", height: 30 }}>Cambiar</button>
            </div>
            {byCat.map((g) => (
              <div key={g.label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--rule)", marginBottom: 6 }}>{g.label}</div>
                {g.items.map((i) => {
                  const c = countedOf(i);
                  const bad = c === "bad";
                  const ok = typeof c === "number";
                  const nivel: Nivel | null = ok ? nivelDe(c, Number(i.stock_critico ?? 0), Number(i.stock_min ?? 0)) : null;
                  const guia = guiaNivel(nivelItem(i));
                  const box = (key: string, label: string, width: number): React.ReactNode => (
                    <input
                      inputMode="decimal"
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      aria-label={label}
                      placeholder="—"
                      style={{ width, height: 48, padding: "0 10px", textAlign: "right", border: `1.5px solid ${bad ? "var(--red)" : nivel ? NIVELES[nivel].color : "var(--rule)"}`, borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, outline: "none" }}
                    />
                  );
                  return (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                        {guia && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{guia}</div>}
                        {noteOpen === i.id ? (
                          <input value={notes[i.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))} onBlur={() => setNoteOpen(null)} maxLength={120} placeholder="Nota (se rompió, se botó…)" aria-label={`Nota de ${i.name}`} style={{ marginTop: 4, width: "100%", height: 32, padding: "0 8px", border: "1px solid var(--rule)", borderRadius: 3, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }} />
                        ) : (
                          <button type="button" onClick={() => setNoteOpen(i.id)} style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 10.5, color: notes[i.id] ? "var(--ink)" : "var(--muted)", fontFamily: "var(--font-mono)", cursor: "pointer", textDecoration: "underline dotted" }}>
                            {notes[i.id] ? `Nota: ${notes[i.id]}` : "+ nota"}
                          </button>
                        )}
                      </div>
                      <span role="status" aria-label={`Nivel de ${i.name}`} style={{ width: 74, fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", textAlign: "right", color: nivel ? NIVELES[nivel].color : "transparent" }}>
                        {nivel ? NIVELES[nivel].short : "·"}
                      </span>
                      {porPaquete(i) && (
                        <>
                          {box(pk(i.id), `${nombrePaquete(i, 2)} cerrados de ${i.name}`, 84)}
                          <span style={{ width: 62, fontSize: 11, color: "var(--muted)", lineHeight: 1.2 }}>{nombrePaquete(i, 2)}<br />×{pieza(i)}</span>
                          <span aria-hidden style={{ fontSize: 14, color: "var(--muted)" }}>+</span>
                        </>
                      )}
                      {box(i.id, porPaquete(i) ? `Sueltos de ${i.name}` : `Cantidad de ${i.name}`, porPaquete(i) ? 96 : 118)}
                      <span style={{ width: 34, fontSize: 11, color: "var(--muted)" }}>{i.unit}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--paper-lt)", borderTop: "1.5px solid var(--ink)", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              <span className="cmd-num" style={{ color: "var(--ink)", fontWeight: 700 }}>{filled}</span> de {list.length} contados{invalid > 0 ? <span style={{ color: "var(--red)" }}> · {invalid} con valor inválido</span> : null}
            </span>
            {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
            <button type="button" className="cmd-btn red" onClick={() => void submit()} disabled={sending || filled === 0 || invalid > 0} style={{ marginLeft: "auto", height: 52, padding: "0 22px", fontSize: 13 }}>
              {sending ? "Enviando…" : "Enviar conteo"}
            </button>
          </div>
        </>
      )}

      {step.kind === "done" && <ConteoResult result={step.result} person={actor.name} bajos={bajos} />}
    </div>
  );
}

function KindCard({ title, count, hint, accent, done, disabled, onStart }: { title: string; count: number; hint: string; accent?: boolean; done: boolean; disabled: boolean; onStart: () => void }) {
  return (
    <div style={{ border: `1.5px solid ${accent ? "var(--red)" : "var(--rule)"}`, borderRadius: 8, padding: "14px 16px", background: "var(--paper-lt)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span className="font-slab" style={{ fontSize: 20 }}>{title}</span>
        <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{count} ítem{count === 1 ? "" : "s"}</span>
      </div>
      <div style={{ fontSize: 12, color: accent ? "var(--red)" : "var(--muted)", lineHeight: 1.5 }}>{hint}</div>
      {done && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>✓ Ya se envió uno hoy</div>}
      <button type="button" className={accent ? "cmd-btn red" : "cmd-btn"} onClick={onStart} disabled={disabled} style={{ height: 48, fontSize: 13 }}>
        {done ? "Contar de nuevo" : "Empezar"}
      </button>
    </div>
  );
}

/** An item that came out red or amber in the count just sent. */
interface BajoLine { id: string; name: string; nivel: Nivel; quedan: string }

function ConteoResult({ result, person, bajos }: { result: Extract<EnviarConteoResult, { ok: true }>; person: string; bajos: BajoLine[] }) {
  const s = result.summary;
  const diffs = result.lines.filter((l) => l.diff !== 0);
  return (
    <div style={{ padding: "22px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ border: "1.5px solid var(--ink)", borderRadius: 10, padding: "20px 22px", background: "var(--paper-lt)" }}>
        <div className="font-slab" style={{ fontSize: 26 }}>Conteo enviado<span style={{ color: "var(--green)" }}>.</span></div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Contó {person} · {s.lines} ítems · queda pendiente de aprobación del dueño. El inventario no cambia hasta que lo apruebe.</div>
        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          <Stat k="Con diferencia" v={`${s.withDiff}`} />
          <Stat k="Faltante" v={posMoney(s.shortValue)} color={s.shortValue ? "var(--red)" : undefined} />
          <Stat k="Sobrante" v={posMoney(s.overValue)} color={s.overValue ? "var(--amber)" : undefined} />
        </div>
      </div>
      {bajos.length > 0 && (
        <div aria-label="Para pedir">
          <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Para pedir · {bajos.length}</div>
          {bajos.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "9px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span style={{ width: 78, fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: NIVELES[b.nivel].color }}>{NIVELES[b.nivel].short}</span>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{b.name}</span>
              <span className="cmd-num" style={{ color: "var(--muted)", fontSize: 12 }}>quedan {b.quedan}</span>
            </div>
          ))}
        </div>
      )}
      {diffs.length > 0 ? (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Diferencias</div>
          {diffs.map((l) => (
            <div key={l.ingredienteId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 14, alignItems: "baseline", padding: "9px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{l.name}</span>
              <span className="cmd-num" style={{ color: "var(--muted)", fontSize: 12 }}>esperado {l.expected} {l.unit}</span>
              <span className="cmd-num">contado {l.counted} {l.unit}</span>
              <span className="cmd-num" style={{ fontWeight: 700, color: l.diff < 0 ? "var(--red)" : "var(--amber)", minWidth: 90, textAlign: "right" }}>{l.diff > 0 ? "+" : ""}{l.diff} · {posMoney(Math.abs(l.value))}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>✓ Todo cuadra con el sistema.</div>
      )}
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
