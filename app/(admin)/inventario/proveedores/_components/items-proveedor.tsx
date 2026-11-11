"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NIVELES, cantidadLegible, nivelDe } from "@/lib/inventario/niveles";
import type { ItemProveedor } from "@/lib/compras/proveedores-db";
import { asignarItems } from "../actions";

const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "12px minmax(0,1fr) auto", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px dashed var(--line)", fontSize: 14 };

function Punto({ i }: { i: ItemProveedor }) {
  const neg = i.stock_current < 0;
  const color = neg ? "var(--muted)" : NIVELES[nivelDe(i.stock_current, i.stock_critico, i.stock_min)].color;
  return <span aria-hidden style={{ width: 10, height: 10, borderRadius: 10, background: color }} />;
}

const stockDe = (i: ItemProveedor) => (i.stock_current < 0 ? "sin contar" : cantidadLegible(i.stock_current, i));

/**
 * What the supplier brings: each item with its stock colour, a way to take it
 * off, and a picker to add more. Items that belong to another supplier can be
 * moved over — the picker says from whom.
 */
export function ItemsProveedor({ proveedorId, items, otros, proveedorNombre }: {
  proveedorId: string;
  items: ItemProveedor[];
  /** Every other active item; `proveedorNombre` names their current supplier. */
  otros: ItemProveedor[];
  proveedorNombre: Record<string, string>;
}) {
  const router = useRouter();
  const [picking, setPicking] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function asignar(proveedor: string | null, ids: string[], key: string) {
    setBusy(key);
    setError(null);
    const r = await asignarItems({ proveedorId: proveedor, itemIds: ids });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setSel(new Set());
    setPicking(false);
    setQ("");
    router.refresh();
  }

  const needle = q.trim().toLowerCase();
  // Items nobody supplies first: they're the ones that most need a home.
  const candidatos = otros
    .filter((i) => !needle || i.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(!!a.proveedor_id) - Number(!!b.proveedor_id) || a.name.localeCompare(b.name, "es"));
  const sinProveedor = otros.filter((i) => !i.proveedor_id).length;

  return (
    <section aria-label="Ítems que surte">
      <div className="flex items-center" style={{ gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)", marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Ítems que surte · {items.length}</span>
        {!picking && <button type="button" className="cmd-btn ghost sm" onClick={() => setPicking(true)} style={{ marginLeft: "auto" }}>＋ Agregar ítems</button>}
      </div>

      {picking && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)", padding: 12, margin: "10px 0" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ítem…" aria-label="Buscar ítem para agregar" autoFocus style={{ flex: "1 1 200px", minHeight: 40, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none" }} />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{sinProveedor} sin proveedor</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
            {candidatos.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Ningún ítem coincide.</div>}
            {candidatos.map((i) => (
              <label key={i.id} className="flex items-center" style={{ gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 14, cursor: "pointer", minHeight: 44 }}>
                <input type="checkbox" checked={sel.has(i.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} style={{ width: 18, height: 18, flex: "0 0 auto" }} />
                <span style={{ flex: 1, minWidth: 0 }}>{i.name}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>{i.proveedor_id ? `de ${proveedorNombre[i.proveedor_id] ?? "otro"}` : "sin proveedor"}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center flex-wrap" style={{ gap: 10, marginTop: 10 }}>
            <button type="button" className="cmd-btn sm" disabled={!sel.size || !!busy} onClick={() => void asignar(proveedorId, [...sel], "add")}>
              {busy === "add" ? "Agregando…" : sel.size ? `Agregar ${sel.size}` : "Agregar"}
            </button>
            <button type="button" className="cmd-btn ghost sm" onClick={() => { setPicking(false); setSel(new Set()); setQ(""); }}>Cancelar</button>
            {[...sel].some((id) => otros.find((o) => o.id === id)?.proveedor_id) && <span style={{ fontSize: 12, color: "var(--muted)" }}>Los que tenían otro proveedor pasan a este.</span>}
          </div>
        </div>
      )}

      {items.length === 0 && !picking && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Todavía no tiene ítems. Agrégalos para que «Pedidos» arme su lista.</div>}
      {items.map((i) => (
        <div key={i.id} style={row}>
          <Punto i={i} />
          <Link href={`/inventario/${i.id}`} style={{ minWidth: 0, color: "var(--text)", textDecoration: "none" }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
            <div className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{stockDe(i)}</div>
          </Link>
          <button type="button" className="cmd-btn ghost sm" disabled={!!busy} onClick={() => void asignar(null, [i.id], i.id)} aria-label={`Quitar ${i.name} de este proveedor`}>
            {busy === i.id ? "…" : "Quitar"}
          </button>
        </div>
      ))}
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </section>
  );
}
