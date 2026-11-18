"use client";

/**
 * Pedidos › WhatsApp — the canvas «Pedidos WhatsApp · POS paso a paso»
 * (17-nov). Four columns by step (Por aceptar · Esperando pago · Preparar ·
 * Salida y entrega); every card shows how far it is and ONE main button, the
 * one of its current step. What isn't the barista's to do (approving the
 * transfer) shows as a wait, not a button. Tapping a card opens it step by
 * step (TarjetaPasoWa) with everything the barista needs for that step.
 *
 *   domicilio: Nuevo → Pago (admin) → Preparar → Domiciliario → Entregado
 *   recoger:   Nuevo → Preparar → Listo → Entregado
 *   cercano:   Nuevo → Preparar → Llevar → Entregado
 */
import * as React from "react";
import type { PosOrder } from "@/lib/pos/types";
import { ageLabel, ageMinutes, bogotaClock, folioTag } from "@/lib/pos/pending";
import { modLabels } from "@/lib/pos/detalle";
import { pasoWa, textoDomicilio, type PasoWa } from "@/lib/whatsapp/flujo";
import { enlaceWhatsapp, mensajeDomiciliario } from "@/lib/pos/domiciliarios";
import { useTicketPrinter } from "@/lib/printer/tickets";
import { chargePending, marcarEntregada, printLabelFor, printTicketFor, refreshPendientes, usePos } from "../pos-store";
import { marcarEnCaminoWhatsapp, marcarListoWhatsapp } from "../actions";
import { ConversacionWa } from "./conversacion-wa";
import { guard, methodWord, money, orderName } from "./ordenes";

/** Brings the «Nuevo pedido por WhatsApp» window back up on this order (whatsapp-entrante.tsx listens). */
export const REVISAR_WA = "pos:wa-revisar";
const revisar = (id: string) => window.dispatchEvent(new CustomEvent(REVISAR_WA, { detail: id }));

/** Orders on the WhatsApp board, with their step. */
export function enTablero(orders: PosOrder[]): { o: PosOrder; paso: PasoWa }[] {
  const out: { o: PosOrder; paso: PasoWa }[] = [];
  for (const o of orders) {
    if (o.canal !== "whatsapp" || o.status === "cancelada" || o.local) continue;
    const paso = pasoWa(o);
    if (paso) out.push({ o, paso });
  }
  return out;
}

/** «322 305 5222» from «573223055222». */
const telefono = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const d = t.replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t;
};

const nombreCorto = (n: string) => n.replace(/\s*\(.*\)\s*$/, "");

const COLUMNAS = [
  { n: 1, titulo: "Por aceptar", color: "var(--late)", pie: "Suena cada 5 minutos hasta que alguien lo acepte o diga que no podemos." },
  { n: 2, titulo: "Esperando pago", color: "var(--brand)", pie: "No hay nada que hacer aquí: cuando el admin apruebe, pasa solo a «Preparar» y se imprime la comanda." },
  { n: 3, titulo: "Preparar", color: "var(--strong)", pie: null },
  { n: 4, titulo: "Salida y entrega", color: "var(--ok)", pie: null },
] as const;

export function TableroWa({ orders }: { orders: PosOrder[] }) {
  const s = usePos();
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const tablero = enTablero(orders);
  const sel = abierto ? tablero.find((x) => x.o.id === abierto) ?? null : null;

  return (
    <>
      <div className="wa-board" aria-label="Pedidos de WhatsApp por paso">
        {COLUMNAS.map((c) => {
          const lista = tablero.filter((x) => x.paso.columna === c.n);
          return (
            <section key={c.n} className="wa-col" aria-labelledby={`wa-col-${c.n}`}>
              <div className="wa-colh">
                <span className="wa-dot" style={{ background: c.color }} aria-hidden="true" />
                <h2 id={`wa-col-${c.n}`}>{c.n} · {c.titulo}</h2>
                <span className="wa-cnt">{lista.length}</span>
              </div>
              <div className="wa-col-list">
                {lista.map(({ o, paso }) => (
                  <CardWa key={o.id} o={o} paso={paso} onAbrir={() => setAbierto(o.id)} domiciliarios={s.catalog.pago.domiciliarios ?? []} />
                ))}
                {!lista.length && <p className="wa-vacio">Nada en este paso.</p>}
              </div>
              {c.pie && lista.length > 0 && <p className="wa-pie">{c.pie}</p>}
            </section>
          );
        })}
      </div>
      {sel && <TarjetaPasoWa o={sel.o} paso={sel.paso} onClose={() => setAbierto(null)} />}
    </>
  );
}

