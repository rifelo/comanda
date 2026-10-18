"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZONAS } from "@/lib/inventario/niveles";
import { PRESENTACIONES } from "@/lib/inventario/propuestas";
import { clasificar, type ItemZona, type Zona } from "@/lib/inventario/sugerencias";
import { sugerirItem } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const pick = (on: boolean): React.CSSProperties => ({ ...chip, height: 46, textTransform: "none", letterSpacing: 0, fontSize: 14, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)" });

export function SugerirScreen({ sedeName, actorName, items, abiertas }: {
  sedeName: string;
  actorName: string;
  items: ItemZona[];
  abiertas: { id: string; zona: string; texto: string; nota: string | null; quien: string | null }[];
}) {
  const router = useRouter();
  const [zona, setZona] = React.useState<Zona | null>(null);
  const [texto, setTexto] = React.useState("");
  const [presentacion, setPresentacion] = React.useState<string>("und");
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const enZona = zona ? items.filter((i) => i.ubicacion === zona) : [];
  const c = zona && texto.trim().length >= 2 ? clasificar(texto, zona, items) : null;

  async function enviar(input: { tipo: "ubicacion"; item: ItemZona } | { tipo: "nuevo" }) {
    if (!zona || busy) return;
    setBusy(true);
    setError(null);
    const r = await sugerirItem(input.tipo === "ubicacion"
      ? { zona, tipo: "ubicacion", ingredienteId: input.item.id, nota: nota.trim() || undefined }
      : { zona, tipo: "nuevo", nombre: texto.trim(), presentacion, nota: nota.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const que = input.tipo === "ubicacion" ? `«${input.item.name}» va en ${zona}` : `falta «${texto.trim()}» en ${zona}`;
    setOk(r.repetida ? `Ya estaba sugerido: ${que}.` : `Listo: ${que}. El dueño lo revisa en el panel.`);
    setTexto("");
    setNota("");
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Sugerir ítems<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <span className="hidden sm:inline" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600 }}>{actorName}</span>
        <Link href="/turno/inventario" style={{ ...chip, marginLeft: 8 }}>← Inventario</Link>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <section aria-label="Sección">
          <div style={kicker}>1 · ¿En qué sección estás?</div>
          <div role="radiogroup" aria-label="Sección" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {ZONAS.map((z) => (
              <button key={z} type="button" role="radio" aria-checked={zona === z} onClick={() => { setZona(z); setOk(null); setError(null); }} style={{ ...pick(zona === z), minWidth: 110, justifyContent: "center" }}>
                {z} <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 6 }}>{items.filter((i) => i.ubicacion === z).length}</span>
              </button>
            ))}
          </div>
        </section>

        {zona && (
          <>
            <section aria-label="Qué falta o qué va aquí">
              <div style={kicker}>2 · ¿Qué falta en la lista de {zona}, o qué va aquí?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                <input value={texto} onChange={(e) => { setTexto(e.target.value); setOk(null); setError(null); }} placeholder="Escribe el ítem (leche deslactosada, jabón de loza…)" aria-label="Ítem" maxLength={80} style={{ ...field, width: "100%" }} />
                {c?.yaAqui && <p role="status" style={{ margin: 0, fontSize: 12.5, color: "var(--green)" }}>✓ «{c.igual!.name}» ya está en la lista de {zona}.</p>}
                {c?.igual && !c.yaAqui && (
                  <button type="button" disabled={busy} onClick={() => void enviar({ tipo: "ubicacion", item: c.igual! })} className="cmd-btn red" style={{ height: 50, alignSelf: "flex-start", fontSize: 12.5, textTransform: "none", letterSpacing: 0 }}>
                    «{c.igual.name}» va en {zona}{c.igual.ubicacion ? ` (hoy: ${c.igual.ubicacion})` : " (hoy sin sección)"}
                  </button>
                )}
                {c && !c.igual && (
                  <>
                    {c.parecidos.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>¿Es alguno de estos? Tócalo si va en {zona}:</div>
                        <div role="group" aria-label="Parecidos" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {c.parecidos.map((i) => (
                            <button key={i.id} type="button" disabled={busy || i.ubicacion === zona} onClick={() => void enviar({ tipo: "ubicacion", item: i })} style={{ ...pick(false), height: 44, fontSize: 13, opacity: i.ubicacion === zona ? 0.5 : 1 }}>
                              {i.name} <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>{i.ubicacion === zona ? "ya está aquí" : i.ubicacion ?? "sin sección"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>
                      <span style={{ fontSize: 12.5 }}>No está en la lista · viene en</span>
                      <select value={presentacion} onChange={(e) => setPresentacion(e.target.value)} aria-label="Viene en" style={{ ...field, height: 44, width: 130 }}>
                        {PRESENTACIONES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" disabled={busy} onClick={() => void enviar({ tipo: "nuevo" })} className="cmd-btn red" style={{ height: 46, fontSize: 12 }}>{busy ? "Enviando…" : `Sugerir «${texto.trim()}»`}</button>
                    </div>
                  </>
                )}
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Nota (opcional: dónde está, marca, para qué se usa…)" aria-label="Nota" style={field} />
                {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
                {ok && <p role="status" style={{ margin: 0, fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</p>}
              </div>
            </section>

            <section aria-label={`En la lista de ${zona}`}>
              <div style={kicker}>Lo que la lista tiene en {zona} · {enZona.length}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.9, marginTop: 8 }}>
                {enZona.length ? enZona.map((i) => i.name).join(" · ") : "Nada todavía: todo lo que sugieras para esta sección ayuda al conteo."}
              </div>
            </section>
          </>
        )}

        <section aria-label="Sugerencias abiertas">
          <div style={kicker}>Esperando al dueño · {abiertas.length}</div>
          {abiertas.length === 0 && <div style={{ padding: "12px 0", fontSize: 13, color: "var(--muted)" }}>Nada pendiente.</div>}
          {abiertas.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "9px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", minWidth: 70 }}>{s.zona}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{s.texto}{s.nota && <span style={{ color: "var(--muted)" }}> · {s.nota}</span>}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{s.quien ?? "—"}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
