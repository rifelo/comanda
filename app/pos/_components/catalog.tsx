"use client";

import * as React from "react";
import { Stamp } from "@/components/comanda/primitives";
import { posMoney, POS_KIND_LABEL, FAV_CAT, COMBO_CAT, type PosCatalog, type PosMenuItem, type PosCombo } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, orderTotal, tapItem, showRecipe, addCombo, applyAct, dismissSuggestion, type SuggestionCardState } from "../pos-store";
import { C, F, TILE_ACCENTS } from "./theme";
import { KIND_COLOR } from "./ai";

// ════════════════════════════════════════════════════════════════
// Catalog — tabs + tile grid
// ════════════════════════════════════════════════════════════════
export function accentFor(catalog: PosCatalog, catId: string): string {
  const i = catalog.cats.findIndex((c) => c.id === catId);
  return TILE_ACCENTS[(i < 0 ? 0 : i) % TILE_ACCENTS.length];
}

export function Catalog() {
  const s = usePos();
  const catalog = useCatalog();
  const cat = s.cat || FAV_CAT;
  const gridRef = React.useRef<HTMLDivElement>(null);
  const hlRef = React.useRef<HTMLButtonElement>(null);

  const filter = s.catalogFilter;
  const q = s.search.trim().toLowerCase();
  const setCat = (id: string) => posStore.set({ cat: id, catSource: "manual", highlightId: null, catalogFilter: null, search: "" });

  type Section = { label: string | null; items?: PosMenuItem[]; combos?: PosCombo[] };
  let sections: Section[];
  if (q) {
    const hit = (p: PosMenuItem) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    const items = catalog.menu.filter(hit);
    const combos = catalog.combos.filter((c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    sections = [{ label: null, items }, ...(combos.length ? [{ label: "Combos", combos }] : [])];
  } else if (filter) {
    const set = new Set(filter.ids);
    sections = [{ label: null, items: catalog.menu.filter((p) => set.has(p.id)) }];
  } else if (cat === COMBO_CAT) sections = [{ label: null, combos: catalog.combos }];
  else if (cat === FAV_CAT) {
    // Starred products first, then the best sellers that aren't starred.
    const mine = catalog.menu.filter((p) => p.fav);
    const starred = new Set(mine.map((p) => p.id));
    const top = catalog.top.filter((id) => !starred.has(id)).map((id) => catalog.byId[id]).filter(Boolean);
    sections = mine.length && top.length
      ? [{ label: "Tus favoritos", items: mine }, { label: "Más vendidos", items: top }]
      : [{ label: null, items: mine.length ? mine : top }];
  }
  else {
    const items = catalog.menu.filter((p) => p.catId === cat);
    const subs = [...new Set(items.map((p) => p.sub))];
    sections = subs.map((sub) => ({ label: subs.length > 1 && sub ? sub : null, items: items.filter((p) => p.sub === sub) }));
  }
  const empty = sections.every((sec) => !(sec.items?.length || sec.combos?.length));

  React.useEffect(() => {
    if (s.highlightId && hlRef.current && gridRef.current) {
      const g = gridRef.current, el = hlRef.current;
      g.scrollTop = Math.max(0, el.offsetTop - g.offsetTop - 16);
    }
  }, [s.highlightId, cat, filter]);

  const topSuggestion = !s.aiOpen ? s.suggestions[0] : undefined;

  // How many of each product are on the ticket — the tile badge of the narrow
  // layout, where the ticket itself is out of sight.
  const inTicket: Record<string, number> = {};
  for (const l of s.order) inTicket[l.id] = (inTicket[l.id] ?? 0) + l.qty;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.paper }}>
      {/* tabs */}
      <div className="pos-scroll" style={{ display: "flex", gap: 8, padding: "12px 16px 10px", overflowX: "auto", flexShrink: 0, borderBottom: `1px solid ${C.rule}` }}>
        {catalog.cats.map((c) => {
          const on = !filter && !q && cat === c.id;
          const iaOn = on && s.catSource === "ia";
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              flexShrink: 0, height: 44, padding: "0 18px", borderRadius: 22, cursor: "pointer", fontFamily: F.mono, fontSize: 13, fontWeight: 600, letterSpacing: ".02em",
              border: `1.5px solid ${on ? (iaOn ? C.red : C.ink) : C.rule}`, background: on ? (iaOn ? C.red : C.ink) : C.paperLt, color: on ? C.paperLt : C.ink,
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* assistant strip (drawer closed) */}
      {topSuggestion && <SuggestionStrip g={topSuggestion} more={s.suggestions.length - 1} />}

      {/* AI context banners */}
      {filter && !q && (
        <Banner onClose={() => posStore.set({ catalogFilter: null })} closeLabel="Ver todo">
          Filtrado por lo que pidió el cliente: <strong>{filter.label}</strong> · {filter.ids.length} opcion{filter.ids.length === 1 ? "" : "es"}
        </Banner>
      )}
      {!filter && !q && s.catSource === "ia" && (
        <Banner>
          El asistente abrió <strong>{catalog.catLabel[cat] ?? cat}</strong> porque lo pidió el cliente{s.highlightId ? " y dejó una opción lista 👇" : "."}
        </Banner>
      )}

      {/* grid */}
      <div ref={gridRef} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 16px 24px" }}>
        {catalog.menu.length === 0 && catalog.combos.length === 0 ? (
          <Empty>No hay productos en el catálogo todavía.<br />Créalos en Catálogo para venderlos aquí.</Empty>
        ) : empty ? (
          <Empty>{q ? <>Nada coincide con «{s.search.trim()}».</> : cat === FAV_CAT ? <>Aún no hay ventas recientes ni favoritos.<br />Los más vendidos aparecerán aquí; también puedes marcarlos con ★ en Catálogo.</> : <>Sin productos en esta categoría.</>}</Empty>
        ) : null}
        {sections.map((sec, si) => (
          <div key={si} style={{ marginTop: si === 0 ? 0 : 18 }}>
            {sec.label && <SubLabel icon={isColdLabel(sec.label) ? <SnowflakeIcon /> : isHotLabel(sec.label) ? <FlameIcon /> : null}>{sec.label}</SubLabel>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, alignContent: "start" }}>
              {sec.combos
                ? sec.combos.map((c) => <ComboTile key={c.id} c={c} qty={inTicket[c.id] ?? 0} hl={s.highlightId === c.id} hlRef={s.highlightId === c.id ? hlRef : undefined} />)
                : sec.items!.map((p) => <ProductTile key={p.id} p={p} qty={inTicket[p.id] ?? 0} accent={accentFor(catalog, p.catId)} hl={s.highlightId === p.id} hlRef={s.highlightId === p.id ? hlRef : undefined} />)}
            </div>
          </div>
        ))}
      </div>
      <CartBar />
    </div>
  );
}

