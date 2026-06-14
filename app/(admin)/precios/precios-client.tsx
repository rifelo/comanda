"use client";

/**
 * Listas de precios — matrix of productos × price lists. The Base column is
 * the producto's catalog price (read-only here); each list cell is an editable
 * override that persists, shows its Δ% vs. base, and falls back to base when
 * set equal to it.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { fmtCOP } from "@/lib/mock/productos";
import { effectivePrice, priceDeltaPct } from "@/lib/precios";
import type { PreciosView, PrecioProductoRow, PriceListMeta } from "@/lib/db/precios";
import { SectionCrumb } from "../_components/shared";
import {
  createPriceList,
  deletePriceList,
  setListPrice,
  clearListPrice,
} from "./actions";

function PriceCell({ row, list }: { row: PrecioProductoRow; list: PriceListMeta }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const override = row.overrides[list.id] ?? null;
  const effective = effectivePrice(row.base, override);
  const [val, setVal] = React.useState(String(effective));
  const [prev, setPrev] = React.useState(effective);
  if (effective !== prev) {
    setPrev(effective);
    setVal(String(effective));
  }

  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      setVal(String(effective));
      return;
    }
    if (n === effective) return;
    start(async () => {
      // Setting a list price equal to base clears the override (falls back).
      const r =
        n === row.base
          ? await clearListPrice({ price_list_id: list.id, producto_id: row.producto_id })
          : await setListPrice({ price_list_id: list.id, producto_id: row.producto_id, price_cop: n });
      if (r?.error) setVal(String(effective));
      else router.refresh();
    });
  };

  const delta = priceDeltaPct(row.base, effective);
  const deltaColor = delta > 0 ? "var(--green)" : delta < 0 ? "var(--red)" : "var(--muted)";

  return (
    <div style={{ textAlign: "right" }}>
      <input
        aria-label={`${list.name} · ${row.name}`}
        type="number"
        min="0"
        value={val}
        disabled={pending}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="cmd-num"
        style={{ width: 92, textAlign: "right", border: `1px solid ${override == null ? "var(--rule)" : "var(--ink)"}`, padding: "4px 6px", fontSize: 12, color: "var(--ink)", background: "var(--paper)", minHeight: 0, opacity: pending ? 0.5 : 1 }}
      />
      <div className="cmd-num" style={{ fontSize: 9, marginTop: 2, color: deltaColor }}>
        {override == null ? "= base" : `${delta > 0 ? "+" : ""}${delta}%`}
      </div>
    </div>
  );
}

function NuevaLista({ onError }: { onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const create = () => {
    if (!name.trim()) return onError("Nombre de la lista requerido.");
    onError(null);
    start(async () => {
      const r = await createPriceList({ name, description: desc });
      if (r?.error) onError(r.error);
      else { setName(""); setDesc(""); router.refresh(); }
    });
  };
  const inp: React.CSSProperties = { border: "1.5px solid var(--ink)", padding: "8px 10px", fontSize: 12, color: "var(--ink)", background: "var(--paper)", minHeight: 0 };
  return (
    <div className="cmd-paper-lt flex" style={{ gap: 8, alignItems: "center", border: "1px dashed var(--rule)", padding: 12, marginBottom: 16 }}>
      <input aria-label="Nombre de la lista" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva lista (ej. Delivery)" style={{ ...inp, flex: 1 }} />
      <input aria-label="Descripción de la lista" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Rappi · DiDi" style={{ ...inp, flex: 1 }} />
      <button type="button" className="cmd-btn sm" disabled={pending} onClick={create}>{pending ? "…" : "+ Nueva lista"}</button>
    </div>
  );
}

function DeleteListBtn({ list }: { list: PriceListMeta }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      aria-label={`Eliminar lista ${list.name}`}
      disabled={pending}
      onClick={() => start(async () => { await deletePriceList({ price_list_id: list.id }); router.refresh(); })}
      className="text-muted"
      style={{ background: "none", border: "none", fontSize: 11, cursor: "pointer", padding: 0, minHeight: 0, color: "var(--red)" }}
    >
      ✕
    </button>
  );
}

export function PreciosClient({ view }: { view: PreciosView }) {
  const { lists, productos } = view;
  const [error, setError] = React.useState<string | null>(null);
  const cols = `2fr repeat(${lists.length + 1}, 130px)`;

  return (
    <div>
      <SectionCrumb section="precios" />
      <div style={{ padding: "20px 28px" }}>
        <NuevaLista onError={setError} />
        {error ? (
          <div role="alert" style={{ border: "1px solid var(--red)", color: "var(--red)", padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>{error}</div>
        ) : null}

        {productos.length === 0 ? (
          <div className="text-muted" style={{ padding: 30, fontSize: 13, textAlign: "center" }}>
            No hay productos en el catálogo todavía.
          </div>
        ) : (
          <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)", overflowX: "auto" }}>
            <div className="bg-paper" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 14px", borderBottom: "1.5px solid var(--ink)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, minWidth: "fit-content" }}>
              <span>Producto</span>
              <span style={{ textAlign: "right" }}>Base</span>
              {lists.map((l) => (
                <span key={l.id} style={{ textAlign: "right" }} title={l.description ?? ""}>
                  {l.name} <DeleteListBtn list={l} />
                </span>
              ))}
            </div>

            {productos.map((row, i) => (
              <div key={row.producto_id} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 14px", alignItems: "center", borderBottom: "1px dashed var(--rule-soft)", background: i % 2 ? "var(--paper-lt)" : "var(--paper)", minWidth: "fit-content" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{row.name}</div>
                  {row.category_label ? <div className="text-muted" style={{ fontSize: 10 }}>{row.category_label}</div> : null}
                </div>
                <div className="cmd-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>${fmtCOP(row.base)}</div>
                {lists.map((l) => (
                  <PriceCell key={l.id} row={row} list={l} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="text-muted" style={{ marginTop: 10, fontSize: 10 }}>
          El precio base se edita en Catálogo. Una celda igual a la base no
          guarda override (hereda el precio base).
        </div>
      </div>
    </div>
  );
}
