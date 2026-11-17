"use client";

/**
 * «Nuevo pedido por WhatsApp» — over everything on the register. A WhatsApp
 * order waits for the team (mig 0097): Aceptar makes the agent tell the
 * customer it is being made; Rechazar asks for a reason (always) and the
 * agent explains it to the customer with an alternative. «Ver luego» tucks
 * it into a floating button until the next order arrives.
 */
import * as React from "react";
import { MOTIVOS_RECHAZO_WA, type MotivoRechazoWa, type PosOrder } from "@/lib/pos/types";
import { folioTag } from "@/lib/pos/pending";
import { aceptarPedidoWhatsapp, rechazarPedidoWhatsapp } from "../actions";
import { refreshPendientes, usePos } from "../pos-store";
import { recordatoriosVencidos, sonarAlerta } from "@/lib/pos/alerta";
import { money, orderName } from "./ordenes";
import { ConversacionWa } from "./conversacion-wa";
import { REVISAR_WA } from "./pedidos-wa";
import { tipoWa } from "@/lib/whatsapp/flujo";

const PISTA: Record<MotivoRechazoWa, string> = {
  "Faltan insumos": "Ej.: no hay leche deslactosada",
  "Problema técnico": "Ej.: la máquina de espresso no enciende",
  "Mucha demanda": "Ej.: estaría en unos 30 minutos",
  Otro: "Cuéntale al cliente qué pasó",
};

const valores = (mods: unknown): string[] =>
  Object.values((mods ?? {}) as Record<string, string | string[]>).flatMap((v) => (Array.isArray(v) ? v : [v])).filter(Boolean);

export function WhatsappEntrante() {
  const s = usePos();
  const porAceptar = s.pendientes.filter((o) => (o as PosOrder).canal === "whatsapp" && (o as PosOrder).waEstado === "por_aceptar") as PosOrder[];
  const [luego, setLuego] = React.useState<Set<string>>(new Set());
  // Nobody accepted it yet: ring again every 5 minutes and bring it back up.
  const [ahora, setAhora] = React.useState(() => Date.now());
  const avisados = React.useRef(new Map<string, number>());
  const esperando = React.useRef(porAceptar);
  React.useEffect(() => {
    esperando.current = porAceptar;
  });
  React.useEffect(() => {
    const t = window.setInterval(() => {
      const ya = Date.now();
      setAhora(ya);
      if (recordatoriosVencidos(esperando.current, avisados.current, ya).length) {
        sonarAlerta();
        setLuego(new Set());
      }
    }, 20_000);
    return () => window.clearInterval(t);
  }, []);
  // «Revisar y aceptar» on the board brings this window back on that order.
  const [primero, setPrimero] = React.useState<string | null>(null);
  React.useEffect(() => {
    const on = (e: Event) => {
      setPrimero((e as CustomEvent<string>).detail);
      setLuego(new Set());
    };
    window.addEventListener(REVISAR_WA, on);
    return () => window.removeEventListener(REVISAR_WA, on);
  }, []);
  // A new order brings the overlay back even if earlier ones were left for later.
  const visibles = porAceptar.filter((o) => !luego.has(o.id)).sort((a, b) => (a.id === primero ? -1 : b.id === primero ? 1 : 0));
  const o = visibles[0] ?? null;
  if (!porAceptar.length) return null;
  if (!o) {
    return (
      <button type="button" className="btn wa-flotante" onClick={() => setLuego(new Set())}>
        {porAceptar.length === 1 ? "1 pedido de WhatsApp por aceptar" : `${porAceptar.length} pedidos de WhatsApp por aceptar`}
      </button>
    );
  }
  return <Tarjeta key={o.id} o={o} ahora={ahora} quedan={porAceptar.length - 1} onLuego={() => setLuego((x) => new Set([...x, ...porAceptar.map((p) => p.id)]))} />;
}

