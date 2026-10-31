"use client";

import * as React from "react";
import { generarFrase } from "../actions";
import { FRASE_TONOS, FRASE_MAX, type FraseTono } from "@/lib/pos/frase";
import { renderOrderLabel, renderMessageLabel, ensureLabelFonts } from "@/lib/printer/label";
import { useCatalog, usePos, closeEtiquetas } from "../pos-store";
import { rebuildPeople } from "@/lib/pos/pending";
import { usePrinter, connectPrinter, checkPrinter, printOrderLabel, printDrinkLabel, printMessageLabel, relaysLabels } from "@/lib/printer/serial";
import { C, F, H, Overlay } from "./theme";
import { chipStyle } from "./top-bar";
import { personChip } from "./ticket";

// ════════════════════════════════════════════════════════════════
// Etiquetas — print or reprint a label on demand
// ════════════════════════════════════════════════════════════════
export const etqBtn = (primary: boolean, off: boolean): React.CSSProperties => ({
  height: 48, padding: "0 16px", borderRadius: 10, cursor: off ? "default" : "pointer", opacity: off ? 0.45 : 1, flex: 1, minWidth: 0,
  border: `1px solid ${C.rule}`, background: primary ? C.ink : "transparent", color: primary ? C.paperLt : C.ink,
  fontFamily: F.mono, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
});
export const etqTitle: React.CSSProperties = { ...H, fontSize: 20, lineHeight: 1.1, color: C.ink };
export const etqHint: React.CSSProperties = { fontSize: 13, color: C.muted, margin: "4px 0 12px", lineHeight: 1.45 };
export const etqLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.muted, margin: "14px 0 6px" };

/** The label exactly as the printer will draw it (same renderer, 1 bit). */
export function LabelPreview({ kind, text, extra, art }: { kind: "nombre" | "frase"; text: string; extra: string; art?: string | null }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    let off = false;
    void (async () => {
      await ensureLabelFonts();
      const c = ref.current;
      if (off || !c) return;
      // The name label carries the brand's hand; a failed load just leaves it out.
      const img = kind === "nombre" && art
        ? await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = art; })
        : null;
      if (off) return;
      const r = kind === "frase" ? renderMessageLabel({ text, handle: extra }) : renderOrderLabel({ name: text, folio: extra, art: img });
      c.width = r.width;
      c.height = r.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#000";
      r.rows.forEach((row, y) => {
        for (let x = 0; x < r.width; x++) if (row[x >> 3] & (0x80 >> (x & 7))) ctx.fillRect(x, y, 1, 1);
      });
    })();
    return () => { off = true; };
  }, [kind, text, extra, art]);
  return <canvas ref={ref} className="pos-etq-prev" aria-label="Vista previa de la etiqueta" />;
}

/**
 * Labels on demand, away from any sale: the customer wants another name on
 * the cup, or a different phrase. Left: the name (typed, or picked from the
 * ticket / the open orders) as a name label or on a cup label. Right: a
 * phrase in the feeling they ask for — read it, tweak it, then print.
 */
