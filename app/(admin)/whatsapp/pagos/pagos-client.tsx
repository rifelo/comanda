"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@/components/ui";
import { aprobarPagoWhatsapp, recordarPagoWhatsapp } from "@/app/pos/actions";

export type PagoPorAprobar = {
  id: string;
  folio: string;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  telefonoRecibe: string | null;
  total: number;
  falta: number;
  items: string[];
  hora: string;
  minutos: number;
  chat: { autor: "cliente" | "agente" | "equipo"; texto: string; hora: string; media?: { url: string; mime: string } | null }[];
};

const pesos = (n: number) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function PagosClient({ pagos }: { pagos: PagoPorAprobar[] }) {
  return (
    <div className="grid items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ gap: 20 }}>
      <div className="flex flex-col" style={{ gap: 14, minWidth: 0 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span
            className="rounded-full font-bold"
            style={{ padding: "4px 12px", fontSize: 14, background: pagos.length ? "var(--late-soft)" : "var(--surface-2)", color: pagos.length ? "var(--late)" : "var(--muted)" }}
          >
            {pagos.length === 1 ? "1 por aprobar" : `${pagos.length} por aprobar`}
          </span>
          <span className="text-muted" style={{ fontSize: 13 }}>Se actualiza sola cada 20 segundos</span>
        </div>
        {pagos.length ? (
          pagos.map((p) => <Pago key={p.id} p={p} />)
        ) : (
          <p className="text-muted m-0">
            No hay pagos por aprobar. Cuando el barista acepte un domicilio de WhatsApp, aparece aquí para que confirmes la transferencia.
          </p>
        )}
      </div>
      <aside className="rounded-card border border-line bg-surface flex flex-col" style={{ padding: 18, gap: 12 }} aria-labelledby="pagos-q">
        <h2 id="pagos-q" className="m-0 font-bold" style={{ fontSize: 16 }}>Qué pasa al aprobar</h2>
        <ol className="m-0 flex flex-col list-decimal" style={{ paddingLeft: 20, gap: 8, fontSize: 14, lineHeight: 1.4 }}>
          <li>Se registra el pago como transferencia.</li>
          <li>El pedido pasa a <b>Preparar</b> y la caja imprime la comanda y las etiquetas.</li>
          <li>El cliente recibe: «Ya confirmamos tu pago, tu pedido ya está en preparación».</li>
          <li>El barista llama al domiciliario y marca «Salió».</li>
        </ol>
        <p className="m-0 text-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>Los pedidos para recoger y las entregas cercanas no pasan por aquí: se pagan al recibirlos.</p>
      </aside>
    </div>
  );
}

const REVISAR = ["Llegó a Nequi o Bold", "Monto exacto", "Nombre del que paga"] as const;

function Pago({ p }: { p: PagoPorAprobar }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);
  // The owner's own checklist before approving (not stored).
  const [visto, setVisto] = useState<Set<string>>(new Set());
  const monto = p.falta || p.total;
  const correr = (accion: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await accion();
      if (r.ok) {
        setHecho(ok);
        toast(ok, "ok");
        router.refresh();
      } else toast(r.error ?? "No se pudo guardar.", "late");
    });

  return (
    <section className="rounded-card border border-line bg-surface flex flex-col" style={{ padding: 16, gap: 10 }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
        <h2 className="m-0 font-bold" style={{ fontSize: 20 }}>
          {p.folio}
          {p.cliente ? ` · ${p.cliente}` : ""}
        </h2>
        <span style={{ fontSize: 14, color: p.minutos >= 10 ? "var(--late)" : "var(--muted)", fontWeight: p.minutos >= 10 ? 700 : 500 }}>esperando hace {p.minutos} min</span>
        <span className="cmd-num font-bold" style={{ fontSize: 26, marginLeft: "auto" }}>{pesos(monto)}</span>
      </div>
      <div className="text-muted" style={{ fontSize: 14 }}>
        {p.telefono ? `+${p.telefono} · ` : ""}pedido a las {p.hora}
      </div>
      <div style={{ fontSize: 15 }}>{p.items.join(", ")}</div>
      {p.direccion ? <div style={{ fontSize: 14 }}>📍 {p.direccion}{p.telefonoRecibe ? ` · recibe tel ${p.telefonoRecibe}` : ""}</div> : null}
      {p.chat.length ? (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Ver conversación ({p.chat.length})</summary>
          <ol className="m-0 p-0" style={{ listStyle: "none", display: "grid", gap: 6, marginTop: 8, maxHeight: 360, overflowY: "auto" }}>
            {p.chat.map((m, i) => (
              <li
                key={i}
                className="rounded-btn"
                style={{
                  padding: "6px 10px",
                  maxWidth: "85%",
                  justifySelf: m.autor === "cliente" ? "start" : "end",
                  background: m.autor === "cliente" ? "var(--surface-2)" : "var(--brand-soft)",
                }}
              >
                <div className="text-muted" style={{ fontSize: 12 }}>{m.autor === "cliente" ? "Cliente" : m.autor === "agente" ? "Agente" : "Equipo"} · {m.hora}</div>
                {m.media?.mime.startsWith("image/") ? (
                  <a href={m.media.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir la imagen en grande">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.media.url} alt="Imagen que envió el cliente" style={{ display: "block", maxWidth: 260, maxHeight: 320, borderRadius: 8 }} />
                  </a>
                ) : m.media ? (
                  <a href={m.media.url} target="_blank" rel="noopener noreferrer" className="font-semibold">Abrir el archivo que envió</a>
                ) : (
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.texto}</div>
                )}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {!hecho && (
        <div className="flex flex-wrap" style={{ gap: "6px 16px" }} role="group" aria-label="Antes de aprobar, revisa">
          {REVISAR.map((r) => (
            <label key={r} className="inline-flex items-center" style={{ gap: 8, fontSize: 14, minHeight: 32, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={visto.has(r)}
                onChange={() => setVisto((v) => { const n = new Set(v); if (n.has(r)) n.delete(r); else n.add(r); return n; })}
                style={{ width: 20, height: 20, accentColor: "var(--ok)" }}
              />
              {r === "Monto exacto" ? `Monto exacto ${pesos(monto)}` : r}
            </label>
          ))}
        </div>
      )}
      {hecho ? (
        <p className="m-0 font-semibold" style={{ color: "var(--ok)" }}>✓ {hecho}</p>
      ) : (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <Button loading={pendiente} onClick={() => correr(() => aprobarPagoWhatsapp({ ordenId: p.id }), "Pago aprobado: ya está en preparación")}>
            Pago recibido · preparar
          </Button>
          <Button variant="ghost" disabled={pendiente} onClick={() => correr(() => recordarPagoWhatsapp({ ordenId: p.id }), "Le recordamos el pago al cliente")}>
            Aún no llega · recordarle
          </Button>
        </div>
      )}
    </section>
  );
}