function Tarjeta({ o, ahora, quedan, onLuego }: { o: PosOrder; ahora: number; quedan: number; onLuego: () => void }) {
  const minutos = Math.max(0, Math.floor((ahora - Date.parse(o.createdAt)) / 60_000));
  const [rechazando, setRechazando] = React.useState(false);
  const [verChat, setVerChat] = React.useState(false);
  const [motivo, setMotivo] = React.useState<MotivoRechazoWa | null>(null);
  const [detalle, setDetalle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const tipo = tipoWa(o);
  const recoge = tipo !== "domicilio";
  // A free nearby point (la droguería, la portería…): the team walks it over.
  const cercano = tipo === "cercano";
  const sigue = tipo === "domicilio"
    ? ["Aceptar", "El admin confirma el pago", "Preparar (se imprime la comanda)", "Domiciliario", "Entregado"]
    : tipo === "cercano"
      ? ["Aceptar", "Preparar (se imprime la comanda)", "Llevarlo", "Entregado y cobrado"]
      : ["Aceptar", "Preparar (se imprime la comanda)", "Listo · le avisamos", "Cobrar y entregar"];
  const tel = o.telefonoRecibe ?? o.customerPhone ?? null;
  const nombre = orderName(o);
  const puedeRechazar = !!motivo && (motivo !== "Otro" || detalle.trim().length > 2);

  const correr = async (accion: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await accion();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "No se pudo guardar.");
    void refreshPendientes();
  };

  return (
    <div className="scrim">
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="wa-t" style={{ maxWidth: 640, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="pill ok" style={{ alignSelf: "flex-start" }}>
              WhatsApp · {cercano ? `Entrega cercana · ${o.direccion}` : recoge ? "Recoger en el café" : "Domicilio"}
            </span>
            <h2 id="wa-t" className="h1">Nuevo pedido {folioTag(o.folio)}{nombre ? ` · ${nombre}` : ""}</h2>
            {!recoge && o.direccion ? (
              <span className="muted" style={{ fontSize: 15 }}>
                {o.direccion}{nombre ? ` · recibe ${nombre}` : ""}{tel ? `, ${tel.replace(/^57(?=3\d{9}$)/, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3")}` : ""}
              </span>
            ) : null}
          </div>
          <span className="cmd-num" style={{ fontSize: 22, fontWeight: 700 }}>{money(o.total)}</span>
        </div>

        <ul className="wa-items-box">
          {o.items.map((it) => (
            <li key={it.id ?? `${it.position}`} style={{ fontSize: 17 }}>
              <b>{it.qty} × {it.name}</b>
              {valores(it.mods).length ? <span className="muted"> · {valores(it.mods).join(", ")}</span> : null}
            </li>
          ))}
        </ul>
        {o.note ? <p className="muted" style={{ margin: 0, fontSize: 15 }}>{o.note}</p> : null}

        <div className="wa-sigue">
          <span className="label">Lo que sigue con este pedido</span>
          <ol>
            {sigue.map((p, i) => (
              <li key={p}><span className={`n${i === 0 ? " now" : ""}`}>{i + 1}</span>{p}</li>
            ))}
          </ol>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setVerChat((v) => !v)} aria-expanded={verChat}>
            {verChat ? "Ocultar conversación" : "Ver conversación"}
          </button>
          {verChat ? <ConversacionWa ordenId={o.id} /> : null}
        </div>

        {error ? <div role="alert" style={{ color: "var(--late)", fontWeight: 600 }}>{error}</div> : null}

        {!rechazando ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost lg" style={{ flex: 1 }} disabled={busy} onClick={() => setRechazando(true)}>
              No podemos
            </button>
            <button type="button" className="btn ok lg" style={{ flex: 2 }} disabled={busy} onClick={() => correr(() => aceptarPedidoWhatsapp({ ordenId: o.id }))}>
              {recoge ? "Aceptar y preparar" : "Aceptar · confirmar pago"}
            </button>
            {!recoge && (
              <p className="muted" style={{ margin: 0, fontSize: 14, flexBasis: "100%" }}>
                Es domicilio: se prepara cuando el admin confirme la transferencia. Al aceptar, le decimos al cliente que estamos confirmando su pago.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="label">¿Por qué no lo podemos preparar? Se lo explicamos al cliente.</span>
            <div className="chips" role="group" aria-label="Motivo">
              {MOTIVOS_RECHAZO_WA.map((m) => (
                <button key={m} type="button" className="chip reason" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>
                  {m}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Detalle {motivo === "Otro" ? "" : "(opcional, ayuda a explicarle)"}</span>
              <input
                id="wa-detalle"
                className="field"
                type="text"
                value={detalle}
                maxLength={160}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder={motivo ? PISTA[motivo] : "Escoge un motivo"}
                style={{ height: 48 }}
              />
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" className="btn ghost lg" style={{ flex: 1 }} disabled={busy} onClick={() => setRechazando(false)}>
                Volver
              </button>
              <button
                type="button"
                className="btn danger lg"
                style={{ flex: 1 }}
                disabled={busy || !puedeRechazar}
                onClick={() => correr(() => rechazarPedidoWhatsapp({ ordenId: o.id, motivo, detalle: detalle.trim() || undefined }))}
              >
                Rechazar pedido
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span className="muted" style={{ fontSize: 14, color: minutos >= 5 ? "var(--late)" : undefined, fontWeight: minutos >= 5 ? 700 : undefined }}>
            {minutos >= 1 ? `El cliente espera hace ${minutos} min` : "El cliente espera la confirmación"}
            {quedan > 0 ? ` · ${quedan} más esperando` : ""}
          </span>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onLuego}>Ver luego</button>
        </div>
      </section>
    </div>
  );
}
