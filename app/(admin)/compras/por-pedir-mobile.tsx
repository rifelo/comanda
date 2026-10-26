"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/comanda/primitives";
import { ajustar, qtyLegible, vistaMensaje, type PorPedirGrupo } from "@/lib/compras/por-pedir";
import type { NivelItem } from "@/lib/inventario/niveles";
import { descartarSugerencia } from "../inventario/sugerencias/actions";
import { armarPedido, nuevoALista, recibirRapido } from "./actions";

export interface NuevoView {
  id: string;
  nombre: string;
  estado: "bajo" | "agotado" | null;
  meta: string;
  nota: string | null;
}
export interface CaminoView {
  id: string;
  nombre: string;
  qty: string;
  meta: string;
}
export type ItemUnidad = NivelItem & { unit: string };

const CSS = `
.pp { --pp-poco: #f1a900; --pp-agot: #c8321e; --pp-ok: #2f7a3e; --pp-ok-ink: #24582d;
  --pp-row: color-mix(in srgb, #fffdf7 70%, var(--paper-lt));
  --pp-row-agot: color-mix(in srgb, var(--pp-agot) 16%, var(--paper-lt));
  --pp-camino: color-mix(in srgb, #502b1c 9%, var(--paper-lt));
  background: var(--paper-lt); color: var(--ink); font-family: var(--font-mono), ui-monospace, monospace; display: flex; flex-direction: column; }
.pp button { font-family: inherit; color: inherit; cursor: pointer; }
.pp button:focus-visible { outline: 3px solid var(--pp-poco); outline-offset: 2px; }
.pp-head { padding: 18px 16px 16px; background: var(--paper); border-bottom: 1.5px solid var(--ink); display: flex; flex-direction: column; gap: 12px; }
.pp-sum { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1.5px solid var(--ink); border-radius: 6px; background: var(--paper-lt); }
.pp-main { flex: 1; padding: 16px 16px 28px; display: flex; flex-direction: column; gap: 16px; }
.pp-card { border: 1.5px solid var(--ink); border-radius: 8px; background: var(--pp-row); overflow: hidden; }
.pp-card.nuevo { border-style: dashed; }
.pp-cardhead { padding: 12px 14px; background: var(--paper); border-bottom: 1.5px solid var(--ink); }
.pp-h2 { margin: 0; font-weight: 400; font-size: 16px; line-height: 1.2; }
.pp-line { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1.5px solid color-mix(in srgb, var(--ink) 12%, transparent); }
.pp-line[data-marca="agotado"] { background: var(--pp-row-agot); }
.pp-tag { align-self: flex-start; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 800; letter-spacing: .04em; border: 1.5px solid var(--ink); }
.pp-step { display: flex; align-items: center; border: 1.5px solid var(--ink); border-radius: 5px; overflow: hidden; background: var(--paper-lt); }
.pp-step button { width: 44px; height: 48px; border: none; background: transparent; font-size: 20px; font-weight: 700; }
.pp-step span { min-width: 34px; text-align: center; font-size: 16px; font-weight: 800; padding: 0 2px; }
.pp-msg { margin: 0; padding: 10px 12px; border-radius: 6px; background: var(--paper); font-size: 12px; line-height: 1.45; color: var(--ink-2); white-space: pre-line; }
.pp-solid { min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 10px; border: 1.5px solid var(--ink); border-radius: 6px; background: var(--ink); color: var(--paper-lt) !important; font-size: 15px; font-weight: 800; }
.pp-solid:disabled { opacity: .4; cursor: default; }
.pp-prov { min-height: 48px; padding: 4px 8px; border: 1.5px solid var(--ink); border-radius: 5px; background: var(--paper-lt); font-size: 12px; font-weight: 700; line-height: 1.2; }
.pp-prov[aria-pressed="true"] { background: var(--ink); color: var(--paper-lt); }
.pp-camino { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border: 1.5px solid var(--ink); border-radius: 6px; background: var(--pp-camino); }
.pp-recibido { min-height: 48px; padding: 0 12px; border: 1.5px solid var(--ink); border-radius: 5px; background: var(--pp-ok); color: #fff !important; font-size: 13px; font-weight: 800; }
.pp-error { border: 1.5px solid var(--pp-agot); border-radius: 6px; padding: 10px 12px; font-size: 13px; font-weight: 700; color: #a3261a; background: var(--pp-row-agot); }
.pp-flash { border: 1.5px solid var(--pp-ok); border-radius: 6px; padding: 10px 12px; font-size: 13px; font-weight: 700; color: var(--pp-ok-ink); background: color-mix(in srgb, var(--pp-ok) 10%, var(--paper-lt)); }
`;

const Camion = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#502b1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
);
const WhatsApp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-5.2A8.5 8.5 0 1 1 21 11.5z" /></svg>
);

/**
 * «Por pedir» on the owner's phone (the md:hidden layer of /compras): what
 * the team marked on the tablet, by supplier, each with a quantity to nudge
 * and the WhatsApp ready; the orders on their way with «Recibido»; and what
 * the team added that is not on the list yet.
 */
