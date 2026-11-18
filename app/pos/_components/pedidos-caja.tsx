"use client";

/**
 * «Caja» on the Pedidos page as a step board, the same look as the WhatsApp
 * one: 1 · Preparar → 2 · Listo → 3 · Entregado, por cobrar. In the café an
 * order may be paid before or after it is made, so paying is a chip and a
 * button, not a column. Each card shows ONE main button (the current step);
 * tapping the card opens it step by step, with every other action of the
 * order (editar, cancelar, descuento, premio, reimprimir) in the full card.
 */
import * as React from "react";
import type { PosOrder } from "@/lib/pos/types";
import { ageLabel, ageMinutes, bogotaClock, folioTag } from "@/lib/pos/pending";
import { modLabels } from "@/lib/pos/detalle";
import { pasoCaja, type PasoCaja } from "@/lib/pos/pasos-caja";
import { chargePending, chargePendingSplit, marcarEntregada, marcarListo, usePos } from "../pos-store";
import { OrderCard, guard, methodWord, money, orderName, owed } from "./ordenes";

const COLUMNAS = [
  { n: 1, titulo: "Preparar", color: "var(--strong)", pie: "Cuando esté en la barra, toca «Ya está listo»." },
  { n: 2, titulo: "Listo", color: "var(--brand)", pie: null },
  { n: 3, titulo: "Entregado · por cobrar", color: "var(--late)", pie: "Ya lo tiene el cliente: falta cobrarle." },
] as const;

const LOCAL_LABEL = { sending: "Enviando…", offline: "Sin enviar · en esta caja", failed: "Error al enviar" } as const;

type Props = { orders: PosOrder[]; onCancel: (id: string) => void; onDescuento: (id: string) => void; onPremio: (id: string) => void };

export function TableroCaja({ orders, onCancel, onDescuento, onPremio }: Props) {
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const tablero = orders.flatMap((o) => {
    const paso = pasoCaja({ ...o, listoAt: o.listoAt ?? null });
    return paso ? [{ o, paso }] : [];
  });
  const sel = abierto ? tablero.find((x) => x.o.id === abierto) ?? null : null;

  return (
    <>
      <div className="wa-board caja-board" aria-label="Pedidos de la caja por paso">
        {COLUMNAS.map((c) => {
          const lista = tablero.filter((x) => x.paso.columna === c.n);
          return (
            <section key={c.n} className="wa-col" aria-labelledby={`caja-col-${c.n}`}>
              <div className="wa-colh">
                <span className="wa-dot" style={{ background: c.color }} aria-hidden="true" />
                <h2 id={`caja-col-${c.n}`}>{c.n} · {c.titulo}</h2>
                <span className="wa-cnt">{lista.length}</span>
              </div>
              <div className="wa-col-list">
                {lista.map(({ o, paso }) => (
                  <CardCaja key={o.id} o={o} paso={paso} onAbrir={() => setAbierto(o.id)} />
                ))}
                {!lista.length && <p className="wa-vacio">{c.n === 1 ? "Todo al día." : "Nada en este paso."}</p>}
              </div>
              {c.pie && lista.length > 0 && <p className="wa-pie">{c.pie}</p>}
            </section>
          );
        })}
      </div>
      {sel && (
        <TarjetaCaja
          o={sel.o}
          paso={sel.paso}
          onClose={() => setAbierto(null)}
          onCancel={() => { setAbierto(null); onCancel(sel.o.id); }}
          onDescuento={() => { setAbierto(null); onDescuento(sel.o.id); }}
          onPremio={() => { setAbierto(null); onPremio(sel.o.id); }}
        />
      )}
    </>
  );
}

function Barras({ paso }: { paso: PasoCaja }) {
  return (
    <div className="wa-steps" aria-label={`Paso ${paso.actual + 1} de ${paso.pasos.length}: ${paso.pasos[paso.actual]}`}>
      {paso.pasos.map((p, i) => (
        <span key={p} className={`st${i < paso.actual ? " done" : i === paso.actual ? " now" : ""}`} />
      ))}
    </div>
  );
}

