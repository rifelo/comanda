"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Motivo } from "@/lib/compras/compras";
import { parseCount } from "@/lib/inventario/conteo";
import { NIVELES, type Nivel } from "@/lib/inventario/niveles";
import { tokens } from "@/lib/inventario/propuestas";
import { pedirAlgo } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const MOTIVO: Record<Motivo, string> = { nivel: "por nivel", faltante: "reportado", solicitud: "pedido por el equipo" };

interface Item { id: string; name: string; /** What its quantity is typed in ("bolsas", "g"). */ enQue: string }

export function PedirScreen({ sedeName, lineas, items, solicitudes }: {
  sedeName: string;
  lineas: { key: string; nombre: string; nivel: Nivel | null; legible: string | null; motivos: Motivo[]; proveedor: string | null }[];
  items: Item[];
  solicitudes: { id: string; nombre: string; cantidad: string | null; note: string | null; quien: string | null }[];
}) {
  const router = useRouter();
  const [texto, setTexto] = React.useState("");
  const [elegido, setElegido] = React.useState<Item | null>(null);
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // Items whose name has every word typed, so "leche" finds the bag and the cream.
  const parecidos = React.useMemo(() => {
    const t = tokens(texto);
    if (elegido || !t.length) return [];
    return items.filter((i) => { const n = tokens(i.name); return t.every((w) => n.some((x) => x.startsWith(w))); }).slice(0, 6);
  }, [texto, elegido, items]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const nombre = texto.trim();
    if (!elegido && nombre.length < 2) return setError("Escribe qué hace falta.");
    const n = qty.trim() ? parseCount(qty) : null;
    if (qty.trim() && (n === null || n <= 0)) return setError("La cantidad no es un número.");
    setBusy(true);
    setError(null);
    const r = await pedirAlgo({ ingredienteId: elegido?.id, nombre: elegido ? undefined : nombre, qty: n ?? undefined, note: note.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(`Listo: «${elegido?.name ?? nombre}» quedó en la lista del dueño.`);
    setTexto("");
    setElegido(null);
    setQty("");
    setNote("");
    router.refresh();
  }

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Pedir<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <Link href="/turno/inventario" style={{ ...chip, marginLeft: "auto" }}>← Inventario</Link>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <section aria-label="Pedir algo más">
          <div style={kicker}>Pedir algo más</div>
          <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {elegido ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 12px", border: "1.5px solid var(--ink)", borderRadius: 4, background: "var(--paper-lt)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{elegido.name}</span>
                <button type="button" onClick={() => setElegido(null)} style={{ ...chip, height: 34 }}>Cambiar</button>
              </div>
            ) : (
              <input value={texto} onChange={(e) => { setTexto(e.target.value); setOk(null); }} placeholder="¿Qué hace falta? (leche, jabón de loza, vasos…)" aria-label="Qué hace falta" maxLength={80} style={{ ...field, width: "100%" }} />
            )}
            {parecidos.length > 0 && (
              <div role="group" aria-label="Ítems del inventario" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {parecidos.map((i) => (
                  <button key={i.id} type="button" onClick={() => { setElegido(i); setError(null); }} style={{ ...chip, height: 44, textTransform: "none", letterSpacing: 0, fontSize: 13 }}>{i.name}</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder={elegido ? `¿Cuánto? (${elegido.enQue})` : "¿Cuánto? (opcional)"} aria-label="Cuánto" style={{ ...field, flex: "1 1 170px", textAlign: "right", fontWeight: 700 }} />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (marca, para cuándo…)" aria-label="Nota" maxLength={160} style={{ ...field, flex: "3 1 260px" }} />
            </div>
            <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 52, fontSize: 13, alignSelf: "flex-start", padding: "0 24px" }}>{busy ? "Enviando…" : "Agregar a la lista"}</button>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
            {ok && <p role="status" style={{ margin: 0, fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</p>}
          </form>
        </section>

        {solicitudes.length > 0 && (
          <section aria-label="Pedido por el equipo">
            <div style={kicker}>Pedido por el equipo · {solicitudes.length}</div>
            {solicitudes.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{s.nombre}</span>
                  {s.note && <span style={{ color: "var(--muted)" }}> · {s.note}</span>}
                </span>
                {s.cantidad && <span className="cmd-num" style={{ fontWeight: 700 }}>{s.cantidad}</span>}
                <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{s.quien ?? "—"}</span>
              </div>
            ))}
          </section>
        )}

        <section aria-label="Ya está en la lista de compras">
          <div style={kicker}>Ya está en la lista de compras · {lineas.length}</div>
          {lineas.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Nada por pedir según los niveles y los conteos. Si ves que algo falta, agrégalo arriba.</div>}
          {lineas.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "8px 0", borderBottom: "1px dashed var(--rule)" }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: l.nivel ? NIVELES[l.nivel].color : "var(--rule)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{l.motivos.map((m) => MOTIVO[m]).join(" · ")}{l.proveedor ? ` · ${l.proveedor}` : ""}</span>
              </span>
              {l.legible && <span className="cmd-num" style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>pedir {l.legible}</span>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
