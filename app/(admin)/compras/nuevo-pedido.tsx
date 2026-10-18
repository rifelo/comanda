"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { fechaMas } from "@/lib/compras/compras";
import { parseCount } from "@/lib/inventario/conteo";
import { tokens } from "@/lib/inventario/propuestas";
import { parseMonto } from "@/lib/caja/movimientos";
import { registrarPedidoManual } from "./actions";

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const input: React.CSSProperties = { height: 40, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 14, outline: "none", minWidth: 0 };

interface Item { id: string; name: string; /** What its quantity is typed in ("bolsas", "und"). */ enQue: string }
interface Linea { key: number; item: Item | null; nombre: string; qty: string }

/**
 * «Registrar pedido»: an order the owner already placed by phone, in person
 * or online — supplier, the day it arrives, the products (from the inventory
 * or free text) and an optional estimated total. It goes to the tablet's
 * «Pedidos por llegar», where the team receives it.
 */
export function NuevoPedido({ items, proveedores, today }: {
  items: Item[];
  proveedores: { id: string; name: string; entregaDias: number }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [prov, setProv] = React.useState<string>("");
  const [llega, setLlega] = React.useState(today);
  const [lineas, setLineas] = React.useState<Linea[]>([{ key: 1, item: null, nombre: "", qty: "" }]);
  const [total, setTotal] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const set = (key: number, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = () => setLineas((ls) => [...ls, { key: Math.max(0, ...ls.map((l) => l.key)) + 1, item: null, nombre: "", qty: "" }]);
  const remove = (key: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  function elegirProveedor(id: string) {
    setProv(id);
    const p = proveedores.find((x) => x.id === id);
    if (p) setLlega(fechaMas(today, p.entregaDias));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const usadas = lineas.filter((l) => l.item || l.nombre.trim() || l.qty.trim());
    if (!usadas.length) return setError("Agrega al menos un producto.");
    const payload = [];
    for (const l of usadas) {
      const q = parseCount(l.qty);
      const nombre = l.item?.name ?? l.nombre.trim();
      if (!l.item && nombre.length < 2) return setError("Escribe el producto de cada línea.");
      if (q === null || q <= 0) return setError(`Falta la cantidad de «${nombre}».`);
      payload.push({ ingredienteId: l.item?.id ?? null, nombre: l.item ? null : nombre, qty: q });
    }
    const t = total.trim() ? parseMonto(total) : null;
    if (total.trim() && t === null) return setError("El total estimado no es un monto.");
    setBusy(true);
    setError(null);
    const r = await registrarPedidoManual({ proveedorId: prov || null, llega, note: note.trim() || undefined, totalEstimado: t, lineas: payload });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(`Pedido n.º ${r.folio} registrado: ya aparece en la tablet en «Pedidos por llegar».`);
    setOpen(false);
    setLineas([{ key: 1, item: null, nombre: "", qty: "" }]);
    setTotal("");
    setNote("");
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="cmd-btn" onClick={() => { setOpen(true); setOk(null); }} style={{ height: 44 }}>＋ Registrar pedido</button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Un pedido que ya hiciste (por teléfono, en persona, en línea): el equipo lo recibe desde la tablet.</span>
        {ok && <span role="status" style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} aria-label="Registrar pedido" style={{ border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span className="font-slab" style={{ fontSize: 20 }}>Registrar pedido</span>
        <button type="button" onClick={() => setOpen(false)} className="cmd-btn ghost sm" style={{ marginLeft: "auto" }}>Cerrar</button>
      </div>
      <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 220px" }}>
          <span style={label}>Proveedor</span>
          <select value={prov} onChange={(e) => elegirProveedor(e.target.value)} aria-label="Proveedor" style={input}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <span style={label}>Llega el</span>
          <input type="date" value={llega} min={today} onChange={(e) => setLlega(e.target.value)} aria-label="Llega el" style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <span style={label}>Total estimado (opcional)</span>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" placeholder="$" aria-label="Total estimado" style={{ ...input, textAlign: "right" }} />
        </label>
      </div>

      <div style={label}>Productos</div>
      {lineas.map((l, i) => (
        <LineaPedido key={l.key} l={l} n={i + 1} items={items} onChange={(p) => set(l.key, p)} onRemove={lineas.length > 1 ? () => remove(l.key) : undefined} />
      ))}
      <button type="button" onClick={add} className="cmd-btn ghost sm" style={{ alignSelf: "flex-start" }}>＋ Otra línea</button>

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Nota (cómo se pidió, a quién, forma de pago acordada…)" aria-label="Nota del pedido" style={input} />
      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 44 }}>{busy ? "Guardando…" : "Guardar pedido"}</button>
        {error && <span role="alert" style={{ fontSize: 12.5, color: "var(--red)" }}>{error}</span>}
      </div>
    </form>
  );
}

function LineaPedido({ l, n, items, onChange, onRemove }: { l: Linea; n: number; items: Item[]; onChange: (p: Partial<Linea>) => void; onRemove?: () => void }) {
  // Every word typed starts a word of the name, so «leche gran» finds the bag.
  const sugeridos = React.useMemo(() => {
    const t = tokens(l.nombre);
    if (l.item || !t.length) return [];
    return items.filter((i) => { const w = tokens(i.name); return t.every((x) => w.some((y) => y.startsWith(x))); }).slice(0, 6);
  }, [l.nombre, l.item, items]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: "1px dashed var(--rule)" }}>
      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="cmd-num" style={{ width: 20, fontSize: 12, color: "var(--muted)" }}>{n}</span>
        {l.item ? (
          <span className="flex items-center" style={{ flex: "3 1 240px", gap: 8, minHeight: 40, padding: "0 10px", border: "1.5px solid var(--ink)", borderRadius: 4 }}>
            <b style={{ flex: 1, fontSize: 13.5 }}>{l.item.name}</b>
            <button type="button" className="cmd-btn ghost sm" onClick={() => onChange({ item: null })}>Cambiar</button>
          </span>
        ) : (
          <input value={l.nombre} onChange={(e) => onChange({ nombre: e.target.value })} placeholder="Producto (busca en el inventario o escríbelo)" aria-label={`Producto ${n}`} maxLength={80} style={{ ...input, flex: "3 1 240px" }} />
        )}
        <input value={l.qty} onChange={(e) => onChange({ qty: e.target.value })} inputMode="decimal" placeholder={l.item ? l.item.enQue : "cant."} aria-label={`Cantidad ${n}`} style={{ ...input, width: 110, textAlign: "right", fontWeight: 700 }} />
        {onRemove && <button type="button" onClick={onRemove} aria-label={`Quitar línea ${n}`} className="cmd-btn ghost sm">×</button>}
      </div>
      {sugeridos.length > 0 && (
        <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginLeft: 28 }}>
          {sugeridos.map((i) => (
            <button key={i.id} type="button" onClick={() => onChange({ item: i })} className="cmd-btn ghost sm" style={{ textTransform: "none", letterSpacing: 0 }}>{i.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
