"use client";

/**
 * Venta.dc.html — the catalog side of the sale: categories + search
 * (.cats), product tiles (.grid), combos (.combos) and the strip of open
 * orders (.pending). Below 1024 px the cart bar (.cartbar) stands in for
 * the ticket.
 */
import * as React from "react";
import { FAV_CAT, COMBO_CAT, type PosCatalog, type PosMenuItem, type PosCombo, type PosOrder } from "@/lib/pos/types";
import { useCatalog, usePos, posStore, orderTotal, tapItem, showRecipe, addCombo, applyAct, dismissSuggestion, startTender, savePending, openOrdenes, marcarEntregada, queuedOrders, type SuggestionCardState } from "../pos-store";
import { money, qtyOnTicket, useNow } from "./ticket";
import { filtrarTemp, temperaturaDe, type FiltroTemp } from "@/lib/pos/temperatura";

/** How many products Favoritos shows (6 × 2 on the 1280 × 800 tablet). */
const FAV_MAX = 12;

/** Favoritos: the starred products first, then the best sellers of the last 30 days. */
export function favoritos(catalog: PosCatalog): PosMenuItem[] {
  const seen = new Set<string>();
  const out: PosMenuItem[] = [];
  const push = (p: PosMenuItem | undefined) => {
    if (!p || seen.has(p.id) || out.length >= FAV_MAX) return;
    seen.add(p.id);
    out.push(p);
  };
  catalog.menu.filter((p) => p.fav).forEach(push);
  catalog.top.forEach((id) => push(catalog.byId[id]));
  return out;
}

