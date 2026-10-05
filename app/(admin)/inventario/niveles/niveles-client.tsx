"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Ingrediente, IngredienteCategoria, Proveedor } from "@/lib/types";
import { NIVELES, ZONAS, aEntrada, deEntrada, nivelDe, nombrePaquete, usaPaquete, validarNiveles, cantidadLegible } from "@/lib/inventario/niveles";

/** The item with the piece size as currently typed, so levels follow it live. */
const conPieza = (i: Ingrediente, pieza: string) => ({ unit: i.unit, pack_qty: i.pack_qty, pieza_qty: num(pieza) > 0 ? num(pieza) : null });
import { archivarProveedor, guardarNiveles, guardarProveedor } from "./actions";

/** One row as it is being edited: levels as typed (packs when the item has one). */
interface Draft {
  critico: string;
  minimo: string;
  objetivo: string;
  ubicacion: string;
  pack_label: string;
  /** Size of one countable piece, in the stock unit ("900"). */
  pieza: string;
  proveedor_id: string;
  conteo_diario: boolean;
  controla_vencimiento: boolean;
}

const str = (n: number | null) => (n === null || n === 0 ? "" : String(n).replace(".", ","));
const num = (s: string) => {
  const v = Number(s.trim().replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) || v < 0 ? 0 : v;
};
const draftOf = (i: Ingrediente): Draft => ({
  critico: str(aEntrada(i.stock_critico ?? 0, i)),
  minimo: str(aEntrada(i.stock_min ?? 0, i)),
  objetivo: str(i.stock_objetivo == null ? null : aEntrada(i.stock_objetivo, i)),
  ubicacion: i.ubicacion ?? "",
  pack_label: i.pack_label ?? "",
  pieza: str(i.pieza_qty ?? null),
  proveedor_id: i.proveedor_id ?? "",
  conteo_diario: !!i.conteo_diario,
  controla_vencimiento: !!i.controla_vencimiento,
});

