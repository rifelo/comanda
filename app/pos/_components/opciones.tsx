"use client";

/**
 * Opciones.dc.html — /pos/item/<id> (add) and /pos/item/<id>?linea=<n> (edit
 * a ticket line).
 *
 * Left: the product's modifier groups (required → radios with the default
 * picked; optional → checkboxes), «Nota para la barra», quantity and the
 * live-priced «Agregar al pedido». Right: «Recomiéndale», all from data
 * (lib/pos/recomendaciones.ts) — what to say, what sells with it, combos,
 * what to sell off today, and what's left in its category.
 *
 * Lines carry no note of their own: the note goes into the order note as
 * «<Producto>: <nota>» (one line each); editing a line edits that line of
 * the note instead of adding another.
 */
import * as React from "react";
import type { ModSelection, PosModGroup } from "@/lib/pos/types";
import { recomendacionesFor, disponibilidadDe } from "@/lib/pos/recomendaciones";
import { useCatalog, usePos, posStore, modLinePrice, posDefaultMods, addItem, addCombo, addLineWithMods, replaceLine, removeLine } from "../pos-store";
import { RecetaSheet } from "./sheets";
import { CheckIcon, FlowHeader, listaY, money } from "./pay-common";

const NOTE_MAX = 500;

/** The order-note line «<name>: …» for a product, if any. */
function noteLineIndex(lines: string[], name: string): number {
  const head = `${name}: `;
  return lines.findIndex((l) => l.startsWith(head));
}
function withProductNote(note: string, name: string, text: string, replace: boolean): string {
  const lines = note.split("\n").filter((l) => l.trim() !== "");
  if (replace) {
    const i = noteLineIndex(lines, name);
    if (i >= 0) lines.splice(i, 1);
  }
  const t = text.trim().replace(/\s*\n\s*/g, " ");
  if (t) lines.push(`${name}: ${t}`);
  return lines.join("\n").slice(0, NOTE_MAX);
}