export function EtiquetasScreen() {
  const s = usePos();
  const p = usePrinter();
  const catalog = useCatalog();

  const [name, setName] = React.useState("");
  const [folio, setFolio] = React.useState("");
  const [drinkId, setDrinkId] = React.useState("");
  const [tono, setTono] = React.useState<FraseTono | null>(null);
  const [frase, setFrase] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Who is around right now: the ticket's people, then the open orders'.
  const picks = React.useMemo(() => {
    const out: Array<{ name: string; folio: string }> = [];
    const editingFolio = s.pending?.folio ?? "";
    for (const n of s.people) out.push({ name: n, folio: editingFolio });
    for (const o of s.pendientes) {
      if (o.folio === editingFolio) continue;
      const names = rebuildPeople(o);
      for (const n of names.length ? names : o.customerName ? [o.customerName] : []) out.push({ name: n, folio: o.folio });
    }
    return out.slice(0, 14);
  }, [s.people, s.pendientes, s.pending]);
  const drinks = React.useMemo(() => catalog.menu.filter((m) => m.printsLabel).sort((a, b) => a.name.localeCompare(b.name, "es")), [catalog.menu]);

  const remote = relaysLabels(p);
  const canPrint = p.status === "ready" || p.status === "printing" || remote;
  const who = name.replace(/\s+/g, " ").trim();
  const drink = drinkId ? catalog.byId[drinkId] : undefined;
  const text = frase.replace(/\s+/g, " ").trim();

  const generate = async (t: FraseTono | null) => {
    if (loading) return;
    setTono(t);
    setLoading(true);
    setError(null);
    try {
      // With a drink chosen above, the phrase is about that drink.
      const res = await generarFrase(t ?? undefined, drinkId || undefined);
      if (res.ok) setFrase(res.texto);
      else setError(res.error);
    } catch {
      setError("No se pudo generar la frase.");
    } finally {
      setLoading(false);
    }
  };

  const busy = p.status === "printing" || p.status === "connecting";
  const status = remote
    ? p.relayNote ?? "Las etiquetas salen en la caja con impresora"
    : p.status === "unsupported"
    ? "Este dispositivo no puede imprimir etiquetas. Usa la caja conectada a la impresora."
    : busy
      ? "Imprimiendo…"
      : p.note && p.status !== "ready"
        ? p.note
        : p.status === "ready"
          ? p.lastPrinted ? `Impresa: ${p.lastPrinted.name || p.lastPrinted.folio}` : "Impresora lista"
          : "Impresora sin conectar";
  const tonoChip = (on: boolean): React.CSSProperties => ({ ...personChip(on), height: "max(40px, var(--pos-chip))", padding: "0 14px", fontSize: 15, opacity: loading ? 0.6 : 1 });

  return (
    <Overlay align="fill">
      <div role="region" aria-label="Etiquetas" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="pos-hdr pos-ord-hdr">
          <button onClick={closeEtiquetas} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>← Volver</button>
          <span style={{ ...H, fontSize: 22 }}>Etiquetas<span style={{ color: C.red }}>.</span></span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span role="status" style={{ fontSize: 13, color: p.status === "error" || p.status === "off" ? C.red : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
            {(p.status === "disconnected" || p.status === "error" || p.status === "off") && (
              <button onClick={() => (p.status === "off" ? void checkPrinter() : void connectPrinter())} style={{ ...chipStyle, flexShrink: 0 }}>{p.status === "off" ? "Reintentar" : "Conectar impresora"}</button>
            )}
          </span>
        </div>

        <div className="pos-etq pos-scroll">
          <div className="pos-etq-grid">
            {/* ── name ── */}
            <section className="pos-etq-card" aria-label="Etiqueta de nombre">
              <div style={etqTitle}>Nombre</div>
              <div style={etqHint}>Escribe el nombre como lo quiere el cliente (apodo, pronombre, lo que sea) e imprime una etiqueta nueva.</div>
              <input
                className="pos-nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre para la etiqueta"
                aria-label="Nombre para la etiqueta"
                autoComplete="off"
                autoCapitalize="words"
                maxLength={40}
                style={{ fontFamily: F.mono }}
              />
              {picks.length > 0 && (
                <>
                  <div style={etqLabel}>Del pedido · toca para usarlo</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {picks.map((k, i) => {
                      const on = k.name === name && k.folio === folio;
                      return (
                        <button type="button" key={`${k.folio}:${k.name}:${i}`} onClick={() => { setName(k.name); setFolio(k.folio); }} aria-pressed={on} style={personChip(on)}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                          {k.folio && <span className="cmd-num" style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>{k.folio}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {folio && (
                <div style={{ fontSize: 13, color: C.ink2, marginTop: 10 }}>
                  Pedido <span className="cmd-num" style={{ fontWeight: 700 }}>{folio}</span> en la etiqueta ·{" "}
                  <button type="button" className="pos-textbtn tight" onClick={() => setFolio("")} style={{ background: "none", border: "none", color: C.red, fontFamily: F.mono, fontSize: 13, cursor: "pointer" }}>quitar</button>
                </div>
              )}
              {who && <LabelPreview kind="nombre" text={who} extra={folio} art={catalog.handArt} />}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button type="button" disabled={!who || !canPrint} onClick={() => printOrderLabel({ name: who, folio, orgName: catalog.orgName })} style={etqBtn(true, !who || !canPrint)}>Imprimir nombre</button>
              </div>

              <div style={etqLabel}>Etiqueta del vaso (con ese nombre)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select className="pos-etq-select" value={drinkId} onChange={(e) => setDrinkId(e.target.value)} aria-label="Bebida" style={{ fontFamily: F.mono, flex: "1 1 200px", width: "auto" }}>
                  <option value="">Elige la bebida…</option>
                  {drinks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button type="button" disabled={!drink || !canPrint} onClick={() => drink && printDrinkLabel({ name: drink.name, spec: drink.spec, desc: drink.desc, customer: who || undefined, brand: catalog.orgName })} style={{ ...etqBtn(false, !drink || !canPrint), flex: "1 1 160px" }}>Imprimir vaso</button>
              </div>
            </section>

            {/* ── phrase ── */}
            <section className="pos-etq-card" aria-label="Etiqueta de frase">
              <div style={etqTitle}>Frase</div>
              <div style={etqHint}>Elige el sentimiento y la IA escribe una frase nueva. Puedes corregirla antes de imprimir.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FRASE_TONOS.map((t) => (
                  <button type="button" key={t.id} disabled={loading} onClick={() => void generate(t.id)} aria-pressed={tono === t.id && !!frase} style={tonoChip(tono === t.id && (!!frase || loading))}>{t.label}</button>
                ))}
                <button type="button" disabled={loading} onClick={() => void generate(null)} style={{ ...tonoChip(false), borderStyle: "dashed" }}>Sorpréndeme</button>
              </div>
              {error && <div role="alert" style={{ marginTop: 12, fontSize: 14, color: C.red }}>{error}</div>}
              <div style={etqLabel}>{loading ? "Pensando…" : "La frase"}</div>
              <textarea
                className="pos-etq-text"
                value={frase}
                onChange={(e) => setFrase(e.target.value)}
                placeholder="Toca un sentimiento, o escribe aquí tu propia frase."
                aria-label="Frase"
                rows={3}
                maxLength={FRASE_MAX}
                style={{ fontFamily: F.mono }}
              />
              {text && <LabelPreview kind="frase" text={text} extra={catalog.instagram ?? ""} />}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button type="button" disabled={loading || (!frase && !tono)} onClick={() => void generate(tono)} style={etqBtn(false, loading || (!frase && !tono))}>{loading ? "Pensando…" : "Otra frase"}</button>
                <button type="button" disabled={!text || !canPrint} onClick={() => printMessageLabel(text, catalog.instagram)} style={etqBtn(true, !text || !canPrint)}>Imprimir frase</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
