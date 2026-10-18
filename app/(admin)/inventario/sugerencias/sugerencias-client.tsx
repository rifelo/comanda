"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ZONAS } from "@/lib/inventario/niveles";
import { parecidos, unidadSugerida, UNIDADES_STOCK } from "@/lib/inventario/propuestas";
import { aplicarUbicacion, crearDesdeSugerencia, descartarSugerencia, unirSugerencia, type SugerenciaResult } from "./actions";

export interface SugerenciaView {
  id: string;
  zona: string;
  tipo: "ubicacion" | "nuevo";
  nombre: string;
  ubicacionActual: string | null;
  presentacion: string | null;
  nota: string | null;
  status: "pendiente" | "aplicada" | "descartada";
  resultado: string | null;
  quien: string | null;
  fecha: string;
}

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const input: React.CSSProperties = { height: 38, padding: "0 10px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13.5, outline: "none", minWidth: 0 };

export function SugerenciasClient({ sugerencias, items, categorias }: {
  sugerencias: SugerenciaView[];
  items: { id: string; name: string; ubicacion: string | null }[];
  categorias: { id: string; label: string }[];
}) {
  const abiertas = sugerencias.filter((s) => s.status === "pendiente");
  const resueltas = sugerencias.filter((s) => s.status !== "pendiente").slice(0, 20);
  const porZona = ZONAS.map((z) => ({ zona: z, rows: abiertas.filter((s) => s.zona === z) })).filter((g) => g.rows.length);
  return (
    <div style={{ padding: "20px 16px 48px", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26, fontFamily: "var(--font-mono)" }} className="md:px-8">
      <section aria-label="Por revisar">
        <div style={label}>Por revisar · {abiertas.length}</div>
        {abiertas.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Nada por revisar. El equipo sugiere desde la tablet (Inventario → Sugerir ítems) lo que va en cada sección o lo que falta en la lista.</p>}
        {porZona.map((g) => (
          <div key={g.zona} style={{ marginTop: 14 }}>
            <div className="font-slab" style={{ fontSize: 20, marginBottom: 6 }}>{g.zona}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.rows.map((s) => <Abierta key={s.id} s={s} items={items} categorias={categorias} />)}
            </div>
          </div>
        ))}
      </section>
      {resueltas.length > 0 && (
        <section aria-label="Resueltas">
          <div style={label}>Resueltas hace poco</div>
          {resueltas.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--rule)", fontSize: 12.5 }}>
              <span style={{ minWidth: 70, fontWeight: 700 }}>{s.zona}</span>
              <span style={{ flex: 1 }}>{s.tipo === "ubicacion" ? `${s.nombre} va aquí` : `Faltaba: ${s.nombre}`}{s.resultado && s.status === "aplicada" ? ` → ${s.resultado}` : ""}</span>
              <span style={{ color: s.status === "aplicada" ? "var(--green)" : "var(--muted)" }}>{s.status === "aplicada" ? "aplicada" : "descartada"}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Abierta({ s, items, categorias }: { s: SugerenciaView; items: { id: string; name: string; ubicacion: string | null }[]; categorias: { id: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState(s.nombre);
  const [unit, setUnit] = React.useState<string>(unidadSugerida(s.presentacion ?? "und"));
  const [cat, setCat] = React.useState<string>("");
  const [unir, setUnir] = React.useState<string>("");
  const similares = React.useMemo(() => (s.tipo === "nuevo" ? parecidos(s.nombre, items, 5) : []), [s, items]);

  async function run(fn: () => Promise<SugerenciaResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div style={{ border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{s.tipo === "ubicacion" ? `«${s.nombre}» va en ${s.zona}` : `Falta en la lista: «${s.nombre}»`}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {s.tipo === "ubicacion" ? `hoy: ${s.ubicacionActual ?? "sin sección"} · ` : s.presentacion ? `viene en ${s.presentacion} · ` : ""}{s.quien ?? "—"} · {s.fecha}
        </span>
      </div>
      {s.nota && <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>«{s.nota}»</div>}
      <div className="flex" style={{ gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        {s.tipo === "ubicacion" ? (
          <button type="button" className="cmd-btn sm" disabled={busy} onClick={() => void run(() => aplicarUbicacion({ id: s.id }))}>Mover a {s.zona}</button>
        ) : (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label={`Nombre de ${s.nombre}`} style={{ ...input, flex: "2 1 220px" }} />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad" style={{ ...input, width: 110 }}>
              {UNIDADES_STOCK.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría" style={{ ...input, width: 150 }}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button type="button" className="cmd-btn sm" disabled={busy} onClick={() => void run(() => crearDesdeSugerencia({ id: s.id, name: name.trim(), unit, categoryId: cat || null }))}>Crear en {s.zona}</button>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>o es</span>
            <select value={unir} onChange={(e) => setUnir(e.target.value)} aria-label="Unir con" style={{ ...input, width: 220 }}>
              <option value="">un ítem que ya existe…</option>
              {similares.map((i) => <option key={i.id} value={i.id}>★ {i.name}</option>)}
              {items.filter((i) => !similares.some((x) => x.id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {unir && <button type="button" className="cmd-btn ghost sm" disabled={busy} onClick={() => void run(() => unirSugerencia({ id: s.id, ingredienteId: unir }))}>Unir y mover a {s.zona}</button>}
          </>
        )}
        <button type="button" className="cmd-btn ghost sm" disabled={busy} onClick={() => void run(() => descartarSugerencia({ id: s.id }))} style={{ marginLeft: "auto" }}>Descartar</button>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
