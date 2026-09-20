"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Ingrediente, IngredienteCategoria, InventarioConteo } from "@/lib/types";
import { posMoney } from "@/lib/pos/types";
import { conteoSummary } from "@/lib/inventario/conteo";
import { guardarListaDiaria } from "./actions";

const STATUS: Record<InventarioConteo["status"], { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "var(--amber)" },
  aprobado: { label: "Aprobado", color: "var(--green)" },
  rechazado: { label: "Rechazado", color: "var(--muted)" },
};
const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

export function ConteosClient({ conteos, ingredientes, categorias }: { conteos: InventarioConteo[]; ingredientes: Ingrediente[]; categorias: IngredienteCategoria[] }) {
  const router = useRouter();
  const [daily, setDaily] = React.useState<Set<string>>(() => new Set(ingredientes.filter((i) => i.conteo_diario).map((i) => i.id)));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const pending = conteos.filter((c) => c.status === "pendiente");

  const toggle = (id: string) => {
    setDaily((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setDirty(true);
  };
  async function save() {
    setSaving(true);
    const r = await guardarListaDiaria({ ids: [...daily] });
    setSaving(false);
    setMsg(r.ok ? `Lista diaria guardada · ${r.count} ítems` : r.error);
    if (r.ok) {
      setDirty(false);
      router.refresh();
    }
  }
  const catLabel = new Map(categorias.map((c) => [c.id, c.label]));
  const groups = [...categorias.map((c) => c.id), null].map((cid) => ({
    label: cid ? catLabel.get(cid) ?? "Otros" : "Sin categoría",
    items: ingredientes.filter((i) => !i.archived && (i.category_id ?? null) === cid).sort((a, b) => a.name.localeCompare(b.name, "es")),
  })).filter((g) => g.items.length);

  return (
    <div style={{ padding: "20px 32px 48px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 32, fontFamily: "var(--font-mono)" }}>
      <section style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Conteos {pending.length > 0 && <span style={{ color: "var(--amber)" }}>· {pending.length} por aprobar</span>}
        </div>
        {conteos.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>Todavía no hay conteos. El equipo los envía desde el tablet, en Turno → Conteo.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conteos.map((c) => {
            const s = conteoSummary(c.items);
            const st = STATUS[c.status];
            return (
              <Link key={c.id} href={`/inventario/conteos/${c.id}`} style={{ textDecoration: "none", color: "var(--ink)", border: `1.5px solid ${c.status === "pendiente" ? "var(--ink)" : "var(--rule)"}`, borderRadius: 6, padding: "12px 14px", background: "var(--paper-lt)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: st.color, border: `1px solid ${st.color}`, padding: "3px 7px", borderRadius: 3 }}>{st.label}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{c.kind === "diario" ? "Conteo diario" : "Conteo completo"} · {fecha(c.submitted_at)}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{c.counted_by_name ?? "—"} · {s.lines} ítems · {s.withDiff} con diferencia</span>
                </span>
                <span className="cmd-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: s.shortValue ? "var(--red)" : "var(--green)" }}>
                  {s.shortValue ? `−${posMoney(s.shortValue)}` : "cuadra"}
                  {s.overValue ? <span style={{ display: "block", color: "var(--amber)", fontWeight: 400, fontSize: 11 }}>+{posMoney(s.overValue)}</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Lista diaria · {daily.size} ítems</div>
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 12px" }}>Lo que se cuenta en cada cierre. Deja aquí lo caro y lo que más rota; el resto entra en el conteo completo semanal.</p>
        <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>{g.label}</div>
              {g.items.map((i) => (
                <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={daily.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Diario: ${i.name}`} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{i.unit}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button type="button" className="cmd-btn" onClick={() => void save()} disabled={!dirty || saving}>{saving ? "Guardando…" : "Guardar lista"}</button>
          {msg && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{msg}</span>}
        </div>
      </aside>
    </div>
  );
}