/** The thin step bar on a card: green done, yellow now, gray to go. */
function Barras({ paso }: { paso: PasoWa }) {
  return (
    <div className="wa-steps" aria-label={`Paso ${paso.actual + 1} de ${paso.pasos.length}: ${paso.pasos[paso.actual]}`}>
      {paso.pasos.map((p, i) => (
        <span key={p} className={`st${i < paso.actual ? " done" : i === paso.actual ? " now" : ""}`} />
      ))}
    </div>
  );
}

function chipDe(o: PosOrder, paso: PasoWa): { texto: string; ok?: boolean } {
  if (o.waEstado === "en_camino") return { texto: paso.tipo === "cercano" ? `Llevándolo · ${o.direccion ?? ""}` : "En camino con el domiciliario", ok: true };
  if (paso.tipo === "recoge") return { texto: o.waEstado === "listo" ? "Listo · esperando al cliente" : "Recoge en el café" };
  if (paso.tipo === "cercano") return { texto: `Entrega cercana · ${o.direccion ?? ""}` };
  return { texto: o.direccion ? `Domicilio · ${o.direccion}` : "Domicilio" };
}

function lineas(o: PosOrder, groups: Parameters<typeof modLabels>[1]): string[] {
  return [...o.items]
    .sort((a, b) => a.position - b.position)
    .map((it) => {
      const mods = modLabels(it.mods, groups);
      return `${it.qty} ${it.name}${mods.length ? ` · ${mods.join(", ")}` : ""}`;
    });
}

function CardWa({ o, paso, onAbrir, domiciliarios }: { o: PosOrder; paso: PasoWa; onAbrir: () => void; domiciliarios: { nombre: string; numero: string }[] }) {
  const s = usePos();
  const nombre = orderName(o) || "Sin nombre";
  const chip = chipDe(o, paso);
  const tarde = ageMinutes(o.createdAt) > 10;
  return (
    <article className={`wa-card${paso.columna === 1 ? " nuevo" : ""}`} aria-labelledby={`wa-${o.id}`}>
      <button type="button" className="wa-card-abrir" onClick={onAbrir} aria-label={`Abrir el pedido ${folioTag(o.folio)} paso a paso`}>
        <span className="wa-top">
          <span id={`wa-${o.id}`} className="wa-folio">{folioTag(o.folio)}</span>
          <span className="wa-who">{nombre}</span>
          <span className={`wa-age${tarde ? " late" : ""}`}>{ageLabel(o.createdAt)}</span>
        </span>
        <span className={`wa-chip${chip.ok ? " ok" : ""}`}>{chip.texto}</span>
        <span className="wa-items">{lineas(o, s.catalog.modGroups).join(" · ")}</span>
        {o.domicilioCop ? <span className="wa-items">🛵 Domicilio {textoDomicilio(o.domicilioCop, o.domicilioTransferido)}</span> : null}
        <Barras paso={paso} />
      </button>
      <Acciones o={o} paso={paso} domiciliarios={domiciliarios} compacto />
    </article>
  );
}

/**
 * The current step's buttons — the same on the card and in the step view.
 * `compacto` (the card) keeps the courier links to the first one.
 */