export function Catalog() {
  const s = usePos();
  const catalog = useCatalog();
  const cat = s.cat || FAV_CAT;
  const filter = s.catalogFilter;
  const q = s.search.trim().toLowerCase();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const setCat = (id: string) => {
    posStore.set({ cat: id, catSource: "manual", highlightId: null, catalogFilter: null, search: "" });
    gridRef.current?.scrollTo({ top: 0 });
  };

  let items: PosMenuItem[] = [];
  let combos: PosCombo[] = [];
  if (q) {
    items = catalog.menu.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q));
    combos = catalog.combos.filter((c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  } else if (filter) {
    const set = new Set(filter.ids);
    items = catalog.menu.filter((p) => set.has(p.id));
  } else if (cat === COMBO_CAT) combos = catalog.combos;
  else if (cat === FAV_CAT) items = favoritos(catalog);
  else items = catalog.menu.filter((p) => p.catId === cat);
  // «Caliente / Frío»: on Favoritos it opens up to every product of that
  // temperature (favorites first); inside a category or a search it narrows.
  const temp = s.temp;
  if (temp !== "todo") {
    if (!q && !filter && cat === FAV_CAT) {
      const favs = filtrarTemp(items, temp);
      const seen = new Set(favs.map((p) => p.id));
      items = [...favs, ...filtrarTemp(catalog.menu, temp).filter((p) => !seen.has(p.id))];
    } else items = filtrarTemp(items, temp);
    combos = [];
  }

  const inTicket = qtyOnTicket(s.order);
  const label = (temp !== "todo" ? (temp === "frio" ? "Fríos · " : "Calientes · ") : "") + (q ? "Resultados" : filter ? filter.label : catalog.catLabel[cat] ?? (cat === FAV_CAT ? "Favoritos" : cat));
  const setTemp = (t: FiltroTemp) => { posStore.set({ temp: t, highlightId: null }); gridRef.current?.scrollTo({ top: 0 }); };
  const topSuggestion = !s.aiOpen ? s.suggestions[0] : undefined;
  const nothing = items.length === 0 && combos.length === 0;

  // The assistant may point at a product: bring its tile into view.
  React.useEffect(() => {
    if (!s.highlightId || !gridRef.current) return;
    gridRef.current.querySelector<HTMLElement>(`[data-id="${CSS.escape(s.highlightId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [s.highlightId, cat, filter]);

  return (
    <section className="catalog" aria-label="Productos">
      <div className="cats" role="group" aria-label="Categorías">
        <div className="temp" role="group" aria-label="Temperatura">
          <button type="button" aria-pressed={temp === "todo"} onClick={() => setTemp("todo")}>Todo</button>
          <button type="button" className="hot" aria-pressed={temp === "caliente"} onClick={() => setTemp(temp === "caliente" ? "todo" : "caliente")}><TempIcon t="caliente" size={20} />Caliente</button>
          <button type="button" className="cold" aria-pressed={temp === "frio"} onClick={() => setTemp(temp === "frio" ? "todo" : "frio")}><TempIcon t="frio" size={20} />Frío</button>
        </div>
        {catalog.cats.map((c) => (
          <button key={c.id} type="button" className="cat" aria-pressed={!filter && !q && cat === c.id} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {topSuggestion && <SuggestionStrip g={topSuggestion} more={s.suggestions.length - 1} />}
      {filter && !q && (
        <div className="say" style={{ alignItems: "center", padding: "10px 14px" }}>
          <p className="grow" style={{ fontSize: 15 }}>{filter.intro ?? "Lo que pidió el cliente:"} <b>{filter.label}</b> · {filter.ids.length} opci{filter.ids.length === 1 ? "ón" : "ones"}</p>
          <button type="button" className="btn ghost sm" style={{ height: 44 }} onClick={() => posStore.set({ catalogFilter: null })}>Ver todo</button>
        </div>
      )}

      {/* The wrapper is a size container: rows are measured against ITS height
          (2 rows fill it), so every category gets the same tile size. */}
      <div className="grid-wrap">
      <div ref={gridRef} className="grid" role="group" aria-label={label}>
        {nothing && (
          <div className="empty" style={{ gridColumn: "1 / -1", gridRow: "1 / -1" }}>
            {catalog.menu.length === 0 && catalog.combos.length === 0
              ? <span>No hay productos en el catálogo todavía. Créalos en Catálogo para venderlos aquí.</span>
              : q ? <span>Nada coincide con «{s.search.trim()}».</span>
              : cat === FAV_CAT ? <span>Aún no hay ventas recientes ni favoritos. Los más vendidos aparecerán aquí.</span>
              : <span>Sin productos en esta categoría.</span>}
          </div>
        )}
        {items.map((p) => <ProductTile key={p.id} p={p} qty={inTicket[p.id] ?? 0} hl={s.highlightId === p.id} />)}
        {combos.map((c) => <ComboTile key={c.id} c={c} qty={inTicket[c.id] ?? 0} />)}
      </div>
      </div>

      <CombosRow />
      <PendingStrip />
    </section>
  );
}

/** How long a finger has to rest on a tile before it shows the recipe instead of adding. */
export const LONG_PRESS_MS = 350;

/**
 * Tap = add to the ticket. Hold (or right-click) = open the recipe.
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

/** Snowflake (frío) or steaming cup (caliente), drawn in the current color. */
function TempIcon({ t, size }: { t: "caliente" | "frio"; size: number }) {
  return t === "frio"
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" /></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 9h12v4a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H16.5" /><path d="M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5" /></svg>;
}

/**
 * The picture of a tile (VentaFotos.dc.html): the product photo when it has
 * one (with a hot/cold badge), else the drawing of what it is — a cup on
 * amber (caliente), a glass with ice or a bottle on blue (frío), a plate (food).
 */
function TileArt({ p }: { p: PosMenuItem }) {
  const t = temperaturaDe(p);
  if (p.image) {
    return (
      <span className="timg">
        {/* eslint-disable-next-line @next/next/no-img-element -- product photos are already sized by the catalog upload */}
        <img src={p.image} alt="" loading="lazy" decoding="async" />
        {t && <span className={"tbadge " + (t === "frio" ? "cold" : "hot")}><TempIcon t={t} size={16} /></span>}
      </span>
    );
  }
  const bottle = /envasad|kombucha/i.test(p.sub);
  return (
    <span className={"timg " + (t === "frio" ? "cold" : t === "caliente" ? "hot" : "food")}>
      {t === "caliente"
        ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 9h12v4a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H16.5" /><path d="M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5" /></svg>
        : t === "frio" && bottle
          ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3h8v3l1.5 2.5V20a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8.5L8 6z" /><path d="M6.5 12h11" /></svg>
          : t === "frio"
            ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z" /><path d="M6.6 9h10.8" /><rect x="9" y="11.5" width="3" height="3" rx="0.6" /><rect x="12.5" y="14" width="3" height="3" rx="0.6" /></svg>
            : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 15h18" /><path d="M5 15a7 7 0 0 1 14 0" /><path d="M12 6V4" /></svg>}
    </span>
  );
}

function ProductTile({ p, qty, hl }: { p: PosMenuItem; qty: number; hl: boolean }) {
  const out = p.stock === "sin";
  const hold = useLongPress(() => showRecipe(p.id));
  return (
    <button
      type="button"
      data-id={p.id}
      className={"tile" + (out ? " off" : "") + (hl ? " hl" : "")}
      disabled={out}
      aria-disabled={out || undefined}
      onClick={hold.guard(() => tapItem(p.id))}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerLeave={hold.onPointerLeave}
      onPointerCancel={hold.onPointerCancel}
      onContextMenu={hold.onContextMenu}
      aria-label={`${p.name}, ${money(p.price)}${out ? ", agotado" : ""}${qty ? `, ${qty} en el pedido` : ""}`}
    >
      <TileArt p={p} />
      <span className="txt">
        <span className="n">{p.name}</span>
        {out ? <span className="tag">Agotado</span> : <span className="p">{money(p.price)}</span>}
      </span>
      {qty > 0 && <span className="qty" aria-hidden>{qty}</span>}
    </button>
  );
}

function ComboTile({ c, qty }: { c: PosCombo; qty: number }) {
  return (
    <button type="button" data-id={c.id} className="tile combo-tile" onClick={() => addCombo(c.id)} aria-label={`Combo ${c.name}, ${money(c.price)}`}>
      <span className="n">{c.name}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="p">{money(c.price)}</span>
        {c.saving > 0 && <span className="save">−{money(c.saving)}</span>}
      </span>
      {qty > 0 && <span className="qty" aria-hidden>{qty}</span>}
    </button>
  );
}

/** Three combos under the grid; the real saving from the catalog. Only combos whose products are all in stock. */
function CombosRow() {
  const catalog = useCatalog();
  const list = catalog.combos.filter((c) => c.items.every((id) => catalog.byId[id]?.stock !== "sin")).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="combos" role="group" aria-label="Combos">
      {list.map((c) => (
        <button key={c.id} type="button" className="combo" onClick={() => addCombo(c.id)}>
          <span className="grow">
            <span className="n" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            {c.saving > 0 && <span className="save">Ahorro en combos · {money(c.saving)}</span>}
          </span>
          <span className="p">{money(c.price)}</span>
        </button>
      ))}
    </div>
  );
}

/** «Cappuccino ×2 · Pastel de pollo». */
function itemsSummary(o: PosOrder): string {
  const by = new Map<string, number>();
  for (const it of o.items) by.set(it.name, (by.get(it.name) ?? 0) + it.qty);
  return [...by].map(([n, q]) => (q > 1 ? `${n} ×${q}` : n)).join(" · ");
}

const LATE_MIN = 10;
/** «6 min», «2 h», «3 d». */
const age = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`);

/** Up to 3 open orders (oldest first) under the catalog; tap → Pedidos. */
function PendingStrip() {
  const s = usePos();
  const now = useNow();
  const all = [...queuedOrders(s), ...s.pendientes]
    .filter((o) => o.status !== "cancelada")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!all.length) return null;
  const shown = all.slice(0, 3);
  return (
    <div className="pending" aria-label="Pedidos pendientes">
      {shown.map((o) => {
        const who = o.customerName.trim() || o.customerNames[0] || "";
        const paid = o.status === "pagada";
        const mins = now ? Math.max(0, Math.floor((now - Date.parse(o.createdAt)) / 60_000)) : null;
        const folio = o.folio === "…" ? "En cola" : `#${o.folio}`;
        return (
          <div key={o.id} className="ocard">
            <button type="button" className="ocard-main" onClick={() => openOrdenes("pendiente")} aria-label={`Pedido ${folio}${who ? ` de ${who}` : ""}. Ver pedidos`}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="on">{folio}{who ? ` · ${who}` : ""}</span>
                <span className="oi" style={{ display: "block" }}>{itemsSummary(o)}</span>
              </span>
              {paid ? <span className="pill ok">Pagado</span>
                : o.porVerificar ? <span className="pill late">Transferencia por verificar</span>
                : <span className="pill brand">Sin pagar</span>}
              {mins !== null && <span className={"age" + (mins > LATE_MIN ? " late" : "")}>{age(mins)}</span>}
            </button>
            {paid && !o.local && (
              <button type="button" className={"check" + (o.entregadaAt ? " done" : "")} aria-label={o.entregadaAt ? "Entregado. Deshacer" : "Marcar entregado"} aria-pressed={!!o.entregadaAt} onClick={() => void marcarEntregada(o.id, !o.entregadaAt)} style={{ width: 44, height: 44 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="ocard more reg-only" onClick={() => openOrdenes("pendiente")}>
        Ver los {all.length} pendientes →
      </button>
    </div>
  );
}

/**
 * Below 1024 px (hidden by CSS otherwise): the ticket in one bar — count,
 * «Pa' Juan · items», «Prepara X», total — the way into the slide-over,
 * plus Efectivo and Transferencia.
 */
export function CartBar() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const count = s.order.reduce((n, l) => n + l.qty, 0);
  const editing = s.pending?.mode === "edit" ? s.pending : null;
  const canPay = count > 0 && !s.sending && !s.order.some((l) => l.missing);
  const who = s.people[0];
  const names = [...new Set(s.order.map((l) => l.name))].join(", ");
  const title = editing ? `Pedido #${editing.folio}` : count ? `${who ? `Pa' ${who} · ` : ""}${names}` : "Pedido nuevo";
  return (
    <div className="cartbar" aria-label="Pedido actual">
      <button type="button" className="cb-open" aria-expanded={s.ticketOpen} aria-label="Ver el pedido" onClick={() => posStore.set({ ticketOpen: true })}>
        <span className={"cb-n" + (count ? "" : " none")}>{count}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="cb-t">{title}</span>
          <span className="muted cb-s">
            {count ? "Toca para ver o editar" : "Toca un producto · mantenlo para ver la receta"}
          </span>
        </span>
        <span className="total"><span className="v">{money(total)}</span></span>
        <svg className="cb-up" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
      </button>
      {count > 0 && (
        <div className="pay2">
          <button type="button" className="btn lg" disabled={!canPay} onClick={() => startTender("efectivo")}>Pagar</button>
          <button type="button" className="btn ghost lg" disabled={!canPay} onClick={() => void savePending()}>Pagar después</button>
        </div>
      )}
    </div>
  );
}

/** Slim strip with the assistant's top suggestion while its drawer is closed. */
function SuggestionStrip({ g, more }: { g: SuggestionCardState; more: number }) {
  return (
    <div className="say" style={{ alignItems: "center", padding: "8px 10px 8px 14px" }}>
      <p className="grow" style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</p>
      {g.actionLabel && g.act && (
        <button type="button" className="btn sm" style={{ height: 44 }} onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }}>{g.actionLabel}</button>
      )}
      <button type="button" className="btn ghost sm" style={{ height: 44 }} onClick={() => posStore.set({ aiOpen: true })}>{more > 0 ? `+${more} más` : "Ver"}</button>
      <button type="button" className="btn ghost sm" style={{ height: 44, padding: "0 14px" }} aria-label="Descartar" onClick={() => dismissSuggestion(g.uid, false)}>×</button>
    </div>
  );
}
