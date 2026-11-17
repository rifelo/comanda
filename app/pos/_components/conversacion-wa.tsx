"use client";

/**
 * The WhatsApp chat behind an order, as bubbles: the customer on the left,
 * the agent and the team on the right. Read-only, loaded on demand.
 */
import * as React from "react";
import { conversacionDePedido, type MensajeConversacion } from "../actions";

/** Bogotá is UTC−5 all year; by hand so it matches everywhere. */
const hora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  const h = d.getUTCHours();
  return `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
};
const QUIEN = { cliente: "Cliente", agente: "Agente", equipo: "Equipo" } as const;

export function ConversacionWa({ ordenId, alto = 320 }: { ordenId: string; alto?: number }) {
  const [mensajes, setMensajes] = React.useState<MensajeConversacion[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fin = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let vivo = true;
    void conversacionDePedido({ ordenId }).then((r) => {
      if (!vivo) return;
      if (r.ok) setMensajes(r.mensajes);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [ordenId]);
  React.useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  if (error) return <p className="muted" style={{ margin: 0 }}>{error}</p>;
  if (!mensajes) return <p className="muted" style={{ margin: 0 }}>Cargando la conversación…</p>;
  if (!mensajes.length) return <p className="muted" style={{ margin: 0 }}>No hay mensajes de este pedido.</p>;
  return (
    <div
      role="log"
      aria-label="Conversación de WhatsApp"
      style={{ maxHeight: alto, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--surface-2)", borderRadius: 14 }}
    >
      {mensajes.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.autor === "cliente" ? "flex-start" : "flex-end",
            maxWidth: "85%",
            background: m.autor === "cliente" ? "var(--surface)" : m.autor === "agente" ? "var(--ok-soft)" : "var(--brand-soft)",
            borderRadius: 12,
            padding: "8px 12px",
          }}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>{QUIEN[m.autor]} · {hora(m.at)}</div>
          <div style={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.texto}</div>
        </div>
      ))}
      <div ref={fin} />
    </div>
  );
}