function Acciones({ o, paso, domiciliarios, compacto }: { o: PosOrder; paso: PasoWa; domiciliarios: { nombre: string; numero: string }[]; compacto?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const correr = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) window.alert(r.error ?? "No se pudo guardar.");
    void refreshPendientes();
  };
  const e = o.waEstado;
  const pagado = o.status === "pagada";
  const cobrar = () => { if (guard()) chargePending(o); };
  const entregar = () => void marcarEntregada(o.id, true).then(() => refreshPendientes());

  if (e === "por_aceptar") return <button type="button" className="btn wa-btn" onClick={() => revisar(o.id)}>Revisar y aceptar</button>;
  if (e === "esperando_pago") {
    return (
      <div className="wa-wait">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        El admin está confirmando la transferencia
      </div>
    );
  }
  const contactos = paso.tipo === "domicilio" && (e === "listo" || !compacto) ? <Contactar o={o} domiciliarios={compacto ? domiciliarios.slice(0, 1) : domiciliarios} /> : null;
  if (e === "en_preparacion" || e === "aceptado") {
    if (paso.tipo === "cercano") return <button type="button" className="btn wa-btn" disabled={busy} onClick={() => void correr(() => marcarEnCaminoWhatsapp({ ordenId: o.id }))}>Listo · llevarlo</button>;
    return (
      <>
        {contactos}
        <button type="button" className="btn wa-btn" disabled={busy} onClick={() => void correr(() => marcarListoWhatsapp({ ordenId: o.id }))}>
          {paso.tipo === "recoge" ? "Listo para recoger" : "Ya está listo"}
        </button>
      </>
    );
  }
  if (e === "listo" && paso.tipo === "domicilio") {
    return (
      <>
        {contactos}
        <button type="button" className="btn ok wa-btn" disabled={busy} onClick={() => void correr(() => marcarEnCaminoWhatsapp({ ordenId: o.id }))}>Salió con el domiciliario</button>
      </>
    );
  }
  // Pick-up waiting at the counter, or a delivery / nearby point on its way.
  if (!pagado) return <button type="button" className="btn wa-btn" onClick={cobrar}>Cobrar {money(Math.max(0, o.total - o.paid))}</button>;
  if (o.entregadaAt) return null;
  return (
    <button type="button" className={`btn ${e === "en_camino" && paso.tipo === "domicilio" ? "ghost" : "ok"} wa-btn`} onClick={entregar}>
      {paso.tipo === "recoge" ? "Entregado" : "Marcar entregado"}
    </button>
  );
}

function Contactar({ o, domiciliarios }: { o: PosOrder; domiciliarios: { nombre: string; numero: string }[] }) {
  if (!domiciliarios.length) return <span className="wa-nota">Agrega domiciliarios en Ajustes › Sede</span>;
  return (
    <>
      {domiciliarios.map((d) => (
        <a
          key={d.numero}
          className="btn ghost wa-btn"
          href={enlaceWhatsapp(d.numero, mensajeDomiciliario(d, { folio: o.folio, cliente: orderName(o), telefono: o.telefonoRecibe ?? o.customerPhone ?? null, direccion: o.direccion ?? null, items: o.items, total: o.total, pagado: o.status === "pagada" }))}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" /></svg>
          Contactar a {nombreCorto(d.nombre)}
        </a>
      ))}
    </>
  );
}

