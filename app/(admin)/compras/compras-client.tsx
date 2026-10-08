"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DIAS_CORTOS, diasLegibles, type Motivo } from "@/lib/compras/compras";
import { parseCount } from "@/lib/inventario/conteo";
import { NIVELES, type Nivel } from "@/lib/inventario/niveles";
import { armarPedido, cancelarPedidoAction, descartarSolicitud, guardarDiasProveedor, type ArmarPedidoResult } from "./actions";

export interface LineaView {
  key: string;
  nombre: string;
  nivel: Nivel | null;
  motivos: Motivo[];
  notas: string[];
  /** Set on free-text lines: the request behind it, so it can be dismissed. */
  solicitudId: string | null;
  hay: string | null;
  /** Suggested quantity, stock units. */
  qty: number;
  /** Stock units per piece the quantity is typed in; null = typed in the unit. */
  pieza: number | null;
  enQue: string;
}
export interface GrupoView {
  proveedor: { id: string; name: string; whatsapp: string | null; dias: number[] } | null;
  toca: boolean;
  faltan: number | null;
  lineas: LineaView[];
}
export interface PedidoView {
  id: string;
  folio: number;
  proveedor: string;
  pedido: string;
  llega: string | null;
  atrasado: boolean;
  lineas: { nombre: string; cantidad: string }[];
  wa: string | null;
}

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const input: React.CSSProperties = { height: 40, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 14, outline: "none", minWidth: 0 };
const MOTIVO: Record<Motivo, string> = { nivel: "nivel", faltante: "reportado", solicitud: "lo pidió el equipo" };
const trim = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const cuando = (g: GrupoView) => (g.proveedor === null ? "sin proveedor asignado" : g.faltan === null ? "sin días fijos" : g.faltan === 0 ? "hoy toca pedir" : g.faltan === 1 ? "toca mañana" : `toca en ${g.faltan} días`);

export function ComprasClient({ grupos, enCamino, proveedores }: {
  grupos: GrupoView[];
  enCamino: PedidoView[];
  proveedores: { id: string; name: string; whatsapp: string | null; dias: number[]; entregaDias: number }[];
}) {
  const total = grupos.reduce((n, g) => n + g.lineas.length, 0);
  return (
    <div style={{ padding: "20px 16px 48px", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 30 }} className="md:px-8">
      <section aria-label="Por pedir">
        <div style={label}>Por pedir · {total}</div>
        {total === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Nada por pedir: ningún ítem está en «poco» o «se acabó», y el equipo no ha pedido nada. La lista se arma sola con los conteos, los faltantes y lo que piden desde el tablet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
          {grupos.map((g) => <Grupo key={g.proveedor?.id ?? "none"} g={g} />)}
        </div>
      </section>

      <section aria-label="Pedidos en camino">
        <div style={label}>Pedidos en camino · {enCamino.length}</div>
        {enCamino.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Ningún pedido pendiente de llegar.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {enCamino.map((p) => <Pedido key={p.id} p={p} />)}
        </div>
      </section>

      <section aria-label="Días de pedido">
        <div style={label}>Días de pedido por proveedor</div>
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "6px 0 4px" }}>Con días fijos, la lista avisa a quién toca pedirle hoy. Sin días marcados se le puede pedir cualquier día.</p>
        {proveedores.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>Todavía no hay proveedores. Se agregan en Inventario → Niveles.</p>}
        {proveedores.map((p) => <DiasProveedor key={p.id} p={p} />)}
      </section>
    </div>
  );
}

