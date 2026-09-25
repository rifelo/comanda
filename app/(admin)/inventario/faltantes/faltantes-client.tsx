"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import { ESTADOS, PRIORIDADES } from "@/lib/inventario/faltantes";
import type { FaltanteReporte } from "@/lib/inventario/faltantes-db";
import { formatTime } from "@/lib/utils";
import { FaltantesCard } from "@/components/inventario/faltantes-card";
import { guardarPrioridades } from "./actions";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaHora(iso: string, tz: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [, m, dd] = day.split("-").map(Number);
  return `${dd} ${MESES[m - 1]} ${formatTime(iso, tz)}`;
}

export function FaltantesClient({ abiertos, recientes, ingredientes, categorias, tz }: {
  abiertos: FaltanteReporte[];
  recientes: FaltanteReporte[];
  ingredientes: Ingrediente[];
  categorias: IngredienteCategoria[];
  tz: string;
}) {
  const router = useRouter();
  const [prio, setPrio] = React.useState<Record<string, number>>(() => Object.fromEntries(ingredientes.map((i) => [i.id, i.prioridad ?? 0])));
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const set = (id: string, p: number) => {
    setPrio((s) => ({ ...s, [id]: p }));
    setDirty((d) => new Set(d).add(id));
    setMsg(null);
  };
  async function save() {
    setSaving(true);
    const r = await guardarPrioridades({ items: [...dirty].map((id) => ({ id, prioridad: prio[id] ?? 0 })) });
    setSaving(false);
    setMsg(r.ok ? `Lista guardada · ${Object.values(prio).filter((p) => p > 0).length} ítems prioritarios` : r.error);
    if (r.ok) {
      setDirty(new Set());
      router.refresh();
    }
  }

  const catLabel = new Map(categorias.map((c) => [c.id, c.label]));
  const needle = q.trim().toLowerCase();
  const groups = [...categorias.map((c) => c.id), null]
    .map((cid) => ({
      label: cid ? catLabel.get(cid) ?? "Otros" : "Sin categoría",
      items: ingredientes
        .filter((i) => !i.archived && (i.category_id ?? null) === cid && (!needle || i.name.toLowerCase().includes(needle)))
        .sort((a, b) => (prio[a.id] > 0 ? 0 : 1) - (prio[b.id] > 0 ? 0 : 1) || a.name.localeCompare(b.name, "es")),
    }))
    .filter((g) => g.items.length);
  const enLista = Object.values(prio).filter((p) => p > 0).length;

  return (
    <div style={{ padding: "20px 32px 48px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: 32, fontFamily: "var(--font-mono)" }}>
      <section style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Faltantes abiertos {abiertos.length > 0 && <span style={{ color: "var(--red)" }}>· {abiertos.length}</span>}
        </div>
        <FaltantesCard items={abiertos} tz={tz} showLink={false} />

        <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", margin: "28px 0 6px" }}>Últimos reportes</div>
        {recientes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Todavía no hay reportes. El equipo los envía desde el tablet, en Turno → Faltantes.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px 6px 0", fontWeight: 500 }}>Cuándo</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Ítem</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Estado</th>
                <th style={{ padding: "6px 8px", fontWeight: 500 }}>Reportó</th>
                <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Sistema</th>
                <th style={{ padding: "6px 0 6px 8px", fontWeight: 500 }}>Resuelto</th>
              </tr>
            </thead>
            <tbody>
              {recientes.map((f) => {
                const e = ESTADOS[f.estado];
                return (
                  <tr key={f.id} style={{ borderTop: "1px solid var(--rule-soft, var(--rule))", opacity: f.resolved_at && f.estado !== "ok" ? 0.7 : 1 }}>
                    <td className="cmd-num" style={{ padding: "7px 8px 7px 0", whiteSpace: "nowrap" }}>{fechaHora(f.reported_at, tz)}</td>
                    <td style={{ padding: "7px 8px" }}>
                      {f.ingrediente_name}
                      {f.note && <span className="text-muted"> · “{f.note}”</span>}
                    </td>
                    <td style={{ padding: "7px 8px" }}><span style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: e.color, fontWeight: 700 }}>{e.short}</span></td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{f.reported_by_name ?? "—"}</td>
                    <td className="cmd-num" style={{ padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{f.stock_sistema != null ? `${f.stock_sistema} ${f.unit}` : "—"}</td>
                    <td className="text-muted" style={{ padding: "7px 0 7px 8px", whiteSpace: "nowrap" }}>
                      {f.estado === "ok" ? "—" : f.resolved_at ? `${fechaHora(f.resolved_at, tz)}${f.resolved_by_name ? ` · ${f.resolved_by_name}` : ""}${f.resolved_note ? ` · ${f.resolved_note}` : ""}` : <span style={{ color: "var(--amber)" }}>abierto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <aside>
        <div style={{ position: "sticky", top: 16, border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: 16 }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>Lista prioritaria · {enLista}</div>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "6px 0 10px" }}>
            Lo que el barista ve en Turno → Faltantes, del más crítico al menos. Los demás ingredientes quedan fuera de la revisión rápida.
          </p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ingrediente…" aria-label="Buscar ingrediente" style={{ width: "100%", height: 34, padding: "0 8px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none", marginBottom: 8 }} />
          <div style={{ maxHeight: "56vh", overflowY: "auto", paddingRight: 4 }}>
            {groups.map((g) => (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", padding: "4px 0", borderBottom: "1px dashed var(--rule)" }}>{g.label}</div>
                {g.items.map((i) => {
                  const p = prio[i.id] ?? 0;
                  return (
                    <div key={i.id} className="flex items-center" style={{ gap: 8, padding: "6px 0", borderBottom: "1px dashed var(--rule-soft, var(--rule))" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: p > 0 ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                      <select
                        value={p}
                        onChange={(e) => set(i.id, Number(e.target.value))}
                        aria-label={`Prioridad de ${i.name}`}
                        style={{ height: 30, border: `1px solid ${p === 1 ? "var(--red)" : p === 2 ? "var(--amber)" : "var(--rule)"}`, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "0 4px" }}
                      >
                        <option value={0}>— fuera</option>
                        {PRIORIDADES.map((x) => (
                          <option key={x.value} value={x.value}>{x.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="cmd-btn sm" disabled={dirty.size === 0 || saving} onClick={() => void save()}>{saving ? "Guardando…" : dirty.size ? `Guardar (${dirty.size})` : "Guardar"}</button>
            {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("Lista") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
          </div>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
            {PRIORIDADES.map((x) => (
              <li key={x.value}><b style={{ color: x.value === 1 ? "var(--red)" : x.value === 2 ? "var(--amber)" : "var(--ink-2)" }}>{x.label}</b> · {x.hint}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