/** «Ahora te toca»: what the step asks, in the barista's words. */
function ahora(o: PosOrder, paso: PasoWa): { titulo: string; texto: string } {
  const e = o.waEstado;
  const pagado = o.status === "pagada";
  if (e === "por_aceptar") return { titulo: "Revisar y aceptar el pedido", texto: "Mira qué pidió y acéptalo, o escoge por qué no podemos y se lo explicamos al cliente." };
  if (e === "esperando_pago") return { titulo: "Esperar la aprobación del pago", texto: "El admin está confirmando la transferencia. Cuando la apruebe, pasa solo a «Preparar» y la caja imprime la comanda." };
  if (e === "en_preparacion" || e === "aceptado") {
    if (paso.tipo === "cercano") return { titulo: "Prepararlo y llevarlo", texto: `La comanda ya salió en la caja. Cuando esté listo, toca «Listo · llevarlo» y le avisamos al cliente que va en camino a ${o.direccion ?? "su punto"}. Cobra al entregar.` };
    if (paso.tipo === "recoge") return { titulo: "Prepararlo", texto: "La comanda ya salió en la caja. Cuando esté listo, toca «Listo para recoger» y le avisamos al cliente que puede pasar." };
    return { titulo: "Prepararlo", texto: "La comanda ya salió en la caja. Mientras lo preparas puedes escribirle al domiciliario; cuando esté listo, toca «Ya está listo»." };
  }
  if (e === "listo" && paso.tipo === "domicilio") return { titulo: "Llamar al domiciliario y despacharlo", texto: "Toca «Contactar» y se abre WhatsApp con el pedido escrito. Cuando el domiciliario lo recoja, toca «Salió» y le avisamos al cliente." };
  if (e === "listo") return pagado
    ? { titulo: "Entregarlo cuando pase", texto: "Ya está pagado. Cuando el cliente pase, entrégaselo y márcalo entregado." }
    : { titulo: "Cobrar y entregar cuando pase", texto: "Ya le avisamos que está listo. Cuando pase, cóbrale como cualquier pedido y márcalo entregado." };
  if (paso.tipo === "cercano") return pagado
    ? { titulo: "Confirmar la entrega", texto: "Ya está cobrado. Márcalo entregado cuando llegue a su punto." }
    : { titulo: "Entregarlo y cobrar", texto: `Lo lleva alguien del equipo a ${o.direccion ?? "su punto"} y cobra al entregar. Luego márcalo entregado.` };
  return { titulo: "Confirmar la entrega", texto: "Va en camino con el domiciliario. Cuando lo entregue, márcalo entregado." };
}

function pagoTexto(o: PosOrder, paso: PasoWa): { texto: string; ok: boolean } {
  if (o.status === "pagada") return { texto: `${money(o.total)} · ${methodWord(o.paymentMethod) || "pagado"}${paso.tipo === "domicilio" ? " aprobada por el admin" : ""}`, ok: true };
  if (o.waEstado === "esperando_pago") return { texto: `${money(o.total)} · transferencia por confirmar`, ok: false };
  if (paso.tipo === "domicilio") return { texto: `${money(o.total)} · sin pago registrado`, ok: false };
  return { texto: `${money(o.total)} · paga al ${paso.tipo === "recoge" ? "recogerlo" : "recibirlo"}`, ok: false };
}

const TIPO_LABEL = { domicilio: "Domicilio", recoge: "Recoger en el café", cercano: "Entrega cercana" } as const;

