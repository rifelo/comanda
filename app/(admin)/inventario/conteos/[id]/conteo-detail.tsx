"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { InventarioConteo } from "@/lib/types";
import { posMoney } from "@/lib/pos/types";
import { conteoSummary, lineDiff } from "@/lib/inventario/conteo";
import { aprobarConteo, rechazarConteo } from "../actions";

const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

export function ConteoDetail({ conteo }: { conteo: InventarioConteo }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"aprobar" | "rechazar" | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const s = conteoSummary(conteo.items);
  const pending = conteo.status === "pendiente";

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

      {pending && (
        <div style={{ marginTop: 22, border: "1.5px solid var(--ink)", borderRadius: 8, padding: "16px 18px", background: "var(--paper-lt)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Aprobar aplica {s.withDiff} ajuste{s.withDiff === 1 ? "" : "s"} contra lo que el sistema esperaba en el momento del conteo; las ventas posteriores ya están descontadas. Rechazar no mueve nada.
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Nota de revisión (opcional): recontar la leche, etc." aria-label="Nota de revisión" style={{ height: 40, padding: "0 10px", border: "1px solid var(--rule)", borderRadius: 3, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="cmd-btn" onClick={() => void act("aprobar")} disabled={!!busy} style={{ height: 44 }}>{busy === "aprobar" ? "Aplicando…" : s.withDiff ? "Aprobar y ajustar inventario" : "Aprobar (sin ajustes)"}</button>
            <button type="button" className="cmd-btn ghost" onClick={() => void act("rechazar")} disabled={!!busy} style={{ height: 44 }}>{busy === "rechazar" ? "…" : "Rechazar"}</button>
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
