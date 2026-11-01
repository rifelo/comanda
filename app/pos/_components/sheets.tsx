"use client";

import * as React from "react";
import { posMoney, type PosModGroup } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, modLinePrice, posDefaultMods, tapItem, addLineWithMods, replaceLine, removeLine, type ModSelection } from "../pos-store";
import { C, F, H, Overlay } from "./theme";
import { PersonPicker, qtyBtn } from "./ticket";

// ════════════════════════════════════════════════════════════════
// Item sheet — modifiers + qty (add or edit)
// ════════════════════════════════════════════════════════════════
export function ItemSheet() {
  const s = usePos();
  const catalog = useCatalog();
  const sheet = s.sheet as { mode: "add"; productId: string } | { mode: "edit"; idx: number };
  const line = sheet.mode === "edit" ? s.order[sheet.idx] : undefined;
  const productId = sheet.mode === "add" ? sheet.productId : line?.id;
  const p = productId ? catalog.byId[productId] : undefined;

  const [mods, setMods] = React.useState<ModSelection>(() => (line?.mods ? { ...line.mods } : p ? posDefaultMods(p, catalog) : {}));
  const [qty, setQty] = React.useState(line?.qty ?? 1);
  // Who the cup is for: the line's person when editing, else the active chip.
  const [person, setPerson] = React.useState<string | null>(() => line?.customer ?? s.activePerson);
  const close = () => posStore.set({ sheet: null });

  React.useEffect(() => {
    if (!p) close();
  }, [p]);
  if (!p) return null;

  const groups = p.mods.map((gid) => catalog.modGroups[gid]).filter((g): g is PosModGroup => !!g);
  const missing = groups.filter((g) => g.required && g.type === "single" && !mods[g.id]);
  const unit = modLinePrice({ id: p.id, name: p.name, qty: 1, kind: "item", basePrice: p.price, mods }, catalog);
  const commit = () => {
    if (missing.length) return;
    if (sheet.mode === "add") addLineWithMods(p.id, mods, qty, person);
    else replaceLine(sheet.idx, mods, qty, person);
  };

  return (
    <Overlay onClose={close} align="center">
      <div role="dialog" aria-modal aria-label={p.name} style={{ width: "min(600px, 94vw)", maxHeight: "88dvh", display: "flex", flexDirection: "column", background: C.paperLt, border: `1px solid ${C.rule}`, borderRadius: 16, boxShadow: "var(--shadow-2)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...H, fontSize: 24, lineHeight: 1.1, color: C.ink }}>{p.name}</div>
            {p.desc && <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{p.desc}</div>}
          </div>
          <button onClick={close} aria-label="Cerrar" style={{ width: "var(--pos-close)", height: "var(--pos-close)", borderRadius: "50%", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>

        <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 20px 12px" }}>
          {(s.people.length > 0 || person) && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Persona</span>
                <span style={{ fontSize: 11, color: C.muted }}>para quién es</span>
              </div>
              <PersonPicker value={person} onPick={setPerson} />
            </div>
          )}
          {groups.length === 0 && s.people.length === 0 && <div style={{ padding: "16px 0", color: C.muted, fontSize: 14 }}>Este producto no tiene opciones.</div>}
          {groups.map((g) => {
            const sel = mods[g.id];
            const isSel = (name: string) => (g.type === "single" ? sel === name : Array.isArray(sel) && sel.includes(name));
            const pick = (name: string) => setMods((m) => {
              if (g.type === "single") return { ...m, [g.id]: m[g.id] === name && !g.required ? null : name };
              const cur = Array.isArray(m[g.id]) ? (m[g.id] as string[]) : [];
              return { ...m, [g.id]: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] };
            });
            return (
              <div key={g.id} style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: g.required && !sel ? C.red : C.muted }}>
                    {g.required ? "obligatorio" : "opcional"} · {g.type === "single" ? "elige una" : "elige varias"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {g.options.map((o) => {
                    const on = isSel(o.name);
                    return (
                      <button key={o.name} onClick={() => pick(o.name)} aria-pressed={on} style={{
                        minHeight: 46, padding: "8px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                        border: `1.5px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paper, color: on ? C.paperLt : C.ink,
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: F.mono, fontSize: 15,
                      }}>
                        <span>{o.name}</span>
                        {o.delta > 0 && <span className="cmd-num" style={{ fontSize: 13, color: on ? C.paperLt : C.green, opacity: on ? 0.85 : 1 }}>+{posMoney(o.delta)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 20px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setQty((q) => Math.max(sheet.mode === "edit" ? 0 : 1, q - 1))} aria-label="Menos" style={{ ...qtyBtn, width: 44, height: 44 }}>−</button>
            <span className="cmd-num" style={{ fontSize: 20, fontWeight: 700, minWidth: 34, textAlign: "center" }}>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Más" style={{ ...qtyBtn, width: 44, height: 44 }}>+</button>
          </div>
          {sheet.mode === "edit" && (
            <button onClick={() => removeLine(sheet.idx)} style={{ height: 44, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${C.red}`, background: "transparent", color: C.red, fontFamily: F.mono, fontSize: 14, cursor: "pointer" }}>Quitar</button>
          )}
          <button
            className="cmd-btn"
            onClick={commit}
            disabled={missing.length > 0}
            style={{ flex: 1, height: 52, fontSize: 14, marginLeft: "auto", minWidth: 220, opacity: missing.length ? 0.45 : 1 }}
          >
            {missing.length ? `Elige ${missing[0].name.toLowerCase()}` : sheet.mode === "add" ? `Agregar · ${posMoney(unit * qty)}` : qty === 0 ? "Quitar del pedido" : `Guardar · ${posMoney(unit * qty)}`}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ════════════════════════════════════════════════════════════════
// Recipe sheet — long-press on a tile: photo, description, ingredients
// ════════════════════════════════════════════════════════════════
export function RecetaSheet({ productId, onClose, onAdd }: { productId: string; onClose?: () => void; onAdd?: () => void }) {
  const catalog = useCatalog();
  const p = catalog.byId[productId];
  const [zoom, setZoom] = React.useState(false);
  const close = onClose ?? (() => posStore.set({ sheet: null }));
  React.useEffect(() => { if (!p) close(); }, [p]);
  // Escape closes the zoomed photo first, before the root handler closes the sheet.
  React.useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setZoom(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);
  if (!p) return null;
  const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace(".", ","));
  const colHead: React.CSSProperties = { fontSize: 12, color: C.muted, paddingBottom: 6, borderBottom: `1px solid ${C.rule}` };
  return (
    <Overlay onClose={close} align="center">
      <div role="dialog" aria-modal aria-label={`Receta · ${p.name}`} className="pos-receta" style={{ display: "flex", flexDirection: "column", background: C.paperLt, border: `1px solid ${C.rule}`, borderRadius: 16, boxShadow: "var(--shadow-2)", overflow: "hidden" }}>
        {p.image ? (
          <button type="button" onClick={() => setZoom(true)} aria-label={`Ver la foto de ${p.name} en grande`} style={{ position: "relative", padding: 0, border: "none", background: C.paperDk, cursor: "zoom-in", flexShrink: 0, display: "block", width: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.name} className="pos-receta-photo" style={{ width: "100%", objectFit: "cover", display: "block" }} />
            <span style={{ position: "absolute", right: 10, bottom: 10, fontSize: 12, color: C.paperLt, background: "rgba(20,14,8,.6)", padding: "4px 8px", borderRadius: 10, fontFamily: F.mono }}>Toca para ampliar</span>
          </button>
        ) : (
          <div aria-hidden style={{ height: 8, background: C.ink, flexShrink: 0 }} />
        )}
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.rule}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.muted }}>Receta</div>
            <div style={{ ...H, fontSize: 26, lineHeight: 1.1, color: C.ink, marginTop: 2 }}>{p.name}</div>
            {p.desc && <div style={{ fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>{p.desc}</div>}
            {p.spec.length > 0 && p.printsLabel && (
              <div style={{ display: "inline-flex", gap: 6, marginTop: 8 }}>
                {p.spec.map((sp) => <span key={sp} style={{ fontSize: 12, fontWeight: 700, border: `1px solid ${C.rule}`, padding: "3px 8px", borderRadius: 10 }}>{sp}</span>)}
              </div>
            )}
          </div>
          <button onClick={close} aria-label="Cerrar" style={{ width: "var(--pos-close)", height: "var(--pos-close)", borderRadius: "50%", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>
        <div className="pos-receta-cols">
          <section className="pos-receta-col pos-scroll" aria-label="Ingredientes">
            <div style={colHead}>Ingredientes{p.recipe.length > 0 ? ` · ${p.recipe.length}` : ""}</div>
            {p.recipe.length === 0 ? (
              <div style={{ padding: "18px 0", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>Este producto no tiene receta cargada. Se agrega desde el panel, en Operación → Recetas.</div>
            ) : (
              p.recipe.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
                  <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, color: C.ink, minWidth: 82, textAlign: "right", whiteSpace: "nowrap" }}>{fmtQty(l.qty)} <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>{l.unit}</span></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.ink }}>{l.name}</span>
                    {l.note && <span style={{ display: "block", fontSize: 14, color: C.ink2, marginTop: 2, lineHeight: 1.45 }}>{l.note}</span>}
                  </span>
                </div>
              ))
            )}
          </section>
          <section className="pos-receta-col pos-scroll" aria-label="Preparación">
            <div style={colHead}>Preparación{p.prep.length > 0 ? ` · ${p.prep.length} pasos` : ""}</div>
            {p.prep.length === 0 ? (
              <div style={{ padding: "18px 0", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>Sin pasos de preparación. Se agregan desde el panel, en Operación → Recetas.</div>
            ) : (
              <ol aria-label="Pasos de preparación" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {p.prep.map((step, i) => (
                  <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "12px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
                    <span className="cmd-num" style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${C.rule}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 15, color: C.ink, lineHeight: 1.5, paddingTop: 4 }}>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Mantén presionado un producto para ver su receta.</span>
          <button className="cmd-btn" onClick={() => { if (onAdd) onAdd(); else { close(); tapItem(p.id); } }} disabled={p.stock === "sin"} style={{ marginLeft: "auto", height: 48, padding: "0 18px", fontSize: 15 }}>Agregar al pedido</button>
        </div>
      </div>
      {zoom && p.image && (
        <div role="dialog" aria-modal aria-label={`Foto de ${p.name}`} onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,14,8,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, boxShadow: "0 30px 80px -30px rgba(0,0,0,.8)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, textAlign: "center", color: C.paperLt, fontFamily: F.mono }}>
            <div style={{ ...H, fontSize: 22 }}>{p.name}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>Así debe verse · toca para cerrar</div>
          </div>
          <button type="button" onClick={() => setZoom(false)} aria-label="Cerrar foto" style={{ position: "absolute", top: 14, right: 14, width: 44, height: 44, borderRadius: 22, border: `1.5px solid ${C.paperLt}`, background: "transparent", color: C.paperLt, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
      )}
    </Overlay>
  );
}