function lineas(o: PosOrder, groups: Parameters<typeof modLabels>[1]): string[] {
  return [...o.items]
    .sort((a, b) => a.position - b.position)
    .map((it) => {
      const mods = modLabels(it.mods, groups);
      return `${it.qty} ${it.name}${it.customer && o.items.some((x) => x.customer && x.customer !== it.customer) ? ` (${it.customer})` : ""}${mods.length ? ` · ${mods.join(", ")}` : ""}`;
    });
}

/** The payment chip: paid, owed, or a transfer to verify. */
function chipPago(o: PosOrder): { texto: string; ok?: boolean; late?: boolean } {
  if (o.local) return { texto: LOCAL_LABEL[o.local], late: o.local === "failed" };
  if (o.status === "pagada") return { texto: `Pagado${o.paymentMethod ? ` · ${methodWord(o.paymentMethod)}` : ""}`, ok: true };
  if (o.porVerificar === "transferencia" && !o.paid) return { texto: `Transferencia por verificar · ${money(owed(o))}`, late: true };
  if (o.paid > 0) return { texto: `Falta por cobrar ${money(owed(o))}` };
  return { texto: `Por cobrar · ${money(owed(o))}` };
}

function CardCaja({ o, paso, onAbrir }: { o: PosOrder; paso: PasoCaja; onAbrir: () => void }) {
  const s = usePos();
  const nombre = orderName(o) || "Sin nombre";
  const chip = chipPago(o);
  const tarde = paso.columna === 1 && ageMinutes(o.createdAt) > 10;
  const barista = o.baristaId ? s.catalog.equipo.find((m) => m.id === o.baristaId)?.name ?? null : null;
  return (
    <article className="wa-card" aria-labelledby={`caja-${o.id}`}>
      <button type="button" className="wa-card-abrir" onClick={onAbrir} aria-label={`Abrir el pedido ${folioTag(o.folio)} paso a paso`}>
        <span className="wa-top">
          <span id={`caja-${o.id}`} className="wa-folio">{folioTag(o.folio)}</span>
          <span className="wa-who">{nombre}</span>
          <span className={`wa-age${tarde ? " late" : ""}`}>{ageLabel(o.createdAt)}</span>
        </span>
        <span className="caja-chips">
          <span className={`wa-chip${chip.ok ? " ok" : ""}${chip.late ? " late" : ""}`}>{chip.texto}</span>
          {o.seLoLlevamos && <span className="wa-chip">Se lo llevamos</span>}
        </span>
        <span className="wa-items">{lineas(o, s.catalog.modGroups).join(" · ")}</span>
        {barista && <span className="wa-items">Prepara {barista}</span>}
        <Barras paso={paso} />
      </button>
      <AccionesCaja o={o} paso={paso} />
    </article>
  );
}

/** Charge like the old card did: the rest of a split, a transfer to verify, or the whole order. */
function cobrar(o: PosOrder) {
  const esperando = (o.descuentos ?? []).some((d) => d.estado === "pendiente");
  if (esperando && !window.confirm("Hay un descuento esperando la aprobación del dueño. ¿Cobrar con el precio normal?")) return;
  if (!guard()) return;
  if (o.status === "pendiente" && o.paid > 0 && owed(o) > 0) chargePendingSplit(o);
  else if (o.porVerificar === "transferencia" && !o.paid) chargePending(o, "transferencia");
  else chargePending(o);
}

