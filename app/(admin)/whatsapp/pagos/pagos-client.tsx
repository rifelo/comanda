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
  if (!pagos.length) {
    return (
      <p className="text-muted m-0" style={{ marginTop: 12 }}>
        No hay pagos por aprobar. Cuando el barista acepte un domicilio de WhatsApp, aparece aquí para que confirmes la transferencia.
      </p>
    );
  }
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {pagos.map((p) => (
        <Pago key={p.id} p={p} />
      ))}
    </div>
  );
}

function Pago({ p }: { p: PagoPorAprobar }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);
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
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
        <span className="font-bold" style={{ fontSize: 18 }}>
          {p.folio}
          {p.cliente ? ` · ${p.cliente}` : ""}
        </span>
        <span className="cmd-num font-bold" style={{ fontSize: 20 }}>{pesos(p.falta || p.total)}</span>
      </div>
      <div className="text-muted" style={{ fontSize: 14 }}>
        {p.telefono ? `+${p.telefono} · ` : ""}pedido a las {p.hora}
        {" · "}
        <span style={{ color: p.minutos >= 10 ? "var(--late)" : undefined, fontWeight: p.minutos >= 10 ? 700 : undefined }}>esperando hace {p.minutos} min</span>
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
