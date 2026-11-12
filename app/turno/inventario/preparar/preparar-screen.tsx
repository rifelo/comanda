"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTandas } from "@/lib/inventario/preparaciones";
import { registrarTanda } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "inherit", background: "transparent", cursor: "pointer" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--paper-lt)", padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const stepBtn: React.CSSProperties = { ...chip, width: 52, height: 52, justifyContent: "center", fontSize: 20 };

interface Prep { id: string; name: string; rinde: string; lineas: string[] }

export function PrepararScreen({ preparaciones, hoy }: {
  preparaciones: Prep[];
  hoy: { id: string; texto: string; quien: string | null; hora: string }[];
}) {
  const router = useRouter();
  const [tandas, setTandas] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ id: string; msg: string } | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const n = (id: string) => tandas[id] ?? 1;
  const step = (id: string, d: number) => setTandas((t) => ({ ...t, [id]: Math.max(0.5, Math.min(10, (t[id] ?? 1) + d)) }));

  async function registrar(p: Prep) {
    if (busy) return;
    setBusy(p.id);
    setError(null);
    setOk(null);
    const cuantas = n(p.id);
    const r = await registrarTanda({ id: p.id, tandas: cuantas });
    setBusy(null);
    if (!r.ok) return setError({ id: p.id, msg: r.error });
    setOk(`Listo: ${fmtTandas(cuantas)} ${cuantas === 1 ? "tanda" : "tandas"} de ${p.name}. Ya se descontaron los ingredientes.`);
    setTandas((t) => ({ ...t, [p.id]: 1 }));
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100%", display: "flex", flexDirection: "column", fontFamily: "inherit", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid var(--line)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <Link href="/turno/inventario" style={chip}>← Inventario</Link>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <section aria-label="Preparaciones">
          <div style={kicker}>Cuando termines una tanda, regístrala aquí</div>
          {ok && <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</p>}
          {preparaciones.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>Todavía no hay preparaciones. El dueño las crea en el panel, en la ficha del insumo.</p>}
          <div style={{ display: "grid", gap: 14, marginTop: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {preparaciones.map((p) => (
              <article key={p.id} style={card} aria-labelledby={`prep-${p.id}`}>
                <div>
                  <h2 id={`prep-${p.id}`} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Una tanda rinde {p.rinde}</div>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  {p.lineas.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => step(p.id, -0.5)} aria-label="Media tanda menos" style={stepBtn}>−</button>
                  <span className="cmd-num" aria-live="polite" style={{ minWidth: 90, textAlign: "center", fontSize: 16, fontWeight: 700 }}>
                    {fmtTandas(n(p.id))} {n(p.id) === 1 ? "tanda" : "tandas"}
                  </span>
                  <button type="button" onClick={() => step(p.id, 0.5)} aria-label="Media tanda más" style={stepBtn}>+</button>
                </div>
                <button type="button" className="cmd-btn" disabled={busy !== null} onClick={() => registrar(p)} style={{ height: 52, fontSize: 13 }}>
                  {busy === p.id ? "Registrando…" : "Registrar tanda"}
                </button>
                {error?.id === p.id && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error.msg}</p>}
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Tandas de hoy">
          <div style={kicker}>Hoy · {hoy.length} {hoy.length === 1 ? "tanda" : "tandas"}</div>
          {hoy.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Nada preparado hoy.</div>}
          {hoy.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span className="cmd-num" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{t.hora}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{t.texto}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{t.quien ?? "—"}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