export function OpcionesPage() {
  const s = usePos();
  const catalog = useCatalog();
  const sheet = s.sheet as { mode: "add"; productId: string } | { mode: "edit"; idx: number };
  const edit = sheet.mode === "edit";
  const line = edit ? s.order[sheet.idx] : undefined;
  const productId = sheet.mode === "add" ? sheet.productId : line?.id;
  const p = productId ? catalog.byId[productId] : undefined;
  const combo = line?.kind === "combo" ? catalog.comboById[line.id] ?? null : null;
  const name = p?.name ?? line?.name ?? "";

  const [mods, setMods] = React.useState<ModSelection>(() => (line?.mods ? { ...line.mods } : p ? posDefaultMods(p, catalog) : {}));
  const [qty, setQty] = React.useState(line?.qty ?? 1);
  const [nota, setNota] = React.useState(() => {
    if (!edit || !name) return "";
    const lines = s.note.split("\n");
    const i = noteLineIndex(lines, name);
    return i >= 0 ? lines[i].slice(name.length + 2) : "";
  });
  const [receta, setReceta] = React.useState(false);
  const close = () => posStore.set({ sheet: null });

  const gone = !p && !(line && line.kind === "combo");
  React.useEffect(() => {
    if (gone) close();
  }, [gone]);

  // Escape closes the recipe first (the root handler would close the whole page).
  React.useEffect(() => {
    if (!receta) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setReceta(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [receta]);

  if (gone) return null;

  const groups = (p?.mods ?? []).map((gid) => catalog.modGroups[gid]).filter((g): g is PosModGroup => !!g);
  const missing = groups.filter((g) => g.required && g.type === "single" && !mods[g.id]);
  const unit = line?.kind === "combo"
    ? modLinePrice(line, catalog)
    : modLinePrice({ id: p!.id, name: p!.name, qty: 1, kind: "item", basePrice: p!.price, mods }, catalog);
  const minPrice = p ? p.price + groups.reduce((sum, g) => sum + (g.required && g.type === "single" ? Math.min(...g.options.map((o) => o.delta), 0) : 0), 0) : unit;

  const commit = () => {
    if (missing.length) return;
    const nextNote = name && (nota.trim() || edit) ? withProductNote(s.note, name, nota, edit) : s.note;
    if (nextNote !== s.note) posStore.set({ note: nextNote });
    if (edit) replaceLine(sheet.idx, line?.kind === "combo" ? line.mods ?? {} : mods, qty);
    else addLineWithMods(p!.id, mods, qty);
  };
  const quitar = () => {
    if (!edit) return;
    // The line's note goes with it (unless a twin of the product stays on the ticket).
    const twin = s.order.some((l, k) => k !== sheet.idx && l.id === line?.id);
    if (!twin && name) {
      const next = withProductNote(s.note, name, "", true);
      if (next !== s.note) posStore.set({ note: next });
    }
    removeLine(sheet.idx);
  };

  const who = (edit ? line?.customer : s.activePerson) || s.customerName.trim();
  const subtitle = [
    p ? catalog.catLabel[p.catId] || p.sub : combo ? "Combo" : null,
    p?.desc || combo?.desc || null,
    groups.length ? `desde ${money(minPrice)}` : money(unit),
    s.pending?.folio ? `pedido #${s.pending.folio}` : null,
    who ? `Pa' ${who}` : null,
  ].filter(Boolean).join(" · ");

  const pick = (g: PosModGroup, optName: string) => setMods((m) => {
    if (g.type === "single") return { ...m, [g.id]: m[g.id] === optName && !g.required ? null : optName };
    const cur = Array.isArray(m[g.id]) ? (m[g.id] as string[]) : [];
    return { ...m, [g.id]: cur.includes(optName) ? cur.filter((x) => x !== optName) : [...cur, optName] };
  });

  const goLabel = missing.length
    ? `Elige ${missing[0].name.toLowerCase()}`
    : edit
      ? "Guardar cambios"
      : "Agregar al pedido";

  return (
    <>
      <FlowHeader back={close} backLabel={edit ? "Volver sin cambiar" : "Volver sin agregar"} title={name} subtitle={subtitle}>
        {p && <button type="button" className="btn ghost sm flow-alt" onClick={() => setReceta(true)}>Ver receta</button>}
      </FlowHeader>

      <div className="body opc-body">
        <section className="opc-main scroll" aria-label="Opciones">
          {groups.map((g) => {
            const sel = g.type === "single" ? (mods[g.id] as string | null | undefined) : (Array.isArray(mods[g.id]) ? (mods[g.id] as string[]) : []);
            const radio = g.type === "single";
            const cols = Math.min(g.options.length, radio && g.options.length <= 2 ? 2 : 3);
            return (
              <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <h2 className="h2">{g.name}</h2>
                  {g.required
                    ? <span className={`pill ${missing.includes(g) ? "late" : "brand"}`}>{radio ? "Obligatorio · elige 1" : "Obligatorio"}</span>
                    : <span className="muted" style={{ fontSize: 14 }}>{radio ? "Opcional · elige 1" : "Opcional"}</span>}
                </div>
                <div role={radio ? "radiogroup" : "group"} aria-label={g.name} className="opc-grid" style={{ "--cols": cols } as React.CSSProperties}>
                  {g.options.map((o) => {
                    const on = radio ? sel === o.name : (sel as string[]).includes(o.name);
                    return (
                      <button key={o.name} className="opt lg" type="button" role={radio ? "radio" : "checkbox"} aria-checked={on} onClick={() => pick(g, o.name)}>
                        {radio ? <span className="radio" /> : <span className="box">{on ? <CheckIcon size={16} /> : null}</span>}
                        <span className="grow">{o.name}</span>
                        {o.delta !== 0
                          ? <span className="pr">{o.delta > 0 ? "+ " : "− "}{money(Math.abs(o.delta))}</span>
                          : radio && g.required ? <span className="pr muted">Incluido</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="h2" style={{ fontSize: 18 }}>Nota para la barra</span>
            <input
              className="field"
              type="text"
              placeholder="Ej.: poca pulpa, bien frío"
              maxLength={160}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            />
          </label>
          {edit && <button type="button" className="btn ghost opc-quitar" onClick={quitar}>Quitar del pedido</button>}
        </section>

        <div className="opc-act">
          <div className="counter" aria-label="Cantidad">
            <button type="button" aria-label="Quitar uno" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Cantidad"
              value={qty}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); setQty(Math.min(99, Math.max(1, n || 1))); }}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" aria-label="Agregar uno" onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
          </div>
          <button type="button" className="btn lg grow opc-go" onClick={commit} disabled={missing.length > 0}>
            <span>{goLabel}</span>
            {!missing.length && <span className="num">{money(unit * qty)}</span>}
          </button>
        </div>

        {p && <Recomiendale productId={p.id} productName={p.name} />}
      </div>

      {receta && p && (
        <RecetaSheet productId={p.id} onClose={() => setReceta(false)} onAdd={() => { setReceta(false); commit(); }} />
      )}
    </>
  );
}

/** The right rail: what to say and what to offer with this product. */
function Recomiendale({ productId, productName }: { productId: string; productName: string }) {
  const catalog = useCatalog();
  const rec = React.useMemo(() => recomendacionesFor(catalog, productId), [catalog, productId]);
  const disp = React.useMemo(() => disponibilidadDe(catalog, productId), [catalog, productId]);
  const [added, setAdded] = React.useState<Record<string, boolean>>({});
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const flash = (key: string) => {
    setAdded((a) => ({ ...a, [key]: true }));
    timers.current.push(window.setTimeout(() => setAdded((a) => ({ ...a, [key]: false })), 1500));
  };

  // «Jugos hoy»: shown when something ran out, or when the list is short enough to read.
  const showDisp = !!disp && disp.hay.length > 0 && (disp.agotados.length > 0 || disp.hay.length <= 6);
  const nothing = !rec.script && !rec.pairings.length && !rec.combos.length && !rec.lowStock.length && !showDisp;
  if (nothing) return null;

  const addBtn = (k: string, label: string, onAdd: () => void) => (
    <button className="add" type="button" aria-label={added[k] ? `${label}: agregado` : `Agregar ${label}`} onClick={() => { onAdd(); flash(k); }} style={added[k] ? { background: "var(--ok)", color: "var(--surface)" } : undefined}>
      {added[k] ? <CheckIcon size={24} /> : "+"}
    </button>
  );

  return (
    <aside className="opc-rail" aria-labelledby="rc">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 id="rc" className="h2">Recomiéndale</h2>
        <span className="muted" style={{ fontSize: 13 }}>Lo que más piden con {productName}</span>
      </div>

      {rec.script && (
        <div className="say" role="note">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}><path d="M4 5h16v11H9l-5 4z" /></svg>
          <p><b>Dilo así:</b> «{rec.script}»{rec.conversionPct != null ? ` — ${Math.round(rec.conversionPct / 10)} de cada 10 lo aceptan.` : ""}</p>
        </div>
      )}

      <div className="opc-recs">
        {rec.pairings.map(({ item, pct }) => (
          <div key={item.id} className="rec">
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="rn">{item.name}</span>
              <span className="rs">La piden en el {Math.round(pct)} % de los pedidos con {productName}</span>
            </span>
            <span className="rp">{money(item.price)}</span>
            {addBtn(`p:${item.id}`, item.name, () => addItem(item.id))}
          </div>
        ))}
        {rec.combos.map((c) => (
          <div key={c.id} className="rec combo-rec">
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="rn">{c.name}</span>
              {c.saving > 0 && <span className="rs"><span className="save">Ahorro en combos · {money(c.saving)}</span></span>}
            </span>
            <span className="rp">{money(c.price)}</span>
            {addBtn(`c:${c.id}`, c.name, () => addCombo(c.id))}
          </div>
        ))}
        {rec.lowStock.map((item) => (
          <div key={item.id} className="rec">
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="rn">{item.name}</span>
              <span className="rs">Quedan pocas · agótala hoy</span>
            </span>
            <span className="rp">{money(item.price)}</span>
            {addBtn(`l:${item.id}`, item.name, () => addItem(item.id))}
          </div>
        ))}
      </div>

      {showDisp && disp && (
        <div className="card tight opc-disp" style={{ gap: 6, background: "var(--surface-2)", border: "none" }}>
          <span className="label">{disp.label} hoy</span>
          <span style={{ fontSize: 15 }}>
            <b>Hay {listaY(disp.hay.length > 8 ? [...disp.hay.slice(0, 7), `${disp.hay.length - 7} más`] : disp.hay)}.</b>
            {disp.agotados.length > 0 && (
              <>
                {" "}
                <span className="muted">
                  {listaY(disp.agotados)} {disp.agotados.length === 1 ? "se acabó" : "se acabaron"}: ofrécele {disp.hay.find((n) => n !== productName) ?? disp.hay[0]} si pide {disp.agotados.length === 1 ? "esa" : "esas"}.
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </aside>
  );
}