const cell: React.CSSProperties = { padding: "6px 6px", verticalAlign: "middle" };
const input: React.CSSProperties = { width: "100%", height: 34, padding: "0 8px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12.5, outline: "none", borderRadius: 3 };
const th: React.CSSProperties = { ...cell, fontWeight: 500, textAlign: "left", whiteSpace: "nowrap" };
const label: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" };

type Filtro = "todos" | "sin-niveles" | "rojo" | "amarillo";

export function NivelesClient({ ingredientes, categorias, proveedores }: {
  ingredientes: Ingrediente[];
  categorias: IngredienteCategoria[];
  proveedores: Proveedor[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>(() => Object.fromEntries(ingredientes.map((i) => [i.id, draftOf(i)])));
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const patch = (id: string, p: Partial<Draft>) => {
    setDrafts((s) => ({ ...s, [id]: { ...s[id], ...p } }));
    setDirty((d) => new Set(d).add(id));
    setMsg(null);
  };

  /**
   * Changing the piece size keeps the levels where they were on the shelf:
   * what was typed is re-expressed in the new piece instead of being
   * silently multiplied by it.
   */
  const repieza = (i: Ingrediente, pieza: string) => {
    const d = drafts[i.id];
    const antes = conPieza(i, d.pieza);
    const despues = conPieza(i, pieza);
    const conv = (v: string) => (v.trim() === "" || num(v) === 0 ? "" : str(aEntrada(deEntrada(num(v), antes), despues)));
    patch(i.id, { pieza, critico: conv(d.critico), minimo: conv(d.minimo), objetivo: conv(d.objetivo) });
  };

  /** A draft's levels in stock units, plus what is wrong with them (if anything). */
  const leer = (i: Ingrediente) => {
    const d = drafts[i.id];
    const it = conPieza(i, d.pieza);
    const critico = deEntrada(num(d.critico), it);
    const minimo = deEntrada(num(d.minimo), it);
    const objetivo = d.objetivo.trim() === "" || num(d.objetivo) === 0 ? null : deEntrada(num(d.objetivo), it);
    return { critico, minimo, objetivo, error: validarNiveles(critico, minimo, objetivo) };
  };

  const errores = ingredientes.filter((i) => dirty.has(i.id) && leer(i).error).length;

  async function save() {
    setSaving(true);
    const items = ingredientes
      .filter((i) => dirty.has(i.id))
      .map((i) => {
        const d = drafts[i.id];
        const v = leer(i);
        return {
          id: i.id,
          stock_critico: v.critico,
          stock_min: v.minimo,
          stock_objetivo: v.objetivo,
          ubicacion: d.ubicacion.trim() || null,
          pack_label: d.pack_label.trim() || null,
          pieza_qty: num(d.pieza) > 0 ? num(d.pieza) : null,
          proveedor_id: d.proveedor_id || null,
          conteo_diario: d.conteo_diario,
          controla_vencimiento: d.controla_vencimiento,
        };
      });
    const r = await guardarNiveles({ items });
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: `Guardado · ${r.count} ítem${r.count === 1 ? "" : "s"}` } : { ok: false, text: r.error });
    if (r.ok) {
      setDirty(new Set());
      router.refresh();
    }
  }

  const catLabel = new Map(categorias.map((c) => [c.id, c.label]));
  const needle = q.trim().toLowerCase();
  const visible = (i: Ingrediente) => {
    if (needle && !i.name.toLowerCase().includes(needle)) return false;
    if (filtro === "todos") return true;
    const v = leer(i);
    if (filtro === "sin-niveles") return v.minimo === 0;
    return nivelDe(Number(i.stock_current), v.critico, v.minimo) === filtro;
  };
  const groups = [...categorias.map((c) => c.id), null]
    .map((cid) => ({
      label: cid ? catLabel.get(cid) ?? "Otros" : "Sin categoría",
      items: ingredientes.filter((i) => (i.category_id ?? null) === cid && visible(i)),
    }))
    .filter((g) => g.items.length);

  const sinNiveles = ingredientes.filter((i) => leer(i).minimo === 0).length;
  const enRapido = ingredientes.filter((i) => drafts[i.id].conteo_diario).length;
  const negativos = ingredientes.filter((i) => Number(i.stock_current) < 0).length;
  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "todos", label: `Todos · ${ingredientes.length}` },
    { id: "sin-niveles", label: `Sin niveles · ${sinNiveles}` },
    { id: "rojo", label: "Se acabó" },
    { id: "amarillo", label: "Poco" },
  ];

  return (
    <div style={{ padding: "16px 16px 120px", fontFamily: "var(--font-mono)" }} className="md:!px-8">
      <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 820, margin: "0 0 14px" }}>
        Cada ítem tiene una presentación (la pieza que se cuenta: bolsa de 900 ml) y tres niveles escritos en esa pieza: <b style={{ color: NIVELES.rojo.color }}>Se acabó</b> (no alcanza para un día),{" "}
        <b style={{ color: NIVELES.amarillo.color }}>Poco</b> (hora de pedir) y <b>Pedir hasta</b> (cuánto debe quedar después de comprar). Con eso se colorea el conteo del barista y se arma la lista de compras.
      </p>

      {negativos > 0 && (
        <div role="note" style={{ border: "1.5px solid var(--amber)", background: "var(--paper-lt)", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, maxWidth: 820, marginBottom: 14, borderRadius: 4 }}>
          <b>{negativos} ítems tienen stock negativo</b>: se vendieron sin que se registrara la compra. Los colores de esta pantalla no son confiables hasta hacer un conteo completo desde la tablet (Turno → Conteo) y aprobarlo.
        </div>
      )}

      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ítem…" aria-label="Buscar ítem" style={{ ...input, width: 220 }} />
        {filtros.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className={"cmd-btn sm" + (filtro === f.id ? "" : " ghost")}>{f.label}</button>
        ))}
        <span style={{ ...label, marginLeft: "auto" }}>Conteo rápido · {enRapido}</span>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--rule)", background: "var(--paper-lt)", borderRadius: 4 }}>
        <table style={{ width: "100%", minWidth: 1130, borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
              <th style={{ ...th, paddingLeft: 12, position: "sticky", left: 0, background: "var(--paper-lt)", zIndex: 1, minWidth: 210 }}>Ítem</th>
              <th style={th}>Stock hoy</th>
              <th style={{ ...th, width: 120 }}>Zona</th>
              <th style={{ ...th, width: 190 }} title="La pieza que se cuenta en el estante y cuánto trae">Presentación</th>
              <th style={{ ...th, width: 92, color: NIVELES.rojo.color }}>Se acabó</th>
              <th style={{ ...th, width: 92, color: NIVELES.amarillo.color }}>Poco</th>
              <th style={{ ...th, width: 92 }}>Pedir hasta</th>
              <th style={{ ...th, width: 150 }}>Proveedor</th>
              <th style={{ ...th, textAlign: "center" }} title="Entra en el conteo rápido de cada cierre">Rápido</th>
              <th style={{ ...th, textAlign: "center", paddingRight: 12 }} title="Se anota la fecha de vencimiento al recibirlo">Vence</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.label}>
                <tr>
                  <td colSpan={10} style={{ padding: "10px 12px 4px", fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", borderTop: "1px solid var(--rule)" }}>{g.label} · {g.items.length}</td>
                </tr>
                {g.items.map((i) => {
                  const d = drafts[i.id];
                  const v = leer(i);
                  const stock = Number(i.stock_current);
                  const nivel = NIVELES[nivelDe(stock, v.critico, v.minimo)];
                  const it = conPieza(i, d.pieza);
                  const pack = usaPaquete(it);
                  const unidad = pack ? nombrePaquete({ pack_label: d.pack_label }, 2) : i.unit;
                  const lvl = (key: "critico" | "minimo" | "objetivo", name: string) => (
                    <input
                      value={d[key]}
                      onChange={(e) => patch(i.id, { [key]: e.target.value })}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`${name} de ${i.name} (${unidad})`}
                      title={`En ${unidad}`}
                      style={{ ...input, textAlign: "right", borderColor: v.error && dirty.has(i.id) ? "var(--red)" : "var(--rule)" }}
                    />
                  );
                  return (
                    <tr key={i.id} style={{ borderTop: "1px dashed var(--rule-soft, var(--rule))", background: dirty.has(i.id) ? "var(--paper)" : undefined }}>
                      <td style={{ ...cell, paddingLeft: 12, position: "sticky", left: 0, background: dirty.has(i.id) ? "var(--paper)" : "var(--paper-lt)", zIndex: 1 }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.25 }}>{i.name}</div>
                        <div className="text-muted" style={{ fontSize: 10.5, marginTop: 1 }}>niveles en {unidad}</div>
                        {v.error && dirty.has(i.id) && <div role="alert" style={{ fontSize: 10.5, color: "var(--red)", marginTop: 2 }}>{v.error}</div>}
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        <span aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: stock < 0 ? "var(--muted)" : nivel.color, marginRight: 6 }} />
                        <span className="cmd-num" style={{ color: stock < 0 ? "var(--muted)" : "var(--ink)" }}>{stock < 0 ? "sin contar" : cantidadLegible(stock, { ...it, pack_label: d.pack_label })}</span>
                      </td>
                      <td style={cell}>
                        <input value={d.ubicacion} onChange={(e) => patch(i.id, { ubicacion: e.target.value })} list="niveles-zonas" placeholder="—" aria-label={`Zona de ${i.name}`} maxLength={40} style={input} />
                      </td>
                      <td style={cell}>
                        <div className="flex items-center" style={{ gap: 4 }}>
                          <input value={d.pack_label} onChange={(e) => patch(i.id, { pack_label: e.target.value })} placeholder="bolsa" aria-label={`Presentación de ${i.name}`} maxLength={24} style={{ ...input, flex: "1 1 60px", minWidth: 0 }} />
                          <input value={d.pieza} onChange={(e) => repieza(i, e.target.value)} inputMode="decimal" placeholder="—" aria-label={`Tamaño de la presentación de ${i.name} (${i.unit})`} title={`Cuánto trae una, en ${i.unit}`} style={{ ...input, flex: "0 0 58px", textAlign: "right", padding: "0 6px" }} />
                          <span className="text-muted" style={{ fontSize: 10.5, flex: "0 0 auto" }}>{i.unit}</span>
                        </div>
                      </td>
                      <td style={cell}>{lvl("critico", "Se acabó")}</td>
                      <td style={cell}>{lvl("minimo", "Poco")}</td>
                      <td style={cell}>{lvl("objetivo", "Pedir hasta")}</td>
                      <td style={cell}>
                        <select value={d.proveedor_id} onChange={(e) => patch(i.id, { proveedor_id: e.target.value })} aria-label={`Proveedor de ${i.name}`} style={{ ...input, padding: "0 4px" }}>
                          <option value="">—</option>
                          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td style={{ ...cell, textAlign: "center" }}>
                        <input type="checkbox" checked={d.conteo_diario} onChange={(e) => patch(i.id, { conteo_diario: e.target.checked })} aria-label={`${i.name} en el conteo rápido`} style={{ width: 18, height: 18 }} />
                      </td>
                      <td style={{ ...cell, textAlign: "center", paddingRight: 12 }}>
                        <input type="checkbox" checked={d.controla_vencimiento} onChange={(e) => patch(i.id, { controla_vencimiento: e.target.checked })} aria-label={`${i.name} controla vencimiento`} style={{ width: 18, height: 18 }} />
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Ningún ítem coincide.</td></tr>
            )}
          </tbody>
        </table>
        <datalist id="niveles-zonas">{ZONAS.map((z) => <option key={z} value={z} />)}</datalist>
      </div>

      <Proveedores proveedores={proveedores} />

      {/* Save bar: always in reach, also on a phone. */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, borderTop: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: "10px 16px" }} className="md:!left-[220px]">
        <div className="flex items-center" style={{ gap: 12, maxWidth: 1200 }}>
          <button type="button" className="cmd-btn" disabled={dirty.size === 0 || saving || errores > 0} onClick={() => void save()} style={{ minWidth: 150 }}>
            {saving ? "Guardando…" : dirty.size ? `Guardar ${dirty.size} cambio${dirty.size === 1 ? "" : "s"}` : "Sin cambios"}
          </button>
          {errores > 0 && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{errores} ítem{errores === 1 ? "" : "s"} con niveles en desorden.</span>}
          {msg && <span role="status" style={{ fontSize: 12, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

/** Suppliers: who to write to and when. Kept short — a name is enough to start. */
function Proveedores({ proveedores }: { proveedores: Proveedor[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [dias, setDias] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await guardarProveedor({ name, whatsapp, dias_pedido: dias });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setName("");
    setWhatsapp("");
    setDias("");
    router.refresh();
  }
  async function quitar(p: Proveedor) {
    if (!window.confirm(`¿Quitar a ${p.name}? Sus ítems quedan sin proveedor.`)) return;
    const r = await archivarProveedor(p.id);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <section style={{ marginTop: 28, maxWidth: 820 }} aria-label="Proveedores">
      <div style={label}>Proveedores · {proveedores.length}</div>
      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "6px 0 10px" }}>A quién se le pide cada ítem. Con el WhatsApp, el pedido se arma listo para enviar.</p>
      {proveedores.map((p) => (
        <div key={p.id} className="flex items-center" style={{ gap: 10, padding: "8px 0", borderTop: "1px dashed var(--rule)", fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, flex: "0 1 220px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          <span className="cmd-num text-muted" style={{ flex: "0 0 130px" }}>{p.whatsapp ? `+${p.whatsapp}` : "sin WhatsApp"}</span>
          <span className="text-muted" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.dias_pedido ?? ""}</span>
          <button type="button" className="cmd-btn ghost sm" onClick={() => void quitar(p)} aria-label={`Quitar a ${p.name}`}>Quitar</button>
        </div>
      ))}
      <form onSubmit={add} className="flex items-center" style={{ gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proveedor" aria-label="Nombre del proveedor" maxLength={80} style={{ ...input, flex: "1 1 200px", width: "auto" }} />
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="WhatsApp (300 123 4567)" aria-label="WhatsApp del proveedor" inputMode="tel" maxLength={24} style={{ ...input, flex: "1 1 170px", width: "auto" }} />
        <input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Días de pedido (lun y jue)" aria-label="Días de pedido" maxLength={80} style={{ ...input, flex: "1 1 170px", width: "auto" }} />
        <button type="submit" className="cmd-btn sm" disabled={busy || name.trim().length < 2}>{busy ? "…" : "Agregar"}</button>
      </form>
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </section>
  );
}
