"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ESTADOS, fraseFaltantes, resumenReporte, type FaltanteEstado, type RapidoRow, type RapidoView, type ResumenReporte } from "@/lib/inventario/faltantes";
import { formatTime } from "@/lib/utils";

export interface RapidoInput {
  items: Array<{ ingredienteId: string; estado: FaltanteEstado; note?: string }>;
}
export type RapidoResult = { ok: true; count: number } | { ok: false; error: string };

type Draft = { sel: Record<string, FaltanteEstado>; notes: Record<string, string> };
const draftKey = (today: string, scope: string) => `faltantes:draft:${today}:${scope}`;
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

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" };
const ORDER: FaltanteEstado[] = ["ok", "bajo", "agotado"];
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * Quick inventory for the barista, shared by the shop tablet
 * (/turno/inventario) and the staff shift screen (/shift/[id]/inventario).
 * Only the priority ingredients, most critical first; one tap per item
 * (Hay / Poco / Se acabó), then one "Enviar" that records the batch. What is
 * already flagged shows with who and when, so the next person sees it
 * without re-reporting. `submit` is the server action of whichever surface
 * renders it; `scope` keys the local draft.
 */
export function RapidoScreen({ actor, sedeName, today, tz, view, scope, submit, backHref, backLabel, panelHref, manageHref }: {
  actor: { name: string; isAdmin: boolean };
  sedeName: string;
  today: string;
  tz: string;
  view: RapidoView;
  scope: string;
  submit: (input: RapidoInput) => Promise<RapidoResult>;
  backHref: string;
  backLabel: string;
  panelHref?: string;
  /** Admin-only link to edit the priority list. */
  manageHref?: string;
}) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Record<string, FaltanteEstado>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<ResumenReporte | null>(null);
  const loaded = React.useRef(false);
  const key = draftKey(today, scope);

  // Resume the draft (a refresh or a lost tab must not lose the taps).
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const d = readDraft(key);
    if (d) {
      // Drop taps for ingredients that left the list meanwhile.
      const ids = new Set(view.groups.flatMap((g) => g.rows.map((r) => r.id)));
      const s: Record<string, FaltanteEstado> = {};
      for (const [id, e] of Object.entries(d.sel ?? {})) if (ids.has(id)) s[id] = e;
      setSel(s);
      setNotes(d.notes ?? {});
    }
  }, [key, view]);
  React.useEffect(() => {
    if (!loaded.current || done) return;
    writeDraft(key, { sel, notes });
  }, [key, sel, notes, done]);

  const changes = Object.entries(sel).map(([ingredienteId, estado]) => ({ ingredienteId, estado, note: notes[ingredienteId]?.trim() || undefined }));
  const resumen = resumenReporte(changes);
  // What the list will look like after sending: open flags plus the taps.
  const rows = view.groups.flatMap((g) => g.rows);
  const after = rows.reduce(
    (acc, r) => {
      const e = sel[r.id] ?? r.estado;
      if (e === "agotado") acc.agotado += 1;
      else if (e === "bajo") acc.bajo += 1;
      return acc;
    },
    { agotado: 0, bajo: 0 },
  );

  function tap(row: RapidoRow, estado: FaltanteEstado) {
    setError(null);
    setSel((s) => {
      const n = { ...s };
      // Tapping the state that is already recorded (and not changed) clears the tap.
      if (n[row.id] === estado) delete n[row.id];
      else n[row.id] = estado;
      return n;
    });
  }

  async function send() {
    if (sending || changes.length === 0) return;
    setSending(true);
    setError(null);
    const res = await submit({ items: changes });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    writeDraft(key, null);
    setDone(resumen);
    setSel({});
    setNotes({});
    setNoteOpen(null);
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      {/* top bar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Faltantes<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName} · {today}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={actor.name}>{actor.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={backHref} style={chip}>← {backLabel}</Link>
          {actor.isAdmin && manageHref && <Link href={manageHref} style={chip}>Lista</Link>}
          {actor.isAdmin && panelHref && <Link href={panelHref} style={chip}>Panel</Link>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 140px", maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        {done && (
          <div role="status" style={{ border: "1.5px solid var(--green)", borderRadius: 8, padding: "14px 16px", background: "var(--paper-lt)", marginBottom: 16 }}>
            <div className="font-slab" style={{ fontSize: 22 }}>Reporte enviado<span style={{ color: "var(--green)" }}>.</span></div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              {done.total} ítem{done.total === 1 ? "" : "s"} · {fraseFaltantes(done) || "nada falta"}{done.ok ? ` · ${done.ok} con existencia` : ""}. El dueño lo ve en el panel (Notificaciones y Detalle de hoy).
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Link href={backHref} className="cmd-btn" style={{ textDecoration: "none", height: 44, display: "inline-flex", alignItems: "center" }}>← {backLabel}</Link>
              <button type="button" className="cmd-btn ghost" onClick={() => setDone(null)} style={{ height: 44 }}>Seguir revisando</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>Ítems prioritarios · {view.counts.total}</span>
          {view.counts.agotado + view.counts.bajo > 0 ? (
            <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>Reportados: {fraseFaltantes(view.counts)}</span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--green)" }}>Nada reportado como faltante.</span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 6px" }}>
          Mira el estante y toca el estado de cada ítem. Solo se envían los que toques; lo demás queda como está.
        </p>

        {view.groups.length === 0 && (
          <div style={{ border: "1px dashed var(--rule)", borderRadius: 6, padding: "14px 16px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginTop: 12 }}>
            Todavía no hay ítems prioritarios. El dueño los marca en el panel: Inventario → Faltantes → Lista prioritaria.
            {actor.isAdmin && manageHref && (
              <div style={{ marginTop: 10 }}><Link href={manageHref} className="cmd-btn sm" style={{ textDecoration: "none" }}>Armar la lista →</Link></div>
            )}
          </div>
        )}

        {view.groups.map((g) => (
          <section key={g.prioridad} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: g.prioridad === 1 ? "var(--red)" : g.prioridad === 2 ? "var(--amber)" : "var(--muted)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase" }}>{g.label}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>· {g.rows.length}</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.rows.map((r) => {
                const tapped = sel[r.id];
                const shown = tapped ?? r.estado;
                return (
                  <li key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>{r.name}</span>
                        {r.estado && !tapped && (
                          <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: ESTADOS[r.estado].color, border: `1px solid ${ESTADOS[r.estado].color}`, padding: "2px 6px", borderRadius: 3 }}>
                            {ESTADOS[r.estado].short}
                          </span>
                        )}
                        {tapped && <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink)", background: "var(--paper-lt)", border: "1px solid var(--ink)", padding: "2px 6px", borderRadius: 3 }}>cambiado</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
                        Sistema: <span className="cmd-num" style={{ color: r.sistema === "sin" ? "var(--red)" : r.sistema === "bajo" ? "var(--amber)" : "var(--muted)" }}>{fmtQty(r.stock_current)} {r.unit}</span>
                        {r.stock_min > 0 && <span> · mínimo {fmtQty(r.stock_min)}</span>}
                        {r.estado && r.reported_at && (
                          <span> · reportado {ESTADOS[r.estado].short} {formatTime(r.reported_at, tz)}{r.reported_by_name ? ` por ${r.reported_by_name.split(" ")[0]}` : ""}{r.note ? ` · “${r.note}”` : ""}</span>
                        )}
                      </div>
                      {noteOpen === r.id ? (
                        <input
                          autoFocus
                          value={notes[r.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                          onBlur={() => setNoteOpen(null)}
                          maxLength={120}
                          placeholder="Nota (opcional): cuánto queda, qué comprar…"
                          aria-label={`Nota para ${r.name}`}
                          style={{ marginTop: 6, width: "100%", maxWidth: 420, height: 36, padding: "0 8px", border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12.5, outline: "none" }}
                        />
                      ) : notes[r.id] ? (
                        <button type="button" onClick={() => setNoteOpen(r.id)} style={{ marginTop: 4, background: "transparent", border: "none", padding: 0, color: "var(--ink-2)", fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer", textAlign: "left" }}>✎ “{notes[r.id]}”</button>
                      ) : tapped ? (
                        <button type="button" onClick={() => setNoteOpen(r.id)} style={{ marginTop: 4, background: "transparent", border: "none", padding: 0, color: "var(--muted)", fontSize: 11.5, fontFamily: "var(--font-mono)", cursor: "pointer" }}>+ nota</button>
                      ) : null}
                    </div>
                    <div role="group" aria-label={`Estado de ${r.name}`} style={{ display: "flex", gap: 6 }}>
                      {ORDER.map((e) => {
                        const on = shown === e;
                        const c = ESTADOS[e].color;
                        return (
                          <button
                            key={e}
                            type="button"
                            aria-pressed={on}
                            onClick={() => tap(r, e)}
                            style={{
                              minWidth: 78, height: 54, padding: "0 10px", borderRadius: 6, cursor: "pointer",
                              border: `2px solid ${on ? c : "var(--rule)"}`, background: on ? c : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)",
                              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap",
                            }}
                          >
                            {ESTADOS[e].label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* sticky footer */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--paper-lt)", borderTop: "1.5px solid var(--ink)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Por enviar</div>
          <div className="cmd-num font-slab" style={{ fontSize: 22, lineHeight: 1.1 }}>
            {changes.length}
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", marginLeft: 8 }}>{changes.length ? fraseFaltantes(resumen) || "todo con existencia" : "toca un estado"}</span>
          </div>
        </div>
        <div className="hidden sm:block" style={{ fontSize: 11.5, color: "var(--muted)" }}>
          Quedarían: <span style={{ color: after.agotado ? "var(--red)" : "var(--muted)" }}>{after.agotado} agotado{after.agotado === 1 ? "" : "s"}</span> · <span style={{ color: after.bajo ? "var(--amber)" : "var(--muted)" }}>{after.bajo} poco</span>
        </div>
        {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
        <button type="button" className="cmd-btn red" onClick={() => void send()} disabled={sending || changes.length === 0} style={{ marginLeft: "auto", height: 52, padding: "0 22px", fontSize: 13 }}>
          {sending ? "Enviando…" : `Enviar reporte${changes.length ? ` (${changes.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}