/**
 * Narrow layout only (hidden by CSS otherwise): the ticket in one line —
 * how many items, what they are, the total — and the way into it.
 */
export function CartBar() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const count = s.order.reduce((n, l) => n + l.qty, 0);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const title = editing ? `Editando ${editing.folio}` : s.customerName.trim() || s.people.join(" · ") || "Pedido";
  // Newest line first: the end of a long summary is what gets cut off.
  const summary = [...s.order].reverse().map((l) => `${l.qty}× ${l.name}`).join(" · ");
  return (
    <div className="pos-cartbar">
      <button
        onClick={() => posStore.set({ ticketOpen: true })}
        aria-label={`Ver pedido · ${count} ítem${count === 1 ? "" : "s"} · ${posMoney(total)}`}
        style={{ width: "100%", height: 72, padding: "0 16px", display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", border: "none", borderTop: `1.5px solid ${C.ink}`, background: C.ink, color: C.paperLt, fontFamily: F.mono }}
      >
        <span key={count} className={"cmd-num" + (count ? " pos-bump" : "")} style={{ minWidth: 38, height: 38, padding: "0 8px", borderRadius: 19, background: count ? (editing ? C.red : C.paperLt) : "transparent", color: count ? (editing ? C.paperLt : C.ink) : C.paperLt, border: count ? "none" : "1.5px dashed rgba(244,236,220,.4)", fontSize: 16, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{count}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ display: "block", fontSize: 12, marginTop: 3, color: "rgba(244,236,220,.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {count ? summary : "Toca un producto para agregarlo · mantenlo presionado para ver su receta"}
          </span>
        </span>
        {count > 0 && <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{posMoney(total)}</span>}
        <span style={{ height: 44, padding: "0 14px", borderRadius: 4, background: count ? C.red : "transparent", border: count ? "none" : "1.5px solid rgba(244,236,220,.4)", color: C.paperLt, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>Ver pedido ▸</span>
      </button>
    </div>
  );
}

/** Narrow layout only: how many of this product are already on the ticket. */
export function TileQty({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span key={n} className="pos-tile-qty pos-bump cmd-num" aria-label={`${n} en el pedido`} style={{ position: "absolute", top: 6, right: 6, minWidth: 28, height: 28, padding: "0 7px", borderRadius: 14, background: C.ink, color: C.paperLt, fontSize: 13, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>×{n}</span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{children}</div>;
}

/** A cold section ("Frío", "Fríos") gets the snowflake so it reads at a glance; a hot one ("Caliente") the flame. */
export const isColdLabel = (label: string) => /^fr[ií]os?$/i.test(label.trim());
export const isHotLabel = (label: string) => /^calientes?$/i.test(label.trim());

/** Flame on the same ink chip as the snowflake, so the two sections pair up. */
export function FlameIcon() {
  return (
    <span aria-hidden style={{ width: 24, height: 24, borderRadius: 5, background: "#000", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5c.6 3.2 3.4 4.6 4.9 7.1A7 7 0 1 1 5.6 11c.4 1.4 1.3 2.4 2.5 2.9C7.4 10.3 9 6.4 12 2.5Z" fill="#FF8A3D" stroke="#FF8A3D" strokeWidth={1.2} />
        <path d="M12 21a3.4 3.4 0 0 1-3.4-3.4c0-2 1.9-3 3.4-5.6 1.5 2.6 3.4 3.6 3.4 5.6A3.4 3.4 0 0 1 12 21Z" fill="#FFD166" />
      </svg>
    </span>
  );
}

/** Snowflake on an ink chip — the pale blue needs the dark ground to read on paper. */
export function SnowflakeIcon() {
  const arm = "M256 176V50M190 80l66 45 66-45";
  return (
    <span aria-hidden style={{ width: 24, height: 24, borderRadius: 5, background: "#000", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 512 512" width={20} height={20} fill="none" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#7DBDFF">
          {[0, 60, 120, 180, 240, 300].map((deg) => <path key={deg} d={arm} transform={`rotate(${deg} 256 256)`} />)}
        </g>
        <path d="M256 196l52 30v60l-52 30-52-30v-60z" stroke="#6685A6" strokeWidth={34} />
      </svg>
    </span>
  );
}

export function SubLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted }}>
      {icon}
      <span>{children}</span>
      <span style={{ flex: 1, borderTop: `1px dashed ${C.rule}` }} />
    </div>
  );
}

export function Banner({ children, onClose, closeLabel }: { children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", border: `1px solid ${C.red}`, background: C.paperLt, borderRadius: 3 }}>
      <span style={{ width: 18, height: 18, borderRadius: 18, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>IA</span>
      <span style={{ flex: 1, fontSize: 11.5, color: C.ink2, lineHeight: 1.4 }}>{children}</span>
      {onClose && (
        <button onClick={onClose} style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.red, border: `1px solid ${C.red}`, background: "transparent", padding: "5px 9px", borderRadius: 2, cursor: "pointer", flexShrink: 0 }}>
          {closeLabel} ✕
        </button>
      )}
    </div>
  );
}

/** How long a finger has to rest on a tile before it shows the recipe instead of adding. */
export const LONG_PRESS_MS = 350;

/**
 * Tap = add to the ticket. Hold (or right-click) = open the recipe sheet.
 * The hold arms a timer on pointer down and disarms it on up / leave /
 * cancel; when it fires, the click that follows the release is swallowed.
 */
export function useLongPress(onLong: () => void) {
  const timer = React.useRef<number | null>(null);
  const fired = React.useRef(false);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => { fired.current = true; timer.current = null; onLong(); }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLong(); },
    /** Wrap the click handler so a completed hold doesn't also add. */
    guard: (fn: () => void) => () => { if (fired.current) { fired.current = false; return; } fn(); },
  };
}

export function ProductTile({ p, qty, accent, hl, hlRef }: { p: PosMenuItem; qty: number; accent: string; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  const out = p.stock === "sin";
  const hold = useLongPress(() => showRecipe(p.id));
  return (
    <button ref={hlRef} disabled={out} onClick={hold.guard(() => tapItem(p.id))} onPointerDown={hold.onPointerDown} onPointerUp={hold.onPointerUp} onPointerLeave={hold.onPointerLeave} onPointerCancel={hold.onPointerCancel} onContextMenu={hold.onContextMenu} className={"pos-tile" + (hl ? " pos-hl" : "")} title={p.desc || p.name} style={{
      textAlign: "left", padding: "12px 12px 10px", borderRadius: 6, cursor: out ? "not-allowed" : "pointer", minHeight: 112, position: "relative", overflow: "hidden",
      border: `1.5px solid ${hl ? C.red : C.rule}`, background: hl ? C.paperLt : out ? C.paperDk : C.paperLt, opacity: out ? 0.55 : 1, display: "flex", flexDirection: "column",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: hl ? C.red : accent, opacity: 0.85 }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: C.ink, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</span>
        {p.mods.length > 0 && !out && <span title="Con opciones" style={{ fontSize: 10, color: C.muted, flexShrink: 0, marginTop: 2 }}>▾</span>}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, paddingLeft: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span className="cmd-num" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{posMoney(p.price)}</span>
        {out ? <Stamp size={9} rotate={-6}>Agotado</Stamp>
          : hl ? <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: C.paperLt, background: C.red, padding: "3px 7px", borderRadius: 2 }}>★ SUGERIDO</span>
          : p.stock === "bajo" ? <span style={{ fontSize: 9, letterSpacing: ".08em", color: C.amber }}>● bajo</span>
          : null}
      </div>
      <TileQty n={qty} />
    </button>
  );
}

export function ComboTile({ c, qty, hl, hlRef }: { c: PosCombo; qty: number; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={hlRef} onClick={() => addCombo(c.id)} className={"pos-tile" + (hl ? " pos-hl" : "")} style={{
      textAlign: "left", padding: "12px 14px 10px", borderRadius: 6, cursor: "pointer", gridColumn: "span 2", minHeight: 112, position: "relative", overflow: "hidden",
      border: `1.5px solid ${hl ? C.red : C.green}`, background: C.paperLt, display: "flex", flexDirection: "column",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: hl ? C.red : C.green }} />
      <div style={{ paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: C.green, border: `1px solid ${C.green}`, padding: "1px 5px", borderRadius: 2 }}>COMBO</span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.35 }}>{c.desc}</div>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, paddingLeft: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{posMoney(c.price)}</span>
        {c.saving > 0 && <span style={{ fontSize: 10, color: C.green, letterSpacing: ".04em" }}>AHORRA {posMoney(c.saving)}</span>}
      </div>
      <TileQty n={qty} />
    </button>
  );
}

/** Slim strip showing the assistant's top suggestion while the drawer is closed. */
export function SuggestionStrip({ g, more }: { g: SuggestionCardState; more: number }) {
  const col = KIND_COLOR[g.kind] || KIND_COLOR.pedido;
  const accent = col.line === C.paperLt ? C.ink : col.line;
  return (
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 12px", border: `1px solid ${C.rule}`, borderLeft: `4px solid ${accent}`, background: C.paperLt, borderRadius: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 2, flexShrink: 0 }}>{POS_KIND_LABEL[g.kind] || "Idea"}</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
      {g.actionLabel && g.act && (
        <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{ height: 32, padding: "0 12px", borderRadius: 3, border: "none", background: C.ink, color: C.paperLt, fontFamily: F.mono, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.actionLabel}</button>
      )}
      <button onClick={() => posStore.set({ aiOpen: true })} style={{ height: 32, padding: "0 10px", borderRadius: 3, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontFamily: F.mono, fontSize: 10.5, cursor: "pointer", flexShrink: 0 }}>
        {more > 0 ? `+${more} más` : "Ver"}
      </button>
      <button onClick={() => dismissSuggestion(g.uid, false)} aria-label="Descartar" style={{ width: "var(--pos-x)", height: "var(--pos-x)", border: "none", background: "transparent", color: C.muted, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
    </div>
  );
}