/** The current step's button(s) — the same on the card and in the step view. */
function AccionesCaja({ o, paso }: { o: PosOrder; paso: PasoCaja }) {
  if (o.local) return null;
  const debe = owed(o);
  const verificar = o.porVerificar === "transferencia" && !o.paid;
  const cobrarBtn = (main: boolean) => (
    <button type="button" className={`btn ${main ? "" : "ghost "}wa-btn`} onClick={() => cobrar(o)}>
      {verificar ? "Verificar transferencia" : `Cobrar ${money(debe)}`}
    </button>
  );
  const entregar = (label: string, ghost?: boolean) => (
    <button type="button" className={`btn ${ghost ? "ghost" : "ok"} wa-btn`} onClick={() => void marcarEntregada(o.id, true)}>{label}</button>
  );
  if (paso.columna === 1) {
    return (
      <>
        <button type="button" className="btn wa-btn" onClick={() => void marcarListo(o.id, true)}>Ya está listo</button>
        {debe > 0 && cobrarBtn(false)}
      </>
    );
  }
  if (paso.columna === 2) {
    if (debe > 0) return <>{cobrarBtn(true)}{entregar(o.seLoLlevamos ? "Lo llevé · cobrar después" : "Entregado · cobrar después", true)}</>;
    return entregar(o.seLoLlevamos ? "Lo llevé a la mesa" : "Entregado");
  }
  return cobrarBtn(true);
}

function ahora(o: PosOrder, paso: PasoCaja): { titulo: string; texto: string } {
  const debe = owed(o);
  if (o.local) return { titulo: "Esperando la conexión", texto: "Este pedido está guardado en esta caja y se envía solo cuando vuelva el internet." };
  if (paso.columna === 1) {
    return {
      titulo: "Prepararlo",
      texto: `Prepara el pedido con sus etiquetas. Cuando esté en la barra, toca «Ya está listo».${debe > 0 ? " Si el cliente quiere pagar ya, cóbralo cuando quieras." : ""}`,
    };
  }
  if (paso.columna === 2) {
    if (o.seLoLlevamos) return { titulo: "Llevárselo", texto: debe > 0 ? "Llévaselo a la mesa y cóbrale, o márcalo llevado y cobra después." : "Ya está pagado: llévaselo a la mesa y márcalo." };
    return { titulo: "Entregarlo", texto: debe > 0 ? "Llama al cliente por su nombre, cóbrale y entrégaselo. Si paga después, márcalo entregado." : "Ya está pagado: llama al cliente por su nombre y entrégaselo." };
  }
  return { titulo: "Cobrarle", texto: "El cliente ya tiene su pedido. Cóbrale antes de que se vaya." };
}

function TarjetaCaja({ o, paso, onClose, onCancel, onDescuento, onPremio }: { o: PosOrder; paso: PasoCaja; onClose: () => void; onCancel: () => void; onDescuento: () => void; onPremio: () => void }) {
  const nombre = orderName(o) || "Sin nombre";
  const a = ahora(o, paso);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wa-paso caja-paso" role="dialog" aria-modal="true" aria-labelledby="caja-paso-t">
        <article className="wa-paso-main">
          <div className="wa-paso-h">
            <h2 id="caja-paso-t">{folioTag(o.folio)} · {nombre}</h2>
            <span className="pill">{o.seLoLlevamos ? "Caja · se lo llevamos" : "Caja"}</span>
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

          <section className="wa-ahora" aria-labelledby="caja-ahora-t">
            <div>
              <p className="wa-ahora-k">Ahora te toca</p>
              <h3 id="caja-ahora-t">{a.titulo}</h3>
              <p className="wa-ahora-txt">{a.texto}</p>
            </div>
            <div className="wa-ahora-acts">
              <AccionesCaja o={o} paso={paso} />
            </div>
          </section>

          <div className="wa-paso-pie">
            {paso.columna === 2 && <button type="button" className="btn ghost sm" onClick={() => void marcarListo(o.id, false)}>Aún no está listo</button>}
            {paso.columna === 3 && <button type="button" className="btn ghost sm" onClick={() => void marcarEntregada(o.id, false)}>Deshacer entrega</button>}
          </div>

          <section className="caja-paso-pedido" aria-labelledby="caja-pedido-t">
            <h3 id="caja-pedido-t">El pedido</h3>
            <div className="orders">
              <OrderCard o={o} onCancel={onCancel} onDescuento={onDescuento} onPremio={onPremio} />
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
