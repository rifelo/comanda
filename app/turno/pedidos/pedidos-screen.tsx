"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { posMoney } from "@/lib/pos/types";
import { parseCount } from "@/lib/inventario/conteo";
import { parseMonto } from "@/lib/caja/movimientos";
import { errorRecepcion, PAGO_RECEPCION, PAGOS_RECEPCION, type PagoRecepcion } from "@/lib/compras/recepcion";
import { recibirPedido, subirFotoCompra } from "./actions";

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "none", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "inherit", background: "transparent", cursor: "pointer" };
const field: React.CSSProperties = { height: 48, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--paper-lt)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, outline: "none", minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "none", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" };
const label: React.CSSProperties = { fontSize: 11, letterSpacing: ".1em", textTransform: "none", color: "var(--ink-2)" };
const pick = (on: boolean): React.CSSProperties => ({ ...chip, height: 46, textTransform: "none", letterSpacing: 0, fontSize: 13.5, border: `1.5px solid ${on ? "var(--ink)" : "var(--rule)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-lt)" : "var(--ink)" });

interface Linea { id: string; nombre: string; pedida: number; enQue: string; enInventario: boolean }
interface Pedido {
  id: string; folio: number; proveedor: string; pedido: string; llega: string | null; atrasado: boolean; nota: string | null; estimado: number | null; lineas: Linea[];
  /** What the owner already paid for it (online, before it came), and how. */
  yaPagado: number; pagadoCon: string | null;
  /** The owner said, when confirming it, to pay it from the drawer. */
  pagarDeCaja: boolean;
}

const num = (n: number) => String(n).replace(".", ",");

export interface PedidoRecibido {
  id: string;
  folio: number;
  proveedor: string;
  recibido: string;
  recibidoPor: string | null;
  factura: number | null;
  pago: string | null;
  nota: string | null;
  lineas: { id: string; nombre: string; pedida: number; recibida: number | null; enQue: string }[];
}

/** How a line came: complete, short, more than ordered. */
function comparar(pedida: number, recibida: number | null): { tipo: "ok" | "falta" | "mas" | "nada"; texto: string } {
  if (recibida === null) return { tipo: "nada", texto: "sin contar" };
  const d = Math.round((recibida - pedida) * 100) / 100;
  if (d === 0) return { tipo: "ok", texto: "completo" };
  if (recibida === 0) return { tipo: "falta", texto: "no llegó" };
  return d < 0 ? { tipo: "falta", texto: `faltaron ${num(-d)}` } : { tipo: "mas", texto: `llegaron ${num(d)} de más` };
}
const COLOR = { ok: "var(--green)", falta: "var(--red)", mas: "var(--amber, #b7791f)", nada: "var(--muted)" } as const;

export function PedidosScreen({ pedidos, recibidos }: { pedidos: Pedido[]; recibidos: PedidoRecibido[] }) {
  const [vista, setVista] = React.useState<"llegar" | "recibidos">("llegar");
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<string | null>(null);
  const sel = pedidos.find((p) => p.id === abierto) ?? null;
  const verRecibido = recibidos.find((r) => r.id === abierto) ?? null;

  return (
    <div className="cmd-paper" style={{ minHeight: "100%", display: "flex", flexDirection: "column", fontFamily: "inherit", color: "var(--ink)" }}>
      <div style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderBottom: "1px solid var(--line)", background: "var(--paper-lt)", flexShrink: 0, flexWrap: "wrap" }}>
        {sel || verRecibido ? (
          <button type="button" onClick={() => setAbierto(null)} style={chip}>← Pedidos</button>
        ) : (
          <div role="tablist" aria-label="Pedidos" style={{ display: "flex", gap: 8 }}>
            <button type="button" role="tab" aria-selected={vista === "llegar"} onClick={() => setVista("llegar")} style={pick(vista === "llegar")}>Por llegar · {pedidos.length}</button>
            <button type="button" role="tab" aria-selected={vista === "recibidos"} onClick={() => { setVista("recibidos"); setHecho(null); }} style={pick(vista === "recibidos")}>Recibidos · {recibidos.length}</button>
          </div>
        )}
      </div>
      <div style={{ padding: "20px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {sel ? (
          <Recibir key={sel.id} p={sel} onDone={(msg) => { setHecho(msg); setAbierto(null); }} />
        ) : verRecibido ? (
          <Recibido r={verRecibido} />
        ) : vista === "llegar" ? (
          <>
            {hecho && <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--green)", fontWeight: 600, border: "1.5px solid var(--green)", borderRadius: 6, padding: "10px 14px" }}>✓ {hecho}</p>}
            <div style={kicker}>Por llegar · {pedidos.length}</div>
            {pedidos.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>No hay pedidos por llegar. Cuando el dueño confirme uno aparece aquí para recibirlo.</div>}
            {pedidos.map((p) => (
              <button key={p.id} type="button" onClick={() => { setAbierto(p.id); setHecho(null); }} aria-label={`Pedido ${p.folio} de ${p.proveedor}`} style={{ textAlign: "left", border: `1.5px solid ${p.atrasado ? "var(--red)" : "var(--ink)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-bold" style={{ display: "block", fontSize: 20 }}>#{p.folio} · {p.proveedor}</span>
                  <span style={{ display: "block", fontSize: 12, marginTop: 3, color: p.atrasado ? "var(--red)" : "var(--ink-2)", fontWeight: p.atrasado ? 700 : 500 }}>
                    {p.llega ? `${p.atrasado ? "debía llegar" : "llega"} ${p.llega}` : "sin fecha"} · pedido el {p.pedido} · {p.lineas.length} {p.lineas.length === 1 ? "producto" : "productos"}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.lineas.map((l) => `${num(l.pedida)} ${l.nombre}`).join(" · ")}</span>
                </span>
                <span className="cmd-btn red" style={{ height: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", fontSize: 12 }}>Revisar y recibir →</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <div style={kicker}>Recibidos · últimos 14 días</div>
            {recibidos.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No se ha recibido ningún pedido en los últimos 14 días.</div>}
            {recibidos.map((r) => {
              const malas = r.lineas.filter((l) => comparar(l.pedida, l.recibida).tipo !== "ok").length;
              return (
                <button key={r.id} type="button" onClick={() => setAbierto(r.id)} aria-label={`Pedido recibido ${r.folio} de ${r.proveedor}`} style={{ textAlign: "left", border: "1.5px solid var(--rule)", borderRadius: 8, background: "var(--paper-lt)", padding: "12px 16px", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="font-bold" style={{ display: "block", fontSize: 17 }}>#{r.folio} · {r.proveedor}</span>
                    <span style={{ display: "block", fontSize: 12, marginTop: 3, color: "var(--ink-2)" }}>recibido el {r.recibido}{r.recibidoPor ? ` por ${r.recibidoPor}` : ""} · {r.lineas.length} {r.lineas.length === 1 ? "producto" : "productos"}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: malas ? COLOR.falta : COLOR.ok }}>{malas ? `${malas} con diferencia` : "✓ completo"}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** A received order: ordered vs arrived, line by line. */
function Recibido({ r }: { r: PedidoRecibido }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="font-bold" style={{ fontSize: 24, lineHeight: 1.1 }}>#{r.folio} · {r.proveedor}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
          Recibido el {r.recibido}{r.recibidoPor ? ` por ${r.recibidoPor}` : ""}{r.factura ? ` · factura ${posMoney(r.factura)}` : ""}{r.pago ? ` · ${r.pago}` : ""}
        </div>
        {r.nota && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>«{r.nota}»</div>}
      </div>
      <div role="list" aria-label="Pedido contra recibido">
        <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 80px 80px", gap: 10, fontSize: 10.5, letterSpacing: ".12em", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)" }}>
          <span /> <span>Producto</span><span style={{ textAlign: "right" }}>Pedido</span><span style={{ textAlign: "right" }}>Llegó</span>
        </div>
        {r.lineas.map((l) => {
          const c = comparar(l.pedida, l.recibida);
          return (
            <div key={l.id} role="listitem" style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 80px 80px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px dashed var(--rule)" }}>
              <span aria-hidden style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: COLOR[c.tipo], color: "#fff", fontWeight: 800, fontSize: 14 }}>{c.tipo === "ok" ? "✓" : c.tipo === "mas" ? "+" : "!"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{l.nombre}</span>
                <span style={{ display: "block", fontSize: 11.5, color: COLOR[c.tipo], fontWeight: c.tipo === "ok" ? 500 : 700 }}>{c.texto} · {l.enQue}</span>
              </span>
              <span className="cmd-num" style={{ textAlign: "right", fontSize: 15 }}>{num(l.pedida)}</span>
              <span className="cmd-num" style={{ textAlign: "right", fontSize: 15, fontWeight: 800, color: COLOR[c.tipo] }}>{l.recibida === null ? "—" : num(l.recibida)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Recibir({ p, onDone }: { p: Pedido; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [cant, setCant] = React.useState<Record<string, string>>({});
  // Lines marked «diferente»: their quantity is typed instead of checked.
  const [distinto, setDistinto] = React.useState<Record<string, boolean>>({});
  // What the invoice charged for each line (optional): it becomes the item's new cost.
  const [costo, setCosto] = React.useState<Record<string, string>>({});
  const [fotoRecibido, setFotoRecibido] = React.useState<string | null>(null);
  const [fotoFactura, setFotoFactura] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState("");
  const [pago, setPago] = React.useState<PagoRecepcion | null>(p.yaPagado > 0 ? "dueno" : p.pagarDeCaja ? "efectivo_caja" : null);
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t = parseMonto(total);
  const revisadas = p.lineas.filter((l) => (cant[l.id] ?? "").trim() && parseCount(cant[l.id]) !== null).length;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lineas = p.lineas.map((l) => ({ itemId: l.id, recibida: (cant[l.id] ?? "").trim() ? parseCount(cant[l.id]) : null, costo: (costo[l.id] ?? "").trim() ? parseMonto(costo[l.id]) : null }));
    const invalid = errorRecepcion({ lineas, fotoRecibido, fotoFactura, facturaTotal: t, pago });
    if (invalid) return setError(invalid);
    const resta = Math.max(0, (t ?? 0) - p.yaPagado);
    if (pago === "efectivo_caja" && resta === 0) return setError("El dueño ya pagó todo el pedido: elige «Ya lo pagó el dueño».");
    if (pago === "efectivo_caja" && !window.confirm(`Se registra una salida de caja de ${posMoney(resta)} por el pedido n.º ${p.folio}. ¿Continuar?`)) return;
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
        <div className="font-bold" style={{ fontSize: 26, lineHeight: 1.1 }}>Recibir #{p.folio} · {p.proveedor}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>Pedido el {p.pedido}{p.llega ? ` · ${p.atrasado ? "debía llegar" : "llega"} ${p.llega}` : ""}{p.estimado ? ` · estimado ${posMoney(p.estimado)}` : ""}</div>
        {p.nota && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>«{p.nota}»</div>}
        {p.yaPagado === 0 && p.pagarDeCaja && <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700, marginTop: 6 }}>El dueño dijo: se paga con el efectivo de la caja al recibirlo.</div>}
        {p.yaPagado > 0 && <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700, marginTop: 6 }}>El dueño ya pagó {posMoney(p.yaPagado)}{p.pagadoCon ? ` (${p.pagadoCon})` : ""}: no se paga de la caja.</div>}
      </div>

      <section aria-label="Conteo">
        <div style={{ ...kicker, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>1 · Revisa lo que llegó contra lo pedido</span>
          <span style={{ fontWeight: 700, color: revisadas === p.lineas.length ? "var(--green)" : "var(--ink)" }}>{revisadas} de {p.lineas.length} revisados</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "8px 0 2px", lineHeight: 1.5 }}>Saca cada producto y márcalo: ✓ si llegó completo, «Diferente» si llegó menos, más o nada, y escribe cuánto llegó. Si la factura trae el precio de cada producto, escríbelo en «$ costó».</div>
        {p.lineas.map((l) => {
          const v = (cant[l.id] ?? "").trim() ? parseCount(cant[l.id]) : null;
          const ok = !distinto[l.id] && v !== null && v === l.pedida;
          const c = distinto[l.id] && v !== null ? comparar(l.pedida, v) : null;
          return (
            <div key={l.id} data-linea={l.nombre} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, padding: "8px 10px", margin: "0 -10px", borderBottom: "1px dashed var(--rule)", flexWrap: "wrap", borderRadius: 6, background: ok ? "color-mix(in srgb, var(--green) 10%, transparent)" : c && c.tipo !== "ok" ? "color-mix(in srgb, var(--red) 8%, transparent)" : "transparent" }}>
              <button
                type="button"
                role="checkbox"
                aria-checked={ok}
                aria-label={`${l.nombre}: llegó completo (${num(l.pedida)} ${l.enQue})`}
                onClick={() => {
                  setDistinto((d) => ({ ...d, [l.id]: false }));
                  setCant((x) => ({ ...x, [l.id]: ok ? "" : num(l.pedida) }));
                }}
                style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 10, border: `2px solid ${ok ? "var(--green)" : "var(--ink)"}`, background: ok ? "var(--green)" : "var(--paper-lt)", color: "#fff", fontSize: 26, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >{ok ? "✓" : ""}</button>
              <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{l.nombre}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>pedido: <b>{num(l.pedida)} {l.enQue}</b>{l.enInventario ? "" : " · no está en el inventario"}</span>
                {c && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLOR[c.tipo], marginTop: 2 }}>{c.texto}</span>}
              </span>
              {distinto[l.id] ? (
                <>
                  <input autoFocus value={cant[l.id] ?? ""} onChange={(e) => setCant((x) => ({ ...x, [l.id]: e.target.value }))} inputMode="decimal" placeholder="llegó" aria-label={`Llegó de ${l.nombre}`} style={{ ...field, width: 100, textAlign: "center", fontWeight: 700 }} />
                  <span style={{ fontSize: 12, color: "var(--muted)", width: 64 }}>{l.enQue}</span>
                </>
              ) : (
                <button type="button" onClick={() => { setDistinto((d) => ({ ...d, [l.id]: true })); setCant((x) => ({ ...x, [l.id]: "" })); }} style={{ ...chip, height: 44 }}>Diferente</button>
              )}
              {l.enInventario ? (
                <input value={costo[l.id] ?? ""} onChange={(e) => setCosto((x) => ({ ...x, [l.id]: e.target.value }))} inputMode="numeric" placeholder="$ costó" title="Lo que cobra la factura por esta línea: actualiza el costo del insumo" aria-label={`Costo en factura de ${l.nombre}`} style={{ ...field, width: 110, textAlign: "right", height: 44, fontSize: 14 }} />
              ) : null}
            </div>
          );
        })}
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
            {pago && <div style={{ fontSize: 12, color: pago === "efectivo_caja" ? "var(--red)" : "var(--muted)", marginTop: 6, fontWeight: pago === "efectivo_caja" ? 600 : 400 }}>{pago === "efectivo_caja" && t ? `Sale ${posMoney(Math.max(0, t - p.yaPagado))} de la caja con la justificación del pedido${p.yaPagado > 0 ? ` (el resto ya lo pagó el dueño)` : ""}.` : PAGO_RECEPCION[pago].hint}.</div>}
          </div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota (algo llegó dañado, faltó algo, quién pagó…)" aria-label="Nota de la recepción" style={field} />
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="cmd-btn red" disabled={busy} style={{ height: 54, fontSize: 14, padding: "0 26px" }}>{busy ? "Recibiendo…" : revisadas < p.lineas.length ? `Recibir pedido (faltan ${p.lineas.length - revisadas} por revisar)` : "Recibir pedido"}</button>
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
