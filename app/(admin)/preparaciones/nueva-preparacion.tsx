"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UNIDADES_PREPARACION } from "@/lib/inventario/preparaciones";
import { crearPreparacion } from "./actions";

const field: React.CSSProperties = { minHeight: 44, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontSize: 16, outline: "none" };
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--muted)" };

/** «+ Nueva preparación»: name, unit and yield; then the insumo's page to add what one batch takes. */
export function NuevaPreparacion() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [unidad, setUnidad] = React.useState<string>("g");
  const [rinde, setRinde] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await crearPreparacion({ nombre, unidad, rinde: Number(rinde.replace(",", ".")) || 0 });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(`/inventario/${r.id}`);
  }

  if (!open) {
    return (
      <button type="button" className="cmd-btn" onClick={() => setOpen(true)} style={{ minHeight: 44, borderRadius: 12, alignSelf: "flex-start", padding: "0 20px" }}>
        + Nueva preparación
      </button>
    );
  }
  return (
    <form onSubmit={submit} style={{ border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: 16, display: "grid", gap: 12, width: "100%", maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={lbl}>Nombre</span>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej. Cold foam de matcha" style={field} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Se mide en</span>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={field}>
            {UNIDADES_PREPARACION.map((u) => <option key={u} value={u}>{u === "und" ? "unidades" : u}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Sale de una tanda</span>
          <input inputMode="decimal" value={rinde} onChange={(e) => setRinde(e.target.value)} placeholder={unidad === "und" ? "10" : "170"} style={field} />
        </label>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Después agregas los ingredientes de una tanda en la ficha del insumo.</p>
      {error ? <p role="alert" style={{ fontSize: 13, color: "var(--red)", margin: 0 }}>{error}</p> : null}
      <div className="flex" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="cmd-btn ghost" onClick={() => { setOpen(false); setError(null); }} disabled={busy}>Cancelar</button>
        <button type="submit" className="cmd-btn" disabled={busy}>{busy ? "Creando…" : "Crear y agregar ingredientes"}</button>
      </div>
    </form>
  );
}