export function PorPedirMobile({ negocio, hora, grupos, unidades, nuevos, camino, recibidosHoy, proveedores, total, agotados }: {
  negocio: string;
  hora: string;
  grupos: PorPedirGrupo[];
  /** Per ingredient: how its quantity is said. */
  unidades: Record<string, ItemUnidad>;
  nuevos: NuevoView[];
  camino: CaminoView[];
  recibidosHoy: { id: string; nombre: string }[];
  proveedores: { id: string; name: string }[];
  total: number;
  agotados: number;
}) {
  const router = useRouter();
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [provDe, setProvDe] = React.useState<Record<string, string | null>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [copiar, setCopiar] = React.useState<{ proveedor: string; mensaje: string } | null>(null);

  const cant = (key: string, base: number) => qty[key] ?? base;
  const legible = (ingredienteId: string | null, q: number) => qtyLegible(q, ingredienteId ? unidades[ingredienteId] : undefined);

  async function pedir(g: PorPedirGrupo) {
    if (busy) return;
    setError(null);
    setBusy(`pedir:${g.proveedorId ?? ""}`);
    // Opened in the tap itself: a window opened after an await is blocked on phones.
    const w = g.whatsapp ? window.open("", "_blank") : null;
    try {
      const res = await armarPedido({ proveedorId: g.proveedorId, lineas: g.lineas.map((l) => ({ key: l.key, qty: cant(l.key, l.qty) })) });
      if (!res.ok) {
        w?.close();
        setError(res.error);
        return;
      }
      if (w && res.wa) w.location.href = res.wa;
      else {
        w?.close();
        setCopiar({ proveedor: g.nombre, mensaje: res.mensaje });
      }
      setFlash(`Pedido n.º ${res.folio} a ${g.nombre}: quedó en camino.`);
      router.refresh();
    } catch {
      w?.close();
      setError("No se pudo crear el pedido. Revisa el internet.");
    } finally {
      setBusy(null);
    }
  }

  async function recibir(c: CaminoView) {
    if (busy) return;
    setError(null);
    setBusy(`rec:${c.id}`);
    try {
      const res = await recibirRapido(c.id);
      if (res.ok) {
        setFlash(`✓ ${c.nombre} · volvió a Hay en la tablet.`);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No se pudo marcar como recibido. Revisa el internet.");
    } finally {
      setBusy(null);
    }
  }

  async function agregar(n: NuevoView) {
    if (busy || !(n.id in provDe)) return;
    setError(null);
    setBusy(`nuevo:${n.id}`);
    try {
      const res = await nuevoALista({ sugerenciaId: n.id, proveedorId: provDe[n.id] });
      if (res.ok) {
        setFlash(`«${n.nombre}» ya está en la lista y en Por pedir.`);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No se pudo agregar. Revisa el internet.");
    } finally {
      setBusy(null);
    }
  }

  async function descartar(n: NuevoView) {
    if (busy) return;
    setError(null);
    setBusy(`desc:${n.id}`);
    try {
      const res = await descartarSugerencia({ id: n.id });
      if (res.ok) router.refresh();
      else setError(res.error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pp">
      <style>{CSS}</style>
      <header className="pp-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Wordmark size={24} />
          <h1 className="font-slab" style={{ margin: 0, flex: 1, fontWeight: 400, fontSize: 28, lineHeight: 1 }}>Por pedir</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{hora}</span>
        </div>
        <div className="pp-sum" role="status" aria-live="polite">
          <span className="cmd-num" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{total}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{total === 1 ? "insumo por pedir" : "insumos por pedir"}</span>
          {agotados > 0 && <span style={{ padding: "5px 8px", borderRadius: 4, background: "var(--pp-agot)", color: "#fff", fontSize: 12, fontWeight: 800 }}>{agotados} AGOTADO</span>}
        </div>
      </header>

      <main className="pp-main">
        {error && <div className="pp-error" role="alert">{error}</div>}
        {flash && <div className="pp-flash" role="status">{flash}</div>}
        {copiar && (
          <div className="pp-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{copiar.proveedor} no tiene WhatsApp guardado. Copia el mensaje:</span>
            <p className="pp-msg">{copiar.mensaje}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pp-solid" style={{ flex: 1 }} onClick={() => { void navigator.clipboard?.writeText(copiar.mensaje); setCopiar(null); }}>Copiar mensaje</button>
              <button type="button" className="pp-prov" onClick={() => setCopiar(null)}>Cerrar</button>
            </div>
          </div>
        )}

        {total === 0 && (
          <div style={{ padding: "28px 16px", border: "1.5px solid var(--ink)", borderRadius: 8, background: "color-mix(in srgb, var(--pp-ok) 12%, var(--paper-lt))", textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="font-slab" style={{ fontSize: 22, color: "var(--pp-ok-ink)" }}>Todo en orden ✓</span>
            <span style={{ fontSize: 13 }}>Nadie ha marcado nada en poco ni agotado.</span>
          </div>
        )}

        {nuevos.map((n) => {
          const elegido = n.id in provDe;
          return (
            <section key={n.id} className="pp-card nuevo" aria-label={`Nuevo: ${n.nombre}`}>
              <div style={{ padding: "12px 14px", background: "var(--pp-row-agot)", borderBottom: "1.5px dashed var(--ink)", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ alignSelf: "flex-start", padding: "2px 6px", borderRadius: 3, fontSize: 11, fontWeight: 800, letterSpacing: ".04em", background: "var(--ink)", color: "var(--paper-lt)" }}>NUEVO · NO ESTÁ EN LA LISTA</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{n.nombre}</span>
                <span style={{ fontSize: 12, color: "#a3261a", fontWeight: 700 }}>{n.meta}</span>
                {n.nota && <span style={{ fontSize: 12, color: "var(--ink-2)" }}>“{n.nota}”</span>}
              </div>
              <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: "var(--muted)" }}>¿A QUIÉN SE LO PIDES?</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  {[...proveedores, { id: "", name: "Otro proveedor" }].map((p) => {
                    const v = p.id || null;
                    return (
                      <button key={p.id || "otro"} type="button" className="pp-prov" aria-pressed={elegido && provDe[n.id] === v} onClick={() => setProvDe((m) => ({ ...m, [n.id]: v }))}>{p.name}</button>
                    );
                  })}
                </div>
                <button type="button" className="pp-solid" disabled={!elegido || !!busy} onClick={() => void agregar(n)}>{busy === `nuevo:${n.id}` ? "Agregando…" : "Agregar a la lista y pedir"}</button>
                <button type="button" onClick={() => void descartar(n)} disabled={!!busy} style={{ minHeight: 48, border: "none", background: "transparent", color: "var(--muted)", fontSize: 13, textDecoration: "underline" }}>Ya lo tenemos con otro nombre · descartar</button>
              </div>
            </section>
          );
        })}

        {grupos.map((g) => {
          const lineas = g.lineas.map((l) => ({ nombre: l.nombre, cantidad: legible(l.ingredienteId, cant(l.key, l.qty)) }));
          return (
            <section key={g.proveedorId ?? "sin"} className="pp-card" aria-label={g.nombre}>
              <div className="pp-cardhead">
                <h2 className="pp-h2 font-slab">{g.nombre}</h2>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{g.lineas.length} {g.lineas.length === 1 ? "insumo" : "insumos"}{g.agotados ? ` · ${g.agotados} agotado` : ""}</span>
              </div>
              {g.lineas.map((l) => {
                const q = cant(l.key, l.qty);
                return (
                  <div key={l.key} className="pp-line" data-marca={l.marca}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span className="pp-tag" style={{ background: l.marca === "agotado" ? "var(--pp-agot)" : "var(--pp-poco)", color: l.marca === "agotado" ? "#fff" : "#1f1a14" }}>{l.marca === "agotado" ? "AGOTADO" : "POCO"}</span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{l.nombre}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{l.meta}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div className="pp-step">
                        <button type="button" aria-label={`Menos ${l.nombre}`} onClick={() => setQty((m) => ({ ...m, [l.key]: ajustar(q, l.paso, -1) }))}>−</button>
                        <span className="cmd-num">{legible(l.ingredienteId, q).split(" ")[0]}</span>
                        <button type="button" aria-label={`Más ${l.nombre}`} onClick={() => setQty((m) => ({ ...m, [l.key]: ajustar(q, l.paso, 1) }))}>+</button>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{legible(l.ingredienteId, q).split(" ").slice(1).join(" ")} · sugerido</span>
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <p className="pp-msg">{vistaMensaje(negocio, lineas)}</p>
                <button type="button" className="pp-solid" disabled={!!busy} onClick={() => void pedir(g)}>
                  <WhatsApp />
                  {busy === `pedir:${g.proveedorId ?? ""}` ? "Creando pedido…" : g.whatsapp ? "Pedir por WhatsApp" : "Registrar pedido"}
                </button>
              </div>
            </section>
          );
        })}

        {camino.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }} aria-label="En camino">
            <h2 className="font-slab" style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, fontWeight: 400, fontSize: 18 }}>En camino <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>{camino.length}</span></h2>
            {camino.map((c) => (
              <div key={c.id} className="pp-camino">
                <Camion />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.nombre} <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {c.qty}</span></span>
                  <span style={{ fontSize: 11, color: "#502b1c" }}>{c.meta}</span>
                </div>
                <button type="button" className="pp-recibido" disabled={!!busy} onClick={() => void recibir(c)}>{busy === `rec:${c.id}` ? "…" : "Recibido"}</button>
              </div>
            ))}
          </section>
        )}

        {recibidosHoy.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label="Recibido hoy">
            <h2 className="font-slab" style={{ margin: 0, fontWeight: 400, fontSize: 14, color: "var(--pp-ok-ink)" }}>Recibido hoy</h2>
            {recibidosHoy.map((r) => (
              <div key={r.id} style={{ fontSize: 12, color: "var(--pp-ok-ink)", padding: "4px 0" }}>✓ {r.nombre} · volvió a Hay</div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