function Grupo({ g }: { g: GrupoView }) {
  const router = useRouter();
  const entrada = (l: LineaView) => trim(l.pieza ? l.qty / l.pieza : l.qty);
  const [on, setOn] = React.useState<Record<string, boolean>>(() => Object.fromEntries(g.lineas.map((l) => [l.key, true])));
  const [qty, setQty] = React.useState<Record<string, string>>(() => Object.fromEntries(g.lineas.map((l) => [l.key, entrada(l)])));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<Extract<ArmarPedidoResult, { ok: true }> | null>(null);
  const elegidas = g.lineas.filter((l) => on[l.key] ?? true);

  async function armar() {
    if (busy) return;
    const lineas: { key: string; qty: number }[] = [];
    for (const l of elegidas) {
      const n = parseCount(qty[l.key] ?? entrada(l));
      if (n === null || n <= 0) return setError(`Revisa la cantidad de ${l.nombre}.`);
      lineas.push({ key: l.key, qty: Math.round(n * (l.pieza ?? 1) * 1000) / 1000 });
    }
    if (!lineas.length) return setError("Marca al menos un ítem.");
    setBusy(true);
    setError(null);
    const r = await armarPedido({ proveedorId: g.proveedor?.id ?? null, note: note.trim() || undefined, lineas });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setHecho(r);
    router.refresh();
  }
  async function descartar(id: string) {
    const r = await descartarSolicitud(id);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  if (hecho) {
    return (
      <div role="status" style={{ border: "1.5px solid var(--green)", borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px" }}>
        <div className="font-slab" style={{ fontSize: 18 }}>Pedido n.º {hecho.folio} · {g.proveedor?.name ?? "sin proveedor"}</div>
        <pre style={{ margin: "10px 0", padding: "10px 12px", border: "1px dashed var(--rule)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{hecho.mensaje}</pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hecho.wa ? (
            <a href={hecho.wa} target="_blank" rel="noreferrer" className="cmd-btn" style={{ textDecoration: "none" }}>Enviar por WhatsApp →</a>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Este proveedor no tiene WhatsApp guardado: copia el mensaje.</span>
          )}
          <button type="button" className="cmd-btn ghost" onClick={() => void navigator.clipboard?.writeText(hecho.mensaje)}>Copiar mensaje</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ border: `1.5px solid ${g.toca && g.proveedor ? "var(--ink)" : "var(--rule)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px" }}>
      <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap" }}>
        <span className="font-slab" style={{ fontSize: 19 }}>{g.proveedor?.name ?? "Sin proveedor"}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: g.faltan === 0 ? "var(--red)" : "var(--muted)" }}>{cuando(g)}</span>
        {g.proveedor && g.proveedor.dias.length > 0 && <span style={{ fontSize: 11, color: "var(--muted)" }}>({diasLegibles(g.proveedor.dias)})</span>}
      </div>
      <div style={{ marginTop: 6 }}>
        {g.lineas.map((l) => (
          <div key={l.key} className="flex items-center" style={{ gap: 10, padding: "8px 0", borderTop: "1px dashed var(--rule)", flexWrap: "wrap" }}>
            <input type="checkbox" checked={on[l.key] ?? true} onChange={(e) => setOn((s) => ({ ...s, [l.key]: e.target.checked }))} aria-label={`Incluir ${l.nombre}`} style={{ width: 20, height: 20, accentColor: "var(--ink)" }} />
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: l.nivel ? NIVELES[l.nivel].color : "var(--rule)", flexShrink: 0 }} />
            <div className="flex-1" style={{ minWidth: 170 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{l.nombre}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {l.hay ? `hay ${l.hay} · ` : ""}{l.motivos.map((m) => MOTIVO[m]).join(" · ")}{l.notas.length ? ` · «${l.notas.join("» «")}»` : ""}
              </div>
            </div>
            {l.solicitudId && <button type="button" className="cmd-btn ghost sm" onClick={() => void descartar(l.solicitudId!)}>Descartar</button>}
            <input value={qty[l.key] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [l.key]: e.target.value }))} inputMode="decimal" aria-label={`Cantidad de ${l.nombre}`} style={{ ...input, width: 84, textAlign: "right", fontWeight: 700 }} />
            <span style={{ fontSize: 11.5, color: "var(--muted)", width: 62 }}>{l.enQue}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota para el proveedor (opcional)" aria-label={`Nota para ${g.proveedor?.name ?? "el pedido"}`} maxLength={300} style={{ ...input, flex: "1 1 220px" }} />
        <button type="button" className={g.toca ? "cmd-btn" : "cmd-btn ghost"} onClick={() => void armar()} disabled={busy || elegidas.length === 0}>
          {busy ? "Armando…" : `Armar pedido · ${elegidas.length}`}
        </button>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function Pedido({ p }: { p: PedidoView }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function cancelar() {
    if (busy || !window.confirm(`¿Cancelar el pedido n.º ${p.folio} a ${p.proveedor}? Sus ítems vuelven a «por pedir».`)) return;
    setBusy(true);
    const r = await cancelarPedidoAction(p.id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }
  return (
    <div style={{ border: `1.5px solid ${p.atrasado ? "var(--red)" : "var(--rule)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px" }}>
      <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>n.º {p.folio} · {p.proveedor}</span>
        <span style={{ fontSize: 11.5, color: p.atrasado ? "var(--red)" : "var(--muted)", fontWeight: p.atrasado ? 700 : 400 }}>
          pedido el {p.pedido}{p.llega ? ` · ${p.atrasado ? "debía llegar" : "llega"} el ${p.llega}` : ""}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.6 }}>{p.lineas.map((l) => `${l.cantidad} ${l.nombre}`).join(" · ")}</div>
      <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {p.wa && <a href={p.wa} target="_blank" rel="noreferrer" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Enviar por WhatsApp</a>}
        <button type="button" className="cmd-btn ghost sm" onClick={() => void cancelar()} disabled={busy}>{busy ? "…" : "Cancelar pedido"}</button>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Se recibe desde el tablet cuando llegue.</span>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function DiasProveedor({ p }: { p: { id: string; name: string; whatsapp: string | null; dias: number[]; entregaDias: number } }) {
  const router = useRouter();
  const [dias, setDias] = React.useState<number[]>(p.dias);
  const [entrega, setEntrega] = React.useState(String(p.entregaDias));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const dirty = [...dias].sort().join() !== [...p.dias].sort().join() || entrega !== String(p.entregaDias);
  async function save() {
    setBusy(true);
    const r = await guardarDiasProveedor({ id: p.id, dias, entregaDias: Number(entrega) || 0 });
    setBusy(false);
    setMsg(r.ok ? "Guardado" : r.error);
    if (r.ok) router.refresh();
  }
  return (
    <div className="flex items-center" style={{ gap: 10, padding: "10px 0", borderTop: "1px dashed var(--rule)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 180px", minWidth: 0 }}>{p.name}{!p.whatsapp && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}> · sin WhatsApp</span>}</span>
      <div role="group" aria-label={`Días de pedido de ${p.name}`} className="flex" style={{ gap: 4 }}>
        {DIAS_CORTOS.map((d, i) => {
          const sel = dias.includes(i);
          return (
            <button key={d} type="button" aria-pressed={sel} onClick={() => { setMsg(null); setDias((s) => (sel ? s.filter((x) => x !== i) : [...s, i])); }} style={{ width: 40, height: 36, borderRadius: 4, border: `1.5px solid ${sel ? "var(--ink)" : "var(--rule)"}`, background: sel ? "var(--ink)" : "transparent", color: sel ? "var(--paper-lt)" : "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}>{d}</button>
          );
        })}
      </div>
      <label className="flex items-center" style={{ gap: 6, fontSize: 11.5, color: "var(--muted)" }}>
        entrega en
        <input value={entrega} onChange={(e) => { setMsg(null); setEntrega(e.target.value.replace(/\D/g, "").slice(0, 2)); }} inputMode="numeric" aria-label={`Días de entrega de ${p.name}`} style={{ ...input, width: 48, height: 36, textAlign: "right" }} />
        días
      </label>
      <button type="button" className="cmd-btn sm" onClick={() => void save()} disabled={busy || !dirty}>{busy ? "…" : "Guardar"}</button>
      {msg && <span role="status" style={{ fontSize: 11.5, color: msg === "Guardado" ? "var(--green)" : "var(--red)" }}>{msg}</span>}
    </div>
  );
}
