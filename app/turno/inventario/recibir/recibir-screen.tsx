"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { parseCount } from "@/lib/inventario/conteo";
import { parseMonto } from "@/lib/caja/movimientos";
import { errorRecepcion, PAGO_RECEPCION, PAGOS_RECEPCION, type PagoRecepcion } from "@/lib/compras/recepcion";
import { recibirPedido, subirFotoCompra } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1.5px solid var(--rule)", borderRadius: 4, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const label: React.CSSProperties = { fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-2)" };
const pick = (on: boolean): React.CSSProperties => ({ ...chip, height: 46, textTransform: "none", letterSpacing: 0, fontSize: 13.5, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)" });

interface Linea { id: string; nombre: string; pedida: number; enQue: string; enInventario: boolean }
interface Pedido { id: string; folio: number; proveedor: string; pedido: string; llega: string | null; atrasado: boolean; nota: string | null; estimado: number | null; lineas: Linea[] }

const num = (n: number) => String(n).replace(".", ",");

export function RecibirScreen({ sedeName, actorName, pedidos }: { sedeName: string; actorName: string; pedidos: Pedido[] }) {
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<string | null>(null);
  const sel = pedidos.find((p) => p.id === abierto) ?? null;

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Pedidos por llegar<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <span className="hidden sm:inline" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600 }}>{actorName}</span>
        {sel
          ? <button type="button" onClick={() => setAbierto(null)} style={{ ...chip, marginLeft: 8 }}>← Pedidos</button>
          : <Link href="/turno/inventario" style={{ ...chip, marginLeft: 8 }}>← Inventario</Link>}
      </div>
      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {sel ? (
          <Recibir key={sel.id} p={sel} onDone={(msg) => { setHecho(msg); setAbierto(null); }} />
        ) : (
          <>
            {hecho && <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--green)", fontWeight: 600, border: "1.5px solid var(--green)", borderRadius: 6, padding: "10px 14px" }}>✓ {hecho}</p>}
            <div style={kicker}>Por llegar · {pedidos.length}</div>
            {pedidos.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>No hay pedidos por llegar. Cuando el dueño registre uno aparece aquí para recibirlo.</div>}
            {pedidos.map((p) => (
              <button key={p.id} type="button" onClick={() => { setAbierto(p.id); setHecho(null); }} aria-label={`Pedido ${p.folio} de ${p.proveedor}`} style={{ textAlign: "left", border: `1.5px solid ${p.atrasado ? "var(--red)" : "var(--ink)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px", cursor: "pointer", color: "var(--ink)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-slab" style={{ display: "block", fontSize: 20 }}>#{p.folio} · {p.proveedor}</span>
                  <span style={{ display: "block", fontSize: 12, marginTop: 3, color: p.atrasado ? "var(--red)" : "var(--ink-2)", fontWeight: p.atrasado ? 700 : 500 }}>
                    {p.llega ? `${p.atrasado ? "debía llegar" : "llega"} ${p.llega}` : "sin fecha"} · pedido el {p.pedido} · {p.lineas.length} {p.lineas.length === 1 ? "producto" : "productos"}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.lineas.map((l) => `${num(l.pedida)} ${l.nombre}`).join(" · ")}</span>
                </span>
                <span className="cmd-btn red" style={{ height: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", fontSize: 12 }}>Recibir →</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Recibir({ p, onDone }: { p: Pedido; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [cant, setCant] = React.useState<Record<string, string>>({});
  const [fotoRecibido, setFotoRecibido] = React.useState<string | null>(null);
  const [fotoFactura, setFotoFactura] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState("");
  const [pago, setPago] = React.useState<PagoRecepcion | null>(null);
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t = parseMonto(total);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lineas = p.lineas.map((l) => ({ itemId: l.id, recibida: (cant[l.id] ?? "").trim() ? parseCount(cant[l.id]) : null }));
    const invalid = errorRecepcion({ lineas, fotoRecibido, fotoFactura, facturaTotal: t, pago });
    if (invalid) return setError(invalid);
    if (pago === "efectivo_caja" && !window.confirm(`Se registra una salida de caja de ${posMoney(t ?? 0)} por el pedido n.º ${p.folio}. ¿Continuar?`)) return;
    setBusy(true);
    setError(null);
    const r = await recibirPedido({ compraId: p.id, lineas, fotoRecibido, fotoFactura, facturaTotal: t, pago, nota: nota.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
    onDone(`Pedido n.º ${r.folio} recibido: el inventario ya lo suma${r.salida ? ` y quedó la salida de caja de ${posMoney(r.salida)}` : ""}.`);
  }

  return (
    <form onSubmit={enviar} aria-label={`Recibir pedido ${p.folio}`} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="font-slab" style={{ fontSize: 26, lineHeight: 1.1 }}>Recibir #{p.folio} · {p.proveedor}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>Pedido el {p.pedido}{p.llega ? ` · ${p.atrasado ? "debía llegar" : "llega"} ${p.llega}` : ""}{p.estimado ? ` · estimado ${posMoney(p.estimado)}` : ""}</div>
        {p.nota && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>«{p.nota}»</div>}
      </div>

      <section aria-label="Conteo">
        <div style={kicker}>1 · Cuenta lo que llegó</div>
        {p.lineas.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 0", borderBottom: "1px dashed var(--rule)", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 220px", minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{l.nombre}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>pedido: {num(l.pedida)} {l.enQue}{l.enInventario ? "" : " · no está en el inventario"}</span>
            </span>
            <button type="button" onClick={() => setCant((c) => ({ ...c, [l.id]: num(l.pedida) }))} style={{ ...chip, height: 44 }} title="Llegó completo">= {num(l.pedida)}</button>
            <input value={cant[l.id] ?? ""} onChange={(e) => setCant((c) => ({ ...c, [l.id]: e.target.value }))} inputMode="decimal" placeholder="llegó" aria-label={`Llegó de ${l.nombre}`} style={{ ...field, width: 110, textAlign: "center", fontWeight: 700 }} />
            <span style={{ fontSize: 12, color: "var(--muted)", width: 70 }}>{l.enQue}</span>
          </div>
        ))}
      </section>

      <section aria-label="Fotos">
        <div style={kicker}>2 · Fotos</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
          <FotoInput compraId={p.id} kind="recibido" label="Foto de lo que llegó" value={fotoRecibido} onChange={setFotoRecibido} />
          <FotoInput compraId={p.id} kind="factura" label="Foto de la factura" value={fotoFactura} onChange={setFotoFactura} />
        </div>
      </section>

      <section aria-label="Pago">
        <div style={kicker}>3 · Factura y pago</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Total de la factura</span>
            <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" placeholder="$ 0" aria-label="Total de la factura" style={{ ...field, width: 220, fontSize: 20, fontWeight: 700, textAlign: "right" }} />
            {t !== null && t > 0 && <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{posMoney(t)}</span>}
          </label>
          <div>
            <div style={{ ...label, marginBottom: 6 }}>¿Cómo se pagó?</div>
            <div role="radiogroup" aria-label="Cómo se pagó" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PAGOS_RECEPCION.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={pago === m} title={PAGO_RECEPCION[m].hint} onClick={() => setPago(m)} style={pick(pago === m)}>{PAGO_RECEPCION[m].label}</button>
              ))}
            </div>
            {pago && <div style={{ fontSize: 12, color: pago === "efectivo_caja" ? "var(--red)" : "var(--muted)", marginTop: 6, fontWeight: pago === "efectivo_caja" ? 600 : 400 }}>{pago === "efectivo_caja" && t ? `Sale ${posMoney(t)} de la caja con la justificación del pedido.` : PAGO_RECEPCION[pago].hint}.</div>}
          </div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota (algo llegó dañado, faltó algo, quién pagó…)" aria-label="Nota de la recepción" style={field} />
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 54, fontSize: 14, padding: "0 26px" }}>{busy ? "Recibiendo…" : "Recibir pedido"}</button>
        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
      </div>
    </form>
  );
}

/** Shrink a camera photo to a JPEG the server takes (≤ 1600 px, ~0.5 MB). */
async function achicar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.8));
}

function FotoInput({ compraId, kind, label: text, value, onChange }: { compraId: string; kind: "recibido" | "factura"; label: string; value: string | null; onChange: (path: string | null) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await achicar(file);
      const fd = new FormData();
      fd.set("file", blob, `${kind}.jpg`);
      fd.set("compra_id", compraId);
      fd.set("kind", kind);
      const r = await subirFotoCompra(fd);
      if (!r.ok) throw new Error(r.error);
      setPreview(URL.createObjectURL(blob));
      onChange(r.path);
    } catch (err) {
      setError(err instanceof Error && err.message !== "toBlob" ? err.message : "No se pudo leer la foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: `1.5px ${value ? "solid" : "dashed"} ${value ? "var(--green)" : "var(--ink)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{value ? "✓ " : ""}{text}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
      {preview && <img src={preview} alt={text} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 4 }} />}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={(e) => void elegir(e)} aria-label={text} style={{ display: "none" }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className={value ? "cmd-btn ghost" : "cmd-btn"} style={{ height: 46, fontSize: 12 }}>{busy ? "Subiendo…" : value ? "Tomar otra" : "📷 Tomar foto"}</button>
      {error && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