/** The order step by step (board 2 of the canvas). */
export function TarjetaPasoWa({ o, paso, onClose }: { o: PosOrder; paso: PasoWa; onClose: () => void }) {
  const s = usePos();
  const tickets = useTicketPrinter().modo !== "no";
  const [chat, setChat] = React.useState(false);
  const nombre = orderName(o) || "Sin nombre";
  const a = ahora(o, paso);
  const pago = pagoTexto(o, paso);
  const tel = telefono(o.telefonoRecibe ?? o.customerPhone);
  const preparando = o.waEstado === "por_aceptar" || o.waEstado === "esperando_pago";
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    // «Revisar y aceptar» opens the new-order window: this one steps aside.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(REVISAR_WA, onClose);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener(REVISAR_WA, onClose); };
  }, [onClose]);

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wa-paso" role="dialog" aria-modal="true" aria-labelledby="wa-paso-t">
        <article className="wa-paso-main">
          <div className="wa-paso-h">
            <h2 id="wa-paso-t">{folioTag(o.folio)} · {nombre}</h2>
            <span className="pill">WhatsApp · {TIPO_LABEL[paso.tipo]}</span>
            <span className="grow" />
            <span className="muted wa-paso-hora">pidió a las {bogotaClock(o.createdAt)} · hace {ageLabel(o.createdAt)}</span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <ol className="wa-stepper" aria-label="Pasos del pedido">
            {paso.pasos.map((p, i) => {
              const est = i < paso.actual ? "done" : i === paso.actual ? "now" : "";
              return (
                <li key={p} className="wa-step" aria-current={i === paso.actual ? "step" : undefined}>
                  {i < paso.pasos.length - 1 && <span className={`wa-bar${i < paso.actual ? " done" : ""}`} />}
                  <span className={`wa-bub ${est}`} aria-hidden="true">
                    {i < paso.actual ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg> : i + 1}
                  </span>
                  <span className={`wa-lbl ${est}`}>{p}{i < paso.actual ? <span className="sr-only"> (hecho)</span> : null}</span>
                </li>
              );
            })}
          </ol>

          <section className="wa-ahora" aria-labelledby="wa-ahora-t">
            <div>
              <p className="wa-ahora-k">Ahora te toca</p>
              <h3 id="wa-ahora-t">{a.titulo}</h3>
              <p className="wa-ahora-txt">{a.texto}</p>
            </div>
            <div className="wa-ahora-acts">
              <Acciones o={o} paso={paso} domiciliarios={s.catalog.pago.domiciliarios ?? []} />
            </div>
          </section>

          <dl className="wa-kv">
            <dt>Recibe</dt><dd>{nombre}{tel ? ` · ${tel}` : ""}</dd>
            {o.direccion && (<><dt>{paso.tipo === "cercano" ? "Punto" : "Dirección"}</dt><dd>{o.direccion}</dd></>)}
            <dt>Productos</dt><dd>{lineas(o, s.catalog.modGroups).join(" · ")}</dd>
            {o.note.trim() && (<><dt>Nota</dt><dd>{o.note}</dd></>)}
            <dt>Pago</dt><dd className={pago.ok ? "wa-ok" : undefined}>{pago.texto}</dd>
            {o.domicilioCop != null && (<><dt>Domicilio</dt><dd>{textoDomicilio(o.domicilioCop, o.domicilioTransferido)}</dd></>)}
            <dt>Comanda</dt><dd>{o.comandaImpresa ? "Impresa en la caja" : preparando ? "Se imprime sola cuando pase a «Preparar»" : "Aún sin imprimir"}</dd>
          </dl>

          {chat && <ConversacionWa ordenId={o.id} alto={360} />}

          <div className="wa-paso-pie">
            <button type="button" className="btn ghost sm" aria-expanded={chat} onClick={() => setChat((v) => !v)}>{chat ? "Ocultar conversación" : "Ver conversación"}</button>
            {tickets && !preparando && <button type="button" className="btn ghost sm" onClick={() => printTicketFor(o, "comanda")}>Reimprimir comanda</button>}
            {!preparando && <button type="button" className="btn ghost sm" onClick={() => printLabelFor(o)}>Reimprimir etiquetas</button>}
            {paso.tipo === "domicilio" && <span className="muted wa-paso-nota">El domicilio se lo pagamos al domiciliario por transferencia</span>}
          </div>
        </article>

        <aside className="wa-paso-aside" aria-label="Pasos según el tipo de pedido">
          <h3>Los pasos cambian según cómo lo recibe</h3>
          <FlujoTipo titulo="Domicilio" pasos={["Nuevo", "Pago (admin)", "Preparar", "Domiciliario", "Entregado"]} actual={paso.tipo === "domicilio" ? paso.actual : -1} texto="Se paga por transferencia antes. El admin la confirma; el barista solo ve la espera." />
          <FlujoTipo titulo="Recoger en el café" pasos={["Nuevo", "Preparar", "Listo", "Entregado"]} actual={paso.tipo === "recoge" ? paso.actual : -1} texto="Paga al recogerlo: se cobra en la caja como cualquier pedido." />
          <FlujoTipo titulo="Entrega cercana gratis" pasos={["Nuevo", "Preparar", "Llevar", "Entregado"]} actual={paso.tipo === "cercano" ? paso.actual : -1} texto="La droguería o la portería del hospital. Lo lleva alguien del equipo y cobra al entregar." />
        </aside>
      </div>
    </div>
  );
}

function FlujoTipo({ titulo, pasos, actual, texto }: { titulo: string; pasos: string[]; actual: number; texto: string }) {
  return (
    <section className={`wa-tipo${actual >= 0 ? " este" : ""}`}>
      <h4>{titulo}</h4>
      <div className="wa-mini">
        {pasos.map((p, i) => (
          <span key={p} className={`m${actual < 0 ? "" : i < actual ? " done" : i === actual ? " now" : ""}`}>{p}</span>
        ))}
      </div>
      <p>{texto}</p>
    </section>
  );
}
