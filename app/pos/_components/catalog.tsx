"use client";

import * as React from "react";
import { ChevronDown, Star } from "lucide-react";
import { posMoney, POS_KIND_LABEL, FAV_CAT, COMBO_CAT, type PosCatalog, type PosMenuItem, type PosCombo } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, orderTotal, tapItem, showRecipe, addCombo, applyAct, dismissSuggestion, startTender, payNow, type SuggestionCardState } from "../pos-store";
import { confirmarSinImpresora } from "./ticket";
import { C, F, H, TILE_ACCENTS } from "./theme";
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
      <div className="pos-scroll pos-cats" role="group" aria-label="Categorías">
        {catalog.cats.map((c) => {
          const on = !filter && !q && cat === c.id;
          const iaOn = on && s.catSource === "ia";
          return (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={on} className={"pos-cat" + (iaOn ? " ia" : "")}>
              {c.id === FAV_CAT && <Star size={16} aria-hidden fill="currentColor" />}
              {c.label}
            </button>
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
      <div ref={gridRef} className="pos-scroll pos-gridwrap">
        {catalog.menu.length === 0 && catalog.combos.length === 0 ? (
          <Empty>No hay productos en el catálogo todavía.<br />Créalos en Catálogo para venderlos aquí.</Empty>
        ) : empty ? (
          <Empty>{q ? <>Nada coincide con «{s.search.trim()}».</> : cat === FAV_CAT ? <>Aún no hay ventas recientes ni favoritos.<br />Los más vendidos aparecerán aquí; también puedes marcarlos con ★ en Catálogo.</> : <>Sin productos en esta categoría.</>}</Empty>
        ) : null}
        {sections.map((sec, si) => (
          <div key={si} style={{ marginTop: si === 0 ? 0 : 18 }}>
            {sec.label && <SubLabel icon={isColdLabel(sec.label) ? <SnowflakeIcon /> : isHotLabel(sec.label) ? <FlameIcon /> : null}>{sec.label}</SubLabel>}
            <div className="pos-grid">
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
  const canPay = count > 0 && !editing && !s.sending && !s.order.some((l) => l.missing);
  return (
    <div className="pos-cartbar" style={{ borderTop: `1px solid ${C.rule}`, background: C.paperLt, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
        <button
          type="button"
          onClick={() => posStore.set({ ticketOpen: true })}
          aria-label={`Ver pedido · ${count} ítem${count === 1 ? "" : "s"} · ${posMoney(total)}`}
          style={{ flex: 1, minWidth: 0, minHeight: 64, padding: "0 12px", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", border: `1px solid ${C.rule}`, borderRadius: 14, background: C.paperDk, color: C.ink }}
        >
          <span key={count} className={"cmd-num" + (count ? " pos-bump" : "")} style={{ minWidth: 36, height: 36, padding: "0 8px", borderRadius: 18, background: count ? (editing ? C.red : C.strong) : "transparent", color: count ? C.onStrong : C.muted, border: count ? "none" : `1.5px dashed ${C.rule}`, fontSize: 16, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{count}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {count > 0 ? (
              <>
                <span className="cmd-num" style={{ ...H, display: "block", fontSize: 19 }}>{posMoney(total)}</span>
                <span style={{ display: "block", fontSize: 13, marginTop: 1, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {editing ? title : <>Ver pedido<span className="pos-hide-phone"> · {summary}</span></>}
                </span>
              </>
            ) : (
              <span style={{ display: "block", fontSize: 14, color: C.muted, lineHeight: 1.35 }}>Toca un producto · mantenlo para ver la receta</span>
            )}
          </span>
        </button>
        {count > 0 && !editing && (
          <>
            <button type="button" className="pos-paybtn cash" disabled={!canPay} onClick={() => { if (confirmarSinImpresora()) startTender("efectivo"); }} style={{ height: "auto", minHeight: 64, padding: "0 12px", fontSize: 16 }}>Efectivo</button>
            <button type="button" className="pos-paybtn transfer" disabled={!canPay} onClick={() => { if (confirmarSinImpresora()) payNow("transferencia"); }} style={{ height: "auto", minHeight: 64, padding: "0 12px", fontSize: 16 }}>Transf.</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Narrow layout only: how many of this product are already on the ticket. */
export function TileQty({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span key={n} className="pos-tile-qty pos-bump cmd-num" aria-label={`${n} en el pedido`} style={{ position: "absolute", top: 6, right: 6, minWidth: 28, height: 28, padding: "0 7px", borderRadius: 14, background: C.strong, color: C.onStrong, fontSize: 14, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>×{n}</span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 15, lineHeight: 1.7 }}>{children}</div>;
}

/** A cold section ("Frío", "Fríos") gets the snowflake so it reads at a glance; a hot one ("Caliente") the flame. */
export const isColdLabel = (label: string) => /^fr[ií]os?$/i.test(label.trim());
export const isHotLabel = (label: string) => /^calientes?$/i.test(label.trim());

/** Flame on the same ink chip as the snowflake, so the two sections pair up. */
export function FlameIcon() {
  return (
    <span aria-hidden style={{ width: 24, height: 24, borderRadius: 10, background: "#000", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
    <span aria-hidden style={{ width: 24, height: 24, borderRadius: 10, background: "#000", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 8px", fontSize: 12, fontWeight: 600, color: C.muted }}>
      {icon}
      <span>{children}</span>
      <span style={{ flex: 1, borderTop: `1px dashed ${C.rule}` }} />
    </div>
  );
}

export function Banner({ children, onClose, closeLabel }: { children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", border: `1px solid ${C.brand}`, background: C.brandSoft, borderRadius: 12 }}>
      <span style={{ width: 22, height: 22, borderRadius: 22, background: C.brand, color: C.onBrand, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>IA</span>
      <span style={{ flex: 1, fontSize: 13, color: C.ink2, lineHeight: 1.4 }}>{children}</span>
      {onClose && (
        <button onClick={onClose} style={{ fontSize: 12, fontWeight: 700, color: C.ink, border: `1px solid ${C.rule}`, background: C.paperLt, padding: "0 12px", height: 36, borderRadius: 10, cursor: "pointer", flexShrink: 0 }}>
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
    <button ref={hlRef} type="button" disabled={out} onClick={hold.guard(() => tapItem(p.id))} onPointerDown={hold.onPointerDown} onPointerUp={hold.onPointerUp} onPointerLeave={hold.onPointerLeave} onPointerCancel={hold.onPointerCancel} onContextMenu={hold.onContextMenu} className={"pos-tile" + (hl ? " pos-hl" : "") + (qty > 0 ? " has-qty" : "")} title={p.desc || p.name} aria-label={`${p.name}, ${posMoney(p.price)}${out ? ", agotado" : ""}`} style={{
      textAlign: "left", cursor: out ? "not-allowed" : "pointer", position: "relative", overflow: "hidden",
      border: `1px solid ${hl ? C.brand : qty > 0 ? C.ink : C.rule}`, background: out ? C.paperDk : C.paperLt, color: C.ink, opacity: out ? 0.55 : 1, display: "flex", flexDirection: "column",
      boxShadow: qty > 0 ? `inset 0 0 0 1px ${C.ink}` : "var(--shadow-1)",
    }}>
      <span className="pos-tile-name" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</span>
      <span style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: accent, flexShrink: 0 }} />
          <span className="cmd-num pos-tile-price">{posMoney(p.price)}</span>
        </span>
        {out ? <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>Agotado</span>
          : hl ? <span style={{ fontSize: 12, fontWeight: 700, color: C.onBrand, background: C.brand, padding: "2px 8px", borderRadius: 999 }}>Sugerido</span>
          : p.stock === "bajo" ? <span style={{ fontSize: 12, fontWeight: 600, color: C.amber }}>Poco</span>
          : p.mods.length > 0 ? <ChevronDown size={16} aria-label="Con opciones" style={{ color: C.muted, flexShrink: 0 }} />
          : null}
      </span>
      <TileQty n={qty} />
    </button>
  );
}

export function ComboTile({ c, qty, hl, hlRef }: { c: PosCombo; qty: number; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={hlRef} onClick={() => addCombo(c.id)} className={"pos-tile" + (hl ? " pos-hl" : "")} style={{
      textAlign: "left", cursor: "pointer", gridColumn: "span 2", position: "relative", overflow: "hidden",
      border: `1px solid ${hl ? C.brand : C.rule}`, background: C.paperLt, color: C.ink, display: "flex", flexDirection: "column",
    }}>
      <div style={{ paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "2px 8px", borderRadius: 999 }}>Combo</span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.35 }}>{c.desc}</div>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, paddingLeft: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="cmd-num" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{posMoney(c.price)}</span>
        {c.saving > 0 && <span style={{ fontSize: 12, color: C.green }}>Ahorra {posMoney(c.saving)}</span>}
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
    <div className="pos-card" style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 12px", border: `1px solid ${C.rule}`, borderLeft: `4px solid ${accent}`, background: C.paperLt, borderRadius: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 10, flexShrink: 0 }}>{POS_KIND_LABEL[g.kind] || "Idea"}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
      {g.actionLabel && g.act && (
        <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "none", background: C.ink, color: C.paperLt, fontFamily: F.mono, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.actionLabel}</button>
      )}
      <button onClick={() => posStore.set({ aiOpen: true })} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontFamily: F.mono, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
        {more > 0 ? `+${more} más` : "Ver"}
      </button>
      <button onClick={() => dismissSuggestion(g.uid, false)} aria-label="Descartar" style={{ width: "var(--pos-x)", height: "var(--pos-x)", border: "none", background: "transparent", color: C.muted, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
    </div>
  );
}
