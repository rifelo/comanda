"use client";

import * as React from "react";
import { listarPuntos, listarResenas, type PuntosCliente, type ResenaCliente } from "../actions";
import { closePuntos } from "../pos-store";
import { timeAgo } from "@/lib/pos/pending";
import { C, F, H, Overlay } from "./theme";
import { chipStyle } from "./top-bar";
import { personChip } from "./ticket";

// ════════════════════════════════════════════════════════════════
// Puntos — the customers' scoreboard
// ════════════════════════════════════════════════════════════════
export const PUNTOS_REFRESH_MS = 60_000;

/** "hace 3 h", "ayer", "hace 6 días". */
export function visitaAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return timeAgo(iso);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/** Reseñas: what customers said behind the QR on their cup (30 days). */
export function ResenasPanel() {
  const [resenas, setResenas] = React.useState<ResenaCliente[] | null>(null);
  const [loadedAt, setLoadedAt] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState<"todas" | "comentario" | 1 | 2 | 3 | 4 | 5>("todas");
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await listarResenas();
        if (!alive) return;
        if (r.ok) { setResenas(r.resenas); setLoadedAt(Date.now()); setError(null); } else setError(r.error);
      } catch {
        if (alive) setError("Sin conexión: no se pudieron cargar las reseñas.");
      }
    };
    void load();
    const id = window.setInterval(load, PUNTOS_REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const all = resenas ?? [];
  const avg = (rs: ResenaCliente[]) => (rs.length ? (rs.reduce((t, r) => t + r.estrellas, 0) / rs.length).toFixed(1).replace(".", ",") : "—");
  const hace7 = loadedAt - 7 * 86_400_000;
  const semana = all.filter((r) => new Date(r.usadaAt).getTime() >= hace7);
  const shown = all.filter((r) => (filtro === "todas" ? true : filtro === "comentario" ? !!r.sugerencia : r.estrellas === filtro));
  const filtros: { k: typeof filtro; label: string; n: number }[] = [
    { k: "todas", label: "Todas", n: all.length },
    { k: "comentario", label: "Con comentario", n: all.filter((r) => r.sugerencia).length },
    ...([5, 4, 3, 2, 1] as const).map((e) => ({ k: e, label: `${e}★`, n: all.filter((r) => r.estrellas === e).length })),
  ];
  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

  return (
    <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 28px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {error && <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, border: `1.5px solid ${C.red}`, borderRadius: 10, color: C.red, fontSize: 15 }}>{error}</div>}
        {resenas === null && !error && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15 }}>Cargando…</div>}
        {resenas && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {[{ k: "Últimos 7 días", rs: semana }, { k: "Últimos 30 días", rs: all }].map((x) => (
                <div key={x.k} style={{ flex: 1, border: `1px solid ${C.rule}`, borderRadius: 16, background: C.paperLt, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{x.k}</div>
                  <div style={{ ...H, fontSize: 32, lineHeight: 1.1, marginTop: 4 }}>{avg(x.rs)}<span style={{ fontSize: 16 }}> ★</span></div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{x.rs.length} {x.rs.length === 1 ? "calificación" : "calificaciones"}</div>
                </div>
              ))}
            </div>
            <div role="group" aria-label="Filtrar reseñas" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {filtros.map((f) => (
                <button key={String(f.k)} onClick={() => setFiltro(f.k)} aria-pressed={filtro === f.k} style={{ ...personChip(filtro === f.k), height: "max(36px, var(--pos-chip))", padding: "0 12px", fontSize: 14 }}>
                  {f.label} <span style={{ opacity: 0.6 }}>{f.n}</span>
                </button>
              ))}
            </div>
            {all.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15, lineHeight: 1.6 }}>Aún no hay reseñas. Aparecen cuando un cliente escanea el QR de su vaso y califica.</div>}
            {all.length > 0 && shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15 }}>Ninguna reseña con ese filtro.</div>}
            <div aria-label="Reseñas de clientes" role="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shown.map((r) => (
                <article role="listitem" key={r.id} style={{ border: `1.5px solid ${r.estrellas <= 2 ? C.red : C.rule}`, borderRadius: 16, background: C.paperLt, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span aria-label={`${r.estrellas} de 5 estrellas`} style={{ fontSize: 18, letterSpacing: 1, color: r.estrellas <= 2 ? C.red : C.ink }}>{stars(r.estrellas)}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.bebida}</span>
                    <span style={{ fontSize: 13, color: C.muted, marginLeft: "auto" }}>{visitaAgo(r.usadaAt)}</span>
                  </div>
                  {r.sugerencia && <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5, color: C.ink }}>«{r.sugerencia}»</p>}
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                    {[r.cliente, r.instagram ? `@${r.instagram}` : null, r.barista ? `preparó ${r.barista.split(" ")[0]}` : null].filter(Boolean).join(" · ") || "Cliente anónimo"}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PuntosScreen() {
  const [tab, setTab] = React.useState<"clientes" | "resenas">("clientes");
  const [clientes, setClientes] = React.useState<PuntosCliente[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  // Load on open and keep it fresh while it stays on screen.
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await listarPuntos();
        if (!alive) return;
        if (r.ok) { setClientes(r.clientes); setError(null); } else setError(r.error);
      } catch {
        if (alive) setError("Sin conexión: no se pudo cargar la lista de puntos.");
      }
    };
    void load();
    const id = window.setInterval(load, PUNTOS_REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const needle = q.trim().replace(/^@/, "").toLowerCase();
  // Rank on the full list (ties share a place), then filter, so a search keeps each @'s real place.
  const ranked = (clientes ?? []).map((c, i, all) => ({ ...c, rank: all.findIndex((x) => x.puntos === c.puntos) + 1, i }));
  const shown = needle ? ranked.filter((c) => c.instagram.toLowerCase().includes(needle)) : ranked;
  const total = (clientes ?? []).reduce((s, c) => s + c.puntos, 0);
  const medal = (rank: number) => (rank === 1 ? C.amber : rank === 2 ? C.ink2 : rank === 3 ? C.red : null);

  return (
    <Overlay align="fill">
      <div role="region" aria-label="Puntos de clientes" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="pos-hdr pos-ord-hdr">
          <button onClick={closePuntos} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>← Volver</button>
          <span style={{ ...H, fontSize: 22 }}>Puntos<span style={{ color: C.red }}>.</span></span>
          <span role="tablist" aria-label="Puntos o reseñas" style={{ display: "inline-flex", gap: 6 }}>
            {(["clientes", "resenas"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ ...chipStyle, padding: "0 14px", fontSize: 14, border: `1.5px solid ${tab === t ? C.ink : C.rule}`, background: tab === t ? C.ink : "transparent", color: tab === t ? C.paperLt : C.ink }}>
                {t === "clientes" ? "Clientes" : "Reseñas"}
              </button>
            ))}
          </span>
          {tab === "clientes" && clientes && <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>{clientes.length} clientes · {total.toLocaleString("es-CO")} pts</span>}
        </div>
        {tab === "resenas" ? <ResenasPanel /> : (
        <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 28px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div role="search" style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 8px 0 16px", marginBottom: 14, border: `1px solid ${C.rule}`, borderRadius: 16, background: C.paperLt }}>
              <span aria-hidden style={{ fontSize: 20, color: C.muted }}>⌕</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cliente por su @ de Instagram"
                aria-label="Buscar cliente por Instagram"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, height: "100%", border: "none", background: "transparent", color: C.ink, fontFamily: F.mono, fontSize: 17, outline: "none" }}
              />
              {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink2, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>}
            </div>
            {needle && clientes && clientes.length > 0 && shown.length > 0 && <div style={{ fontSize: 13, color: C.muted, margin: "-6px 0 10px 4px" }}>{shown.length} de {clientes.length} clientes</div>}
            {error && <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, border: `1.5px solid ${C.red}`, borderRadius: 10, color: C.red, fontSize: 15 }}>{error}</div>}
            {clientes === null && !error && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15 }}>Cargando…</div>}
            {clientes && clientes.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15, lineHeight: 1.6 }}>Aún no hay clientes con puntos. Se suman cuando el cliente califica desde el QR de su vaso y deja su @.</div>}
            {clientes && clientes.length > 0 && shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 15 }}>Ningún @ coincide con «{q}».</div>}
            {shown.length > 0 && (
              <ol aria-label="Clientes por puntos" style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${C.rule}`, borderRadius: 16, overflow: "hidden", background: C.paperLt }}>
                {shown.map((c) => {
                  const m = medal(c.rank);
                  return (
                    <li key={c.instagram} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: c.i === shown[0].i ? "none" : `1px solid ${C.ruleSoft}` }}>
                      <span className="cmd-num" style={{ width: 38, height: 38, borderRadius: 19, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, border: `1.5px solid ${m ?? C.rule}`, background: m ?? "transparent", color: m ? C.paperLt : C.ink2 }}>{c.rank}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 18, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{c.instagram}</span>
                        <span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 2 }}>Última visita {visitaAgo(c.ultimaVisita)}</span>
                      </span>
                      <span style={{ textAlign: "right", flexShrink: 0 }}>
                        <span className="cmd-num" style={{ ...H, fontSize: 28, lineHeight: 1, color: C.ink }}>{c.puntos.toLocaleString("es-CO")}</span>
                        <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 3 }}>pts</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div style={{ marginTop: 12, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>1 punto por cada $1.000 · se suman al calificar desde el QR del vaso con su @ · se actualiza cada minuto</div>
          </div>
        </div>
        )}
      </div>
    </Overlay>
  );
}
