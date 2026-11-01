"use client";

/**
 * Receta.dc.html — the recipe overlay (hold or right-click a tile): photo,
 * spec, description, ingredients and numbered steps. Package B also opens
 * it from the options page with its own `onClose`.
 */
import * as React from "react";
import { useCatalog, posStore, tapItem } from "../pos-store";
import { money, Overlay } from "./ticket";
import { CloseX } from "./top-bar";

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace(".", ","));

export function RecetaSheet({ productId, onClose, onAdd }: {
  productId: string;
  /** Default: close the overlay (store `sheet: null`). */
  onClose?: () => void;
  /** Default: close, then tapItem (products with options go to their page). */
  onAdd?: () => void;
}) {
  const catalog = useCatalog();
  const p = catalog.byId[productId];
  const [zoom, setZoom] = React.useState(false);
  const close = React.useCallback(() => (onClose ? onClose() : posStore.set({ sheet: null })), [onClose]);
  const add = () => {
    if (onAdd) return onAdd();
    posStore.set({ sheet: null });
    tapItem(productId);
  };
  React.useEffect(() => { if (!p) close(); }, [p, close]);
  if (!p) return null;
  const out = p.stock === "sin";
  return (
    <Overlay onClose={() => (zoom ? setZoom(false) : close())} labelledBy="rc" maxWidth={980} style={{ gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="grow">
          <span className="label">Receta · mantén presionado un producto para verla</span>
          <h2 id="rc" className="h1">{p.name}</h2>
        </div>
        <span className="pill brand" style={{ height: 36, fontSize: 15, padding: "0 14px" }}>{money(p.price)}</span>
        <CloseX onClick={close} />
      </div>

      <div className="rc-body scroll">
        {p.image ? (
          <button type="button" className="photo rc-photo" onClick={() => setZoom(true)} aria-label={`Ver la foto de ${p.name} en grande`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- product photo from storage */}
            <img src={p.image} alt={p.name} />
          </button>
        ) : (
          <div className="photo rc-photo" aria-hidden>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h12l-1 11H6z" /><path d="M17 10h2a2 2 0 0 1 0 4h-2.4" /><path d="M8 4c0 1 1 1 1 2M11 4c0 1 1 1 1 2" /></svg>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {p.spec.length > 0 && <span className="spec">{p.spec.join(" · ").toUpperCase()}</span>}
          {p.desc && <p style={{ fontSize: 16, lineHeight: 1.45 }}>{p.desc}</p>}

          <div className="rc-cols">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="label">Ingredientes</span>
              {p.recipe.length === 0 ? (
                <span className="muted" style={{ fontSize: 15 }}>Sin receta cargada. Se agrega en el panel, en Operación → Recetas.</span>
              ) : (
                <ul className="ing">
                  {p.recipe.map((l, i) => (
                    <li key={i}>
                      <span>{l.name}{l.note ? <span className="muted"> · {l.note}</span> : null}</span>
                      <b className="num" style={{ whiteSpace: "nowrap" }}>{fmtQty(l.qty)} {l.unit}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="label">Preparación</span>
              {p.prep.length === 0 ? (
                <span className="muted" style={{ fontSize: 15 }}>Sin pasos de preparación. Se agregan en el panel, en Operación → Recetas.</span>
              ) : (
                <ol className="steps-n">
                  {p.prep.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {out && <span className="pill late">Agotado</span>}
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={close}>Cerrar</button>
        <button type="button" className="btn" disabled={out} onClick={add}>Agregar al pedido</button>
      </div>

      {zoom && p.image && (
        <button type="button" className="rc-zoom" onClick={() => setZoom(false)} aria-label="Cerrar foto">
          {/* eslint-disable-next-line @next/next/no-img-element -- product photo from storage */}
          <img src={p.image} alt={p.name} />
        </button>
      )}
    </Overlay>
  );
}
