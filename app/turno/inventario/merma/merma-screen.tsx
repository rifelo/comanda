"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseCount } from "@/lib/inventario/conteo";
import { tokens } from "@/lib/inventario/propuestas";
import { errorMerma, JUSTIFICACION_MIN, MOTIVOS_MERMA, MOTIVO_MERMA, type MotivoMerma } from "@/lib/inventario/mermas";
import { registrarMerma } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const pick = (on: boolean): React.CSSProperties => ({ ...chip, height: 46, textTransform: "none", letterSpacing: 0, fontSize: 13.5, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)" });

type Kind = "producto" | "insumo";
interface Opcion { id: string; name: string; /** What its quantity is typed in ("bolsas", "g"); products are units. */ enQue?: string }

export function MermaScreen({ sedeName, actorName, productos, insumos, hoy }: {
  sedeName: string;
  actorName: string;
  productos: Opcion[];
  insumos: Opcion[];
  hoy: { id: string; nombre: string; cantidad: string; motivo: MotivoMerma; justificacion: string; quien: string | null; hora: string }[];
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind>("producto");
  const [texto, setTexto] = React.useState("");
  const [elegido, setElegido] = React.useState<Opcion | null>(null);
  const [qty, setQty] = React.useState("1");
  const [motivo, setMotivo] = React.useState<MotivoMerma | null>(null);
  const [just, setJust] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const lista = kind === "producto" ? productos : insumos;
  // Every word typed must start a word of the name, so "late fr" finds «Latte frío».
  const opciones = React.useMemo(() => {
    if (elegido) return [];
    const t = tokens(texto);
    const hits = t.length ? lista.filter((i) => { const n = tokens(i.name); return t.every((w) => n.some((x) => x.startsWith(w))); }) : lista;
    return hits.slice(0, t.length ? 12 : 30);
  }, [texto, elegido, lista]);

  function cambiarKind(k: Kind) {
    setKind(k);
    setElegido(null);
    setTexto("");
    setQty(k === "producto" ? "1" : "");
    setError(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!elegido) return setError(kind === "producto" ? "Elige la bebida o el producto." : "Elige el insumo.");
    const n = parseCount(qty);
    const invalid = errorMerma({ qty: n, motivo, justificacion: just, producto: kind === "producto" });
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    const r = await registrarMerma({ kind, id: elegido.id, qty: n, motivo, justificacion: just.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(`Merma registrada: ${n} ${kind === "producto" ? "×" : elegido.enQue ?? ""} ${r.nombre}. Ya se descontó del inventario.`);
    setElegido(null);
    setTexto("");
    setQty(kind === "producto" ? "1" : "");
    setMotivo(null);
    setJust("");
    router.refresh();
  }

  const step = (d: number) => setQty((q) => String(Math.max(1, Math.min(50, (parseCount(q) ?? 1) + d))));

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Merma<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{actorName}</span>
        <Link href="/turno/inventario" style={chip}>← Inventario</Link>
      </div>

      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <section aria-label="Registrar merma">
          <div style={kicker}>Registrar merma · algo que se perdió sin venderse</div>
          <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <div role="radiogroup" aria-label="Qué se perdió" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" role="radio" aria-checked={kind === "producto"} onClick={() => cambiarKind("producto")} style={pick(kind === "producto")}>Bebida o producto</button>
              <button type="button" role="radio" aria-checked={kind === "insumo"} onClick={() => cambiarKind("insumo")} style={pick(kind === "insumo")}>Insumo (leche, vasos…)</button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: -6 }}>
              {kind === "producto" ? "Se descuenta toda su receta: café, leche, vaso, tapa, etiquetas…" : "Se descuenta solo ese insumo, en la cantidad que escribas."}
            </div>

            {elegido ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 12px", border: "1.5px solid var(--ink)", borderRadius: 4, background: "var(--paper-lt)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{elegido.name}</span>
                <button type="button" onClick={() => setElegido(null)} style={{ ...chip, height: 34 }}>Cambiar</button>
              </div>
            ) : (
              <>
                <input value={texto} onChange={(e) => { setTexto(e.target.value); setOk(null); }} placeholder={kind === "producto" ? "Busca la bebida (latte, jugo, torta…)" : "Busca el insumo (leche, vaso, pulpa…)"} aria-label="Buscar" maxLength={60} style={{ ...field, width: "100%" }} />
                <div role="group" aria-label={kind === "producto" ? "Productos" : "Insumos"} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 220, overflowY: "auto" }}>
                  {opciones.map((i) => (
                    <button key={i.id} type="button" onClick={() => { setElegido(i); setError(null); setOk(null); }} style={{ ...chip, height: 44, textTransform: "none", letterSpacing: 0, fontSize: 13 }}>{i.name}</button>
                  ))}
                  {opciones.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 0" }}>Nada con ese nombre.</span>}
                </div>
              </>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-2)" }}>Cantidad{kind === "insumo" && elegido?.enQue ? ` (${elegido.enQue})` : ""}</span>
              <span style={{ display: "flex", gap: 8 }}>
                {kind === "producto" && <button type="button" onClick={() => step(-1)} aria-label="Uno menos" style={{ ...chip, width: 48, height: 48, justifyContent: "center", fontSize: 18 }}>−</button>}
                <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" aria-label="Cantidad" placeholder={kind === "insumo" ? (elegido?.enQue ?? "") : ""} style={{ ...field, width: 120, textAlign: "center", fontWeight: 700 }} />
                {kind === "producto" && <button type="button" onClick={() => step(1)} aria-label="Uno más" style={{ ...chip, width: 48, height: 48, justifyContent: "center", fontSize: 18 }}>+</button>}
              </span>
            </label>

            <div>
              <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>¿Qué pasó?</div>
              <div role="radiogroup" aria-label="Qué pasó" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {MOTIVOS_MERMA.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={motivo === m} title={MOTIVO_MERMA[m].hint} onClick={() => setMotivo(m)} style={pick(motivo === m)}>{MOTIVO_MERMA[m].label}</button>
                ))}
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-2)" }}>Justificación · obligatoria</span>
              <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={3} maxLength={300} aria-label="Justificación" placeholder="Ej.: se le cayó al cliente al recogerlo en la barra; se repuso sin cobrar." style={{ ...field, height: "auto", padding: "10px 12px", lineHeight: 1.45, resize: "vertical" }} />
              <span style={{ fontSize: 11, color: just.trim().length >= JUSTIFICACION_MIN ? "var(--muted)" : "var(--amber)" }}>{just.trim().length}/300</span>
            </label>

            <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 52, fontSize: 13, alignSelf: "flex-start", padding: "0 24px" }}>{busy ? "Registrando…" : "Registrar merma"}</button>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
            {ok && <p role="status" style={{ margin: 0, fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>✓ {ok}</p>}
          </form>
        </section>

        <section aria-label="Mermas de hoy">
          <div style={kicker}>Hoy · {hoy.length} {hoy.length === 1 ? "merma" : "mermas"}</div>
          {hoy.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Nada perdido hoy.</div>}
          {hoy.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span className="cmd-num" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{m.hora}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{m.cantidad} · {m.nombre}</span>
                <span style={{ color: "var(--ink-2)" }}> · {MOTIVO_MERMA[m.motivo].label}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>«{m.justificacion}»</span>
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{m.quien ?? "—"}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
