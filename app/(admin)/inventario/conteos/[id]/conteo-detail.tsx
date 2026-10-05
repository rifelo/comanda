"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { InventarioConteo } from "@/lib/types";
import { posMoney } from "@/lib/pos/types";
import { conteoSummary, lineDiff } from "@/lib/inventario/conteo";
import { PRESENTACIONES, UNIDADES_STOCK, mismoNombre, parecidos, unidadSugerida, type ConteoPropuesta } from "@/lib/inventario/propuestas";
import { aprobarConteo, crearDesdePropuesta, descartarPropuesta, rechazarConteo, unirPropuesta } from "../actions";

type IngLite = { id: string; name: string; unit: string };
type CatLite = { id: string; label: string };

const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

export function ConteoDetail({ conteo, propuestas, ingredientes, categorias }: { conteo: InventarioConteo; propuestas: ConteoPropuesta[]; ingredientes: IngLite[]; categorias: CatLite[] }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"aprobar" | "rechazar" | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const s = conteoSummary(conteo.items);
  const pending = conteo.status === "pendiente";
  const abiertas = propuestas.filter((p) => p.status === "pendiente");

  async function act(kind: "aprobar" | "rechazar") {
    if (kind === "aprobar" && s.withDiff > 0 && !window.confirm(`Se aplicarán ${s.withDiff} ajuste${s.withDiff === 1 ? "" : "s"} al inventario. ¿Aprobar?`)) return;
    if (kind === "rechazar" && !window.confirm("El conteo quedará rechazado y no se aplicará nada. ¿Continuar?")) return;
    setBusy(kind);
    setMsg(null);
    const r = kind === "aprobar" ? await aprobarConteo({ id: conteo.id, note: note || undefined }) : await rechazarConteo({ id: conteo.id, note: note || undefined });
    setBusy(null);
    setMsg(r.ok ? (kind === "aprobar" ? `Aprobado · ${r.adjusted} ajuste${r.adjusted === 1 ? "" : "s"} aplicado${r.adjusted === 1 ? "" : "s"}` : "Rechazado") : r.error);
    router.refresh();
  }

  const rows = [...conteo.items].sort((a, b) => Math.abs(lineDiff(b).value) - Math.abs(lineDiff(a).value));
  return (
    <div style={{ padding: "20px 32px 48px", fontFamily: "var(--font-mono)", maxWidth: 980 }}>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
        <Stat k="Enviado" v={fecha(conteo.submitted_at)} />
        <Stat k="Contó" v={conteo.counted_by_name ?? "—"} />
        <Stat k="Ítems" v={`${s.lines}`} />
        <Stat k="Con diferencia" v={`${s.withDiff}`} />
        <Stat k="Faltante" v={posMoney(s.shortValue)} color={s.shortValue ? "var(--red)" : undefined} />
        <Stat k="Sobrante" v={posMoney(s.overValue)} color={s.overValue ? "var(--amber)" : undefined} />
        <Stat k="Estado" v={conteo.status} color={conteo.status === "aprobado" ? "var(--green)" : conteo.status === "rechazado" ? "var(--muted)" : "var(--amber)"} />
      </div>
      {conteo.note && <div style={{ fontSize: 12.5, marginBottom: 12 }}>Nota del equipo: {conteo.note}</div>}
      {conteo.review_note && <div style={{ fontSize: 12.5, marginBottom: 12, color: "var(--muted)" }}>Nota de revisión: {conteo.review_note}</div>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
            <th style={{ textAlign: "left", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Ingrediente</th>
            <th style={{ textAlign: "right", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Esperado</th>
            <th style={{ textAlign: "right", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Contado</th>
            <th style={{ textAlign: "right", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Diferencia</th>
            <th style={{ textAlign: "right", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => {
            const d = lineDiff(it);
            const color = d.diff === 0 ? "var(--muted)" : d.diff < 0 ? "var(--red)" : "var(--amber)";
            return (
              <tr key={it.id} style={{ borderBottom: "1px dashed var(--rule)" }}>
                <td style={{ padding: "8px 0" }}>
                  <div style={{ fontWeight: d.diff ? 600 : 400 }}>{it.name}</div>
                  {it.note && <div style={{ fontSize: 11, color: "var(--muted)" }}>{it.note}</div>}
                </td>
                <td className="cmd-num" style={{ textAlign: "right", padding: "8px 0", color: "var(--muted)" }}>{it.expected} {it.unit}</td>
                <td className="cmd-num" style={{ textAlign: "right", padding: "8px 0" }}>{it.counted} {it.unit}</td>
                <td className="cmd-num" style={{ textAlign: "right", padding: "8px 0", color, fontWeight: d.diff ? 700 : 400 }}>{d.diff > 0 ? "+" : ""}{d.diff}</td>
                <td className="cmd-num" style={{ textAlign: "right", padding: "8px 0", color }}>{d.value ? (d.value < 0 ? "−" : "+") + posMoney(Math.abs(d.value)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {propuestas.length > 0 && (
        <section aria-label="Ítems propuestos" style={{ marginTop: 26 }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>
            Ítems que no estaban en la lista {abiertas.length > 0 && <span style={{ color: "var(--amber)" }}>· {abiertas.length} por resolver</span>}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "8px 0 4px" }}>
            Quien contó encontró esto en el estante. Por cada uno: créalo como ítem nuevo, únelo a uno que ya existe con otro nombre, o descártalo. Nada entra al inventario hasta que lo decidas.
          </p>
          {propuestas.map((p) => (
            <PropuestaRow key={p.id} p={p} ingredientes={ingredientes} categorias={categorias} conteoPendiente={pending} />
          ))}
        </section>
      )}

      {pending && (
        <div style={{ marginTop: 22, border: "1.5px solid var(--ink)", borderRadius: 8, padding: "16px 18px", background: "var(--paper-lt)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Aprobar aplica {s.withDiff} ajuste{s.withDiff === 1 ? "" : "s"} contra lo que el sistema esperaba en el momento del conteo; las ventas posteriores ya están descontadas. Rechazar no mueve nada.
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Nota de revisión (opcional): recontar la leche, etc." aria-label="Nota de revisión" style={{ height: 40, padding: "0 10px", border: "1px solid var(--rule)", borderRadius: 3, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="cmd-btn" onClick={() => void act("aprobar")} disabled={!!busy || abiertas.length > 0} title={abiertas.length ? "Resuelve primero los ítems propuestos" : undefined} style={{ height: 44 }}>{busy === "aprobar" ? "Aplicando…" : s.withDiff ? "Aprobar y ajustar inventario" : "Aprobar (sin ajustes)"}</button>
            <button type="button" className="cmd-btn ghost" onClick={() => void act("rechazar")} disabled={!!busy} style={{ height: 44 }}>{busy === "rechazar" ? "…" : "Rechazar"}</button>
            {abiertas.length > 0 && <span style={{ fontSize: 12, color: "var(--amber)" }}>Resuelve primero {abiertas.length === 1 ? "el ítem propuesto" : `los ${abiertas.length} ítems propuestos`}.</span>}
            {msg && <span style={{ fontSize: 12, color: "var(--muted)" }}>{msg}</span>}
          </div>
        </div>
      )}
      {!pending && msg && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--green)" }}>{msg}</div>}
    </div>
  );
}

function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{k}</div>
      <div className="cmd-num" style={{ fontSize: 16, fontWeight: 700, color: color ?? "var(--ink)", marginTop: 2 }}>{v}</div>
    </div>
  );
}

const field: React.CSSProperties = { height: 38, padding: "0 8px", border: "1px solid var(--rule)", borderRadius: 3, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12.5, outline: "none", minWidth: 0 };
const numOf = (t: string) => {
  const v = Number(t.trim().replace(",", "."));
  return t.trim() !== "" && Number.isFinite(v) && v >= 0 ? v : null;
};
const ESTADO: Record<ConteoPropuesta["status"], { label: string; color: string }> = {
  pendiente: { label: "por resolver", color: "var(--amber)" },
  creado: { label: "creado", color: "var(--green)" },
  unido: { label: "unido", color: "var(--green)" },
  descartado: { label: "descartado", color: "var(--muted)" },
};

/** One proposed item: what was found, and the three ways to settle it. */
function PropuestaRow({ p, ingredientes, categorias, conteoPendiente }: { p: ConteoPropuesta; ingredientes: IngLite[]; categorias: CatLite[]; conteoPendiente: boolean }) {
  const router = useRouter();
  const similares = React.useMemo(() => parecidos(p.name, ingredientes, 3), [p.name, ingredientes]);
  const exacto = similares.find((i) => mismoNombre(i.name, p.name)) ?? null;
  const [mode, setMode] = React.useState<"crear" | "unir" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // crear
  const [name, setName] = React.useState(p.name);
  const [unit, setUnit] = React.useState<string>(unidadSugerida(p.unit));
  const [cat, setCat] = React.useState("");
  const [cost, setCost] = React.useState("");
  // unir
  const [target, setTarget] = React.useState(exacto?.id ?? similares[0]?.id ?? "");
  const [qty, setQty] = React.useState(String(p.qty).replace(".", ","));
  const targetIng = ingredientes.find((i) => i.id === target);
  const e = ESTADO[p.status];

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMode(null);
    router.refresh();
  }
  const q = numOf(qty);

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px dashed var(--rule)" }}>
      <div className="flex items-center" style={{ gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
          <div className="cmd-num" style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
            contado: {String(p.qty).replace(".", ",")} {p.unit}{p.note ? ` · “${p.note}”` : ""}
          </div>
        </div>
        <span style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: e.color }}>
          {e.label}{p.status !== "pendiente" && p.status !== "descartado" && p.ingrediente_name ? ` → ${p.ingrediente_name}` : ""}
        </span>
        {p.status === "pendiente" && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <button type="button" className={"cmd-btn sm" + (mode === "crear" ? "" : " ghost")} onClick={() => setMode(mode === "crear" ? null : "crear")} disabled={busy}>Crear ítem</button>
            <button type="button" className={"cmd-btn sm" + (mode === "unir" ? "" : " ghost")} onClick={() => setMode(mode === "unir" ? null : "unir")} disabled={busy || !conteoPendiente} title={conteoPendiente ? undefined : "El conteo ya fue revisado"}>Unir a uno que existe</button>
            <button type="button" className="cmd-btn ghost sm" disabled={busy} onClick={() => { if (window.confirm(`¿Descartar «${p.name}»? No entra al inventario.`)) void run(() => descartarPropuesta({ id: p.id })); }}>Descartar</button>
          </div>
        )}
      </div>

      {p.status === "pendiente" && similares.length > 0 && mode !== "unir" && (
        <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 6 }}>
          Se parece a: {similares.map((i) => i.name).join(" · ")}. Si es lo mismo, únelo en vez de crear otro.
        </div>
      )}

      {mode === "crear" && (
        <form onSubmit={(ev) => { ev.preventDefault(); if (q !== null) void run(() => crearDesdePropuesta({ id: p.id, name, unit, categoryId: cat || null, qty: q, costCop: numOf(cost) ?? 0 })); }} className="flex items-end" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <label style={{ flex: "2 1 200px", fontSize: 10.5, color: "var(--muted)" }}>Nombre en el inventario
            <input value={name} onChange={(ev) => setName(ev.target.value)} maxLength={120} aria-label={`Nombre para ${p.name}`} style={{ ...field, width: "100%", display: "block", marginTop: 3 }} />
          </label>
          <label style={{ flex: "1 1 130px", fontSize: 10.5, color: "var(--muted)" }}>Categoría
            <select value={cat} onChange={(ev) => setCat(ev.target.value)} aria-label={`Categoría de ${p.name}`} style={{ ...field, width: "100%", display: "block", marginTop: 3, padding: "0 4px" }}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label style={{ flex: "0 1 96px", fontSize: 10.5, color: "var(--muted)" }}>Unidad de stock
            <select value={unit} onChange={(ev) => setUnit(ev.target.value)} aria-label={`Unidad de ${p.name}`} style={{ ...field, width: "100%", display: "block", marginTop: 3, padding: "0 4px" }}>
              {UNIDADES_STOCK.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label style={{ flex: "0 1 110px", fontSize: 10.5, color: "var(--muted)" }}>Cantidad ({unit})
            <input value={qty} onChange={(ev) => setQty(ev.target.value)} inputMode="decimal" aria-label={`Cantidad de ${p.name} en ${unit}`} style={{ ...field, width: "100%", display: "block", marginTop: 3, textAlign: "right" }} />
          </label>
          <label style={{ flex: "0 1 120px", fontSize: 10.5, color: "var(--muted)" }}>Costo por {unit} (opc.)
            <input value={cost} onChange={(ev) => setCost(ev.target.value)} inputMode="decimal" placeholder="$" aria-label={`Costo de ${p.name}`} style={{ ...field, width: "100%", display: "block", marginTop: 3, textAlign: "right" }} />
          </label>
          <button type="submit" className="cmd-btn sm" disabled={busy || name.trim().length < 2 || q === null} style={{ height: 38 }}>{busy ? "…" : "Crear"}</button>
          {!(PRESENTACIONES as readonly string[]).includes(unit) || p.unit === unit ? null : (
            <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--muted)" }}>Se contó en «{p.unit}». Si el stock va en {unit}, convierte la cantidad (p. ej. 2 bolsas de 500 g = 1000).</div>
          )}
        </form>
      )}

      {mode === "unir" && (
        <form onSubmit={(ev) => { ev.preventDefault(); if (q !== null && target) void run(() => unirPropuesta({ id: p.id, ingredienteId: target, qty: q })); }} className="flex items-end" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <label style={{ flex: "2 1 240px", fontSize: 10.5, color: "var(--muted)" }}>Es este ítem
            <select value={target} onChange={(ev) => setTarget(ev.target.value)} aria-label={`Ítem existente para ${p.name}`} style={{ ...field, width: "100%", display: "block", marginTop: 3, padding: "0 4px" }}>
              <option value="">Elige…</option>
              {similares.length > 0 && <optgroup label="Parecidos">{similares.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>}
              <optgroup label="Todos">{ingredientes.filter((i) => !similares.includes(i)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
            </select>
          </label>
          <label style={{ flex: "0 1 130px", fontSize: 10.5, color: "var(--muted)" }}>Cantidad ({targetIng?.unit ?? "—"})
            <input value={qty} onChange={(ev) => setQty(ev.target.value)} inputMode="decimal" aria-label={`Cantidad de ${p.name} para unir`} style={{ ...field, width: "100%", display: "block", marginTop: 3, textAlign: "right" }} />
          </label>
          <button type="submit" className="cmd-btn sm" disabled={busy || !target || q === null} style={{ height: 38 }}>{busy ? "…" : "Sumar al conteo"}</button>
          <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--muted)" }}>La cantidad se suma a este conteo como una línea de ese ítem (se contó en «{p.unit}»; escríbela en {targetIng?.unit ?? "su unidad"}).</div>
        </form>
      )}
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
