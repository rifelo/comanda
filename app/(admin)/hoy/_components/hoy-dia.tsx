import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Plus, ShoppingBag } from "lucide-react";
import { loadNumerosDia } from "@/lib/numeros/data";
import { loadPorAtender, loadTurnosDia, type TurnoDia } from "@/lib/numeros/hoy-db";
import { ESTADO_TURNO, fechaLarga, fechaTitulo, porAtender } from "@/lib/numeros/hoy";
import { METODOS, METODO_LABEL, addDays, diaSemana, horaEnTz } from "@/lib/numeros/dia";
import type { NumerosDia } from "@/lib/numeros/data";
import { CATEGORIA_GASTO, CUENTA_GASTO, moneyGasto, resumenGastos } from "@/lib/gastos/gastos";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, formatTime, nowInTz, todayInTz } from "@/lib/utils";
import { Avatar, Button, Card, EmptyState, IconButton, LinkCard, Pill, ProgressBar, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { llenarTurno } from "../actions";
import { AutoRefresh } from "./auto-refresh";
import { FechaPicker } from "./fecha-picker";
import { Rentabilidad } from "./rentabilidad";
import { VentasHoraChart } from "./ventas-hora-chart";
import { VerificarConteo } from "./verificar-conteo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const money = (n: number) => (n < 0 ? `−${posMoney(-n)}` : posMoney(n));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const TOP = 8;

/**
 * The owner's home (docs/redesign/PLAN.md §2.3): Números + Hoy in one page.
 * Phone = one column ordered by urgency (ventas → caja → por atender →
 * turnos → …); ≥ lg = main column + 360 px aside, like the tablet
 * reference. The two column wrappers are `display: contents` below lg so
 * every block can take its phone `order`. Read-only except «Llenar turno».
 */
export async function HoyDia({
  db,
  orgId,
  sede,
  date,
}: {
  db: Db;
  orgId: string;
  sede: { id: string; name: string; tz: string } | null;
  date: string;
}) {
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const esHoy = date === today;
  const now = new Date();

  const [n, turnos, pendientes] = await Promise.all([
    loadNumerosDia(db, { orgId, sedeId: sede?.id ?? null, tz, date, now }),
    sede ? loadTurnosDia(db, sede, date, esHoy) : Promise.resolve([] as TurnoDia[]),
    sede && esHoy ? loadPorAtender(db, { orgId, sedeId: sede.id, tz }) : Promise.resolve(null),
  ]);

  const href = (d: string) => (d === today ? "/hoy" : `/hoy/${d}`);
  const abierto = turnos.find((t) => t.estado === "en_curso" && t.shiftId) ?? null;
  const porCobrar = n.abiertos.reduce((s, o) => s + (o.total - o.abonado), 0);
  const items = pendientes
    ? porAtender(
        {
          ...pendientes,
          date,
          turnosPorRevisar: turnos.filter((t) => t.estado === "por_revisar").length,
          pedidosAbiertos: n.abiertos.length,
          pedidosViejos: n.abiertos.filter((o) => o.viejo).length,
          porCobrar,
        },
        posMoney,
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-[1240px] pb-12" data-testid="hoy">
      {esHoy ? <AutoRefresh seconds={60} /> : null}

      {/* ── encabezado + navegación por fecha ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-7 pt-5 pb-4">
        <div className="flex-1 min-w-[180px]">
          <h1 className="ui-h1 m-0">{esHoy ? "Hoy" : fechaTitulo(date)}</h1>
          <p className="ui-sub m-0 mt-1 first-letter:uppercase">
            {fechaLarga(date)}
            {sede ? ` · ${sede.name}` : ""}
            {esHoy ? ` · en vivo ${nowInTz(tz, now)}` : ""}
          </p>
        </div>
        <nav aria-label="Cambiar de día" className="flex items-center gap-2">
          <IconButton label="Día anterior" size="sm" href={href(addDays(date, -1))}>
            <ChevronLeft size={20} aria-hidden />
          </IconButton>
          <FechaPicker date={date} today={today} />
          {esHoy ? (
            <span aria-hidden className="size-11 shrink-0" />
          ) : (
            <IconButton label="Día siguiente" size="sm" href={href(addDays(date, 1))}>
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          )}
          {esHoy ? null : (
            <Button href="/hoy" variant="ghost" size="sm">
              Hoy
            </Button>
          )}
        </nav>
        {esHoy ? (
          <div className="flex w-full sm:w-auto gap-2">
            {abierto ? (
              <Button
                href={`/hoy/${date}/turnos?turno=${abierto.shiftId}#asignar`}
                variant="ghost"
                size="sm"
                className="flex-1 sm:flex-none"
                icon={<Plus size={18} aria-hidden />}
              >
                Inmediata
              </Button>
            ) : null}
            <Button href="/pos" variant="ghost" size="sm" className="flex-1 sm:flex-none" icon={<ShoppingBag size={18} aria-hidden />}>
              Abrir POS
            </Button>
          </div>
        ) : null}
      </div>

      <div className="px-4 sm:px-7 flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ── columna principal ── */}
        <div className="contents lg:flex lg:flex-col lg:gap-5 lg:min-w-0">
          <VentasCard n={n} className="max-lg:order-1" />
          <TurnosSection turnos={turnos} date={date} esHoy={esHoy} tz={tz} className="max-lg:order-4" />
          <HorasCard n={n} tz={tz} now={now} className="max-lg:order-5" />
          <TopCard n={n} className="max-lg:order-6" />
          <section aria-labelledby="rentable" className="flex flex-col gap-3 max-lg:order-7 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="rentable" className="ui-h2 m-0">
                ¿El día fue rentable?
              </h2>
              {/* TODO(Ola 3): /recetas → /productos */}
              <Link href="/recetas" className="text-[15px] font-semibold text-text">
                Costos y recetas →
              </Link>
            </div>
            <Rentabilidad r={n.rentabilidad} esHoy={n.esHoy} />
          </section>
          <CanceladosCard n={n} tz={tz} className="max-lg:order-11" />
        </div>

        {/* ── columna lateral ── */}
        <div className="contents lg:flex lg:flex-col lg:gap-5 lg:min-w-0">
          <CajaCard n={n} tz={tz} className="max-lg:order-2" />
          {items ? <PorAtenderCard items={items} className="max-lg:order-3" /> : null}
          <AbiertosCard n={n} tz={tz} className="max-lg:order-8" />
          <GastosCard n={n} className="max-lg:order-8" />
          <NovedadesCard n={n} tz={tz} date={date} className="max-lg:order-9" />
          <Card aria-labelledby="tu-conteo" className="max-lg:order-10">
            <div>
              <h2 id="tu-conteo" className="ui-title m-0">
                Tu conteo
              </h2>
              <p className="ui-sub m-0 mt-0.5">Verifica el día con lo que tienes en la mano. Se guarda sólo en este dispositivo.</p>
            </div>
            <VerificarConteo
              date={date}
              esperado={{
                efectivo: n.resumen.cobros.efectivo.monto,
                transferencia: n.resumen.cobros.transferencia.monto,
                tarjeta: n.resumen.cobros.tarjeta.monto,
              }}
              hints={{
                efectivo: `Efectivo de las ventas, sin la base${n.caja.base ? ` de ${posMoney(n.caja.base)}` : ""}.`,
                transferencia: "Lo que llegó a la cuenta o la billetera.",
                tarjeta: "El cierre del datáfono.",
              }}
            />
          </Card>
        </div>
      </div>

      <p className="ui-sub px-4 sm:px-7 mt-8 max-w-[820px] text-[13px] leading-relaxed">
        Ventas = pedidos creados ese día y ya pagados. Lo que entró = todos los cobros del día por método, incluidos los abonos a
        pedidos abiertos. La diferencia de caja compara lo que el arqueo dice que entró (contado − base inicial) con el efectivo
        cobrado hasta ese momento. Costo de venta = el costo actual de la receta de cada producto.
      </p>
    </div>
  );
}

// ── bloques ─────────────────────────────────────────────────────────

function VentasCard({ n, className }: { n: NumerosDia; className?: string }) {
  const r = n.resumen;
  const previo = `${diaSemana(n.previa)} pasado${n.esHoy ? " a esta hora" : ""}`;
  const pct = r.comparacion.pct;
  return (
    <Card aria-labelledby="ventas" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="ventas" className="ui-label m-0">
            {n.esHoy ? "Ventas de hoy" : "Ventas del día"}
          </h2>
          <span className="font-bold ui-num leading-none tracking-[-0.02em] text-[40px] sm:text-[48px]">{posMoney(r.ventas.total)}</span>
          <span className="ui-sub">
            {plural(r.ventas.pedidos, "pedido", "pedidos")}
            {r.ventas.pedidos > 0 ? ` · ticket ${posMoney(r.ventas.ticket)}` : ""}
          </span>
        </div>
        {pct == null ? (
          <Pill>Sin ventas el {previo}</Pill>
        ) : (
          <span className="flex flex-col items-end gap-1">
            <Pill tone={pct > 0 ? "ok" : pct < 0 ? "late" : "neutral"}>
              <span className="ui-num">
                {pct > 0 ? "▲ +" : pct < 0 ? "▼ −" : "= "}
                {Math.abs(pct)} %
              </span>
            </Pill>
            <span className="ui-sub text-[13px] text-right">
              vs {previo} · {posMoney(r.comparacion.total)}
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {METODOS.map((m) => {
          const c = r.cobros[m];
          const share = r.cobros.total > 0 ? Math.round((c.monto / r.cobros.total) * 100) : 0;
          return (
            <div key={m} className="rounded-btn bg-surface-2 px-3 py-3 flex flex-col gap-1 min-w-0" data-testid={`cobro-${m}`}>
              <span className="ui-label truncate">{METODO_LABEL[m]}</span>
              <span className={cn("ui-num font-bold text-[17px] sm:text-[20px] leading-tight truncate", !c.monto && "text-muted")}>{posMoney(c.monto)}</span>
              <span className="ui-sub text-[12px] ui-num">
                {share} % · {plural(c.pagos, "cobro", "cobros")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
        <span className="text-[15px]">
          <span className="ui-label mr-2">Total cobrado</span>
          <b className="ui-num">{posMoney(r.cobros.total)}</b>
        </span>
        <Cuadre cuadre={r.cuadre} vendido={r.ventas.total} />
      </div>
    </Card>
  );
}

function Cuadre({ cuadre, vendido }: { cuadre: NumerosDia["resumen"]["cuadre"]; vendido: number }) {
  if (cuadre.diferencia === 0 && cuadre.sinExplicar === 0) {
    return <span className="text-[14px] font-semibold text-ok">✓ Coincide con lo vendido</span>;
  }
  return (
    <span className="text-[13px] text-muted text-right leading-snug">
      vendido {posMoney(vendido)}
      {cuadre.ajustes.map((a) => (
        <span key={a.label}>
          {" "}
          · <span className="ui-num">{a.monto > 0 ? "+" : "−"}{posMoney(Math.abs(a.monto))}</span> {a.label}
        </span>
      ))}
      {cuadre.sinExplicar !== 0 ? <b className="text-late"> · {money(cuadre.sinExplicar)} sin explicar</b> : null}
    </span>
  );
}

function TurnosSection({ turnos, date, esHoy, tz, className }: { turnos: TurnoDia[]; date: string; esHoy: boolean; tz: string; className?: string }) {
  return (
    <section aria-labelledby="turnos-dia" className={cn("flex flex-col gap-3 min-w-0", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="turnos-dia" className="ui-h2 m-0">
          {esHoy ? "Turnos de hoy" : "Turnos del día"}
        </h2>
        <Link href={`/hoy/${date}/turnos`} className="text-[15px] font-semibold text-text">
          Detalle →
        </Link>
      </div>
      {turnos.length === 0 ? (
        <EmptyState
          title="Sin turnos este día"
          text="Los turnos se definen en Equipo → Turnos."
          action={
            <Button href="/equipo/turnos" variant="ghost" size="sm">
              Ver turnos
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {turnos.map((t) => (
            <TurnoCard key={t.templateId} t={t} date={date} esHoy={esHoy} tz={tz} />
          ))}
        </div>
      )}
    </section>
  );
}

function TurnoCard({ t, date, esHoy, tz }: { t: TurnoDia; date: string; esHoy: boolean; tz: string }) {
  const estado = ESTADO_TURNO[t.estado];
  const detalle = t.shiftId ? `/hoy/${date}/turnos?turno=${t.shiftId}` : null;
  const meta = [
    t.atrasadas > 0 ? { text: plural(t.atrasadas, "atrasada", "atrasadas"), late: true } : null,
    t.novedades > 0 ? { text: plural(t.novedades, "novedad", "novedades"), late: false } : null,
    t.fotosPendientes > 0 && t.estado !== "por_abrir" ? { text: plural(t.fotosPendientes, "foto pendiente", "fotos pendientes"), late: false } : null,
  ].filter((x): x is { text: string; late: boolean } => !!x);
  return (
    <Card tight as="article" aria-label={t.name} data-testid="turno-card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="ui-title m-0 truncate">{t.name}</h3>
          <p className="ui-sub m-0 ui-num">{t.horario}</p>
        </div>
        <Pill tone={estado.tone}>{estado.label}</Pill>
      </div>
      <div className="flex items-center gap-2.5 min-w-0">
        {t.persona ? <Avatar name={t.persona} size="sm" /> : null}
        <span className={cn("text-[15px] truncate", !t.persona && "text-muted")}>{t.persona ?? "Sin asignar"}</span>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={t.total ? t.done / t.total : 0} label={`${t.done} de ${t.total} tareas`} className="flex-1" />
        <span className="ui-num text-[15px] font-semibold shrink-0">
          {t.done}/{t.total}
        </span>
      </div>
      {meta.length || t.revisadoAt ? (
        <p className="m-0 text-[14px] text-muted leading-snug">
          {meta.map((m, i) => (
            <span key={m.text} className={m.late ? "text-late font-semibold" : undefined}>
              {i ? " · " : ""}
              {m.text}
            </span>
          ))}
          {t.revisadoAt ? (
            <span className="text-ok">
              {meta.length ? " · " : ""}✓ revisado{t.revisadoPor ? ` por ${t.revisadoPor}` : ""} · {formatTime(t.revisadoAt, tz)}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="flex gap-2 pt-1">
        {esHoy && (t.estado === "por_abrir" || t.estado === "en_curso") ? (
          <form action={llenarTurno} className="flex-1">
            <input type="hidden" name="template_id" value={t.templateId} />
            <button type="submit" className={buttonClass({ variant: "ghost", size: "sm", block: true })}>
              <ClipboardList size={18} aria-hidden />
              Llenar turno
            </button>
          </form>
        ) : null}
        {detalle ? (
          <Link href={detalle} className={cn(buttonClass({ variant: t.estado === "por_revisar" ? "primary" : "ghost", size: "sm" }), "flex-1")}>
            {t.estado === "por_revisar" ? "Revisar" : "Ver detalle"}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function HorasCard({ n, tz, now, className }: { n: NumerosDia; tz: string; now: Date; className?: string }) {
  const r = n.resumen;
  return (
    <Card aria-labelledby="por-hora" className={className}>
      <h2 id="por-hora" className="ui-title m-0">
        Ventas por hora
      </h2>
      {r.horas.length === 0 ? (
        <p className="ui-sub m-0">Sin ventas {n.esHoy ? "todavía" : "ese día"}.</p>
      ) : (
        <VentasHoraChart
          horas={r.horas}
          diaLabel={n.esHoy ? "Hoy" : fechaCorta(n.date)}
          previoLabel={`${diaSemana(n.previa)} pasado`}
          horaActual={n.esHoy ? horaEnTz(now.toISOString(), tz) : null}
        />
      )}
    </Card>
  );
}

function TopCard({ n, className }: { n: NumerosDia; className?: string }) {
  const prods = n.resumen.productos;
  const max = Math.max(1, ...prods.map((p) => p.unidades));
  const unidades = prods.reduce((s, p) => s + p.unidades, 0);
  return (
    <Card aria-labelledby="top" className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="top" className="ui-title m-0">
          Más vendidos
        </h2>
        {prods.length ? <span className="ui-sub ui-num">{plural(unidades, "unidad", "unidades")}</span> : null}
      </div>
      {prods.length === 0 ? (
        <p className="ui-sub m-0">Sin ventas {n.esHoy ? "todavía" : "ese día"}.</p>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col">
          {prods.slice(0, TOP).map((p, i) => (
            <li key={p.key} className="py-2.5 border-b border-line last:border-b-0">
              <div className="flex items-baseline gap-3 text-[15px]">
                <span className="ui-num text-muted w-5 text-right text-[13px]">{i + 1}</span>
                <span className={cn("flex-1 min-w-0 truncate", i === 0 && "font-semibold")}>{p.name}</span>
                <span className="ui-num font-semibold">{p.unidades}</span>
                <span className="ui-num text-muted text-[13px] w-[78px] text-right">{posMoney(p.ingreso)}</span>
              </div>
              <div aria-hidden className="ml-8 mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-strong opacity-70" style={{ width: `${Math.max(3, (p.unidades / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {prods.length > TOP ? (
        <p className="ui-sub m-0 text-[13px]">
          + {prods.length - TOP} productos más · {prods.slice(TOP).reduce((s, p) => s + p.unidades, 0)} unidades
        </p>
      ) : null}
    </Card>
  );
}

function CajaCard({ n, tz, className }: { n: NumerosDia; tz: string; className?: string }) {
  const caja = n.caja;
  const last = caja.arqueos[caja.arqueos.length - 1] ?? null;
  const diff = caja.diferencia ?? 0;
  return (
    <Card aria-labelledby="caja-dia" className={className} data-testid="caja-dia">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="caja-dia" className="ui-label m-0">
          {last ? "Caja · contra el arqueo" : "Debería haber en caja"}
        </h2>
        <Link href="/caja" className="text-[14px] font-semibold text-text">
          Arqueos →
        </Link>
      </div>
      {last ? (
        <>
          <span className={cn("font-bold ui-num leading-none tracking-[-0.02em] text-[34px]", diff === 0 ? "text-ok" : diff < 0 ? "text-late" : "text-text")}>
            {diff === 0 ? "Cuadra" : diff < 0 ? `Faltan ${posMoney(-diff)}` : `Sobran ${posMoney(diff)}`}
          </span>
          <dl className="m-0 flex flex-col text-[14px]">
            <Linea label={caja.efectivoDespues > 0 ? "Efectivo cobrado hasta el arqueo" : "Efectivo cobrado"} value={posMoney(caja.efectivoHastaArqueo)} />
            <Linea
              label="Entró según el arqueo"
              hint={caja.arqueos.length === 1 ? `contado ${posMoney(last.contado)} − base ${posMoney(last.baseInicial)}` : `${caja.arqueos.length} conteos`}
              value={money(caja.entro)}
            />
            {caja.efectivoDespues > 0 ? <Linea label="Debería haber ahora" value={posMoney(caja.enCaja)} strong /> : null}
          </dl>
          <ul className="m-0 p-0 list-none flex flex-col gap-2 border-t border-line pt-3">
            {caja.arqueos.map((a) => (
              <li key={a.id} className="text-[13px] leading-snug">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[14px]">{a.turno ?? "Arqueo"}</b>
                  <span className="text-muted ui-num">
                    {formatTime(a.at, tz)}
                    {a.contadoPor ? ` · ${a.contadoPor}` : ""}
                  </span>
                  <Pill tone={a.status === "aprobado" ? "ok" : "brand"} className="!text-[12px]">
                    {a.status === "aprobado" ? "Aprobado" : "Por aprobar"}
                  </Pill>
                </div>
                <div className="text-muted ui-num">
                  contado {posMoney(a.contado)} · deja {posMoney(a.baseDejada)} · entrega {money(a.entrega)}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <span className="font-bold ui-num leading-none tracking-[-0.02em] text-[40px]">{posMoney(caja.enCaja)}</span>
          <dl className="m-0 flex flex-col text-[14px]">
            <Linea label="Base con la que abrió" hint={caja.baseOrigen === "cierre-anterior" ? "lo que dejó el último cierre" : "sin cierres anteriores"} value={posMoney(caja.base)} />
            <Linea label="Efectivo cobrado" value={posMoney(caja.efectivo)} />
          </dl>
          <p className="ui-sub m-0 text-[13px]">{n.esHoy ? "Todavía no hay arqueo de hoy." : "Ese día no se envió arqueo."} El equipo lo cuenta al cerrar el turno.</p>
        </>
      )}
    </Card>
  );
}

function Linea({ label, hint, value, strong }: { label: string; hint?: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-line mt-1 pt-2.5 font-semibold")}>
      <dt className="min-w-0">
        {label}
        {hint ? <span className="block text-[12.5px] text-muted font-normal">{hint}</span> : null}
      </dt>
      <dd className="m-0 ui-num font-semibold whitespace-nowrap">{value}</dd>
    </div>
  );
}

function PorAtenderCard({ items, className }: { items: ReturnType<typeof porAtender>; className?: string }) {
  return (
    <section aria-labelledby="por-atender" className={cn("flex flex-col gap-2.5", className)} data-testid="por-atender">
      <h2 id="por-atender" className="ui-h2 m-0">
        Por atender
      </h2>
      {items.length === 0 ? (
        <div className="rounded-card bg-ok-soft px-5 py-4 text-ok font-semibold text-[16px]">✓ Todo al día</div>
      ) : (
        items.map((it) => <LinkCard key={it.id} href={it.href} title={it.title} sub={it.sub} tone={it.tone} />)
      )}
    </section>
  );
}

function AbiertosCard({ n, tz, className }: { n: NumerosDia; tz: string; className?: string }) {
  if (n.abiertos.length === 0) return null;
  return (
    <Card aria-labelledby="abiertos" className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="abiertos" className="ui-title m-0">
          Pedidos abiertos · {n.abiertos.length}
        </h2>
        <Link href="/pos" className="text-[14px] font-semibold text-text">
          Cobrar →
        </Link>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col">
        {n.abiertos.map((o) => (
          <li key={o.id} className="py-2 border-b border-line last:border-b-0">
            <div className="flex items-baseline gap-2 text-[15px]">
              <b className="ui-num">{o.folio}</b>
              <span className="flex-1 min-w-0 truncate">{o.customer ?? "sin nombre"}</span>
              <b className="ui-num">{posMoney(o.total - o.abonado)}</b>
            </div>
            <div className="text-[13px] text-muted">
              <span className={cn("ui-num", o.viejo && "text-late font-semibold")}>
                {o.viejo ? `del ${fechaCorta(todayInTz(tz, new Date(o.createdAt)))} · ` : ""}
                {formatTime(o.createdAt, tz)}
              </span>
              {o.abonado > 0 ? ` · abonó ${posMoney(o.abonado)}` : ""}
              {o.items ? ` · ${o.items}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GastosCard({ n, className }: { n: NumerosDia; className?: string }) {
  const total = resumenGastos(n.gastos).total;
  return (
    <Card aria-labelledby="gastos-dia" className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="gastos-dia" className="ui-title m-0">
          Gastos del día
        </h2>
        <Link href="/gastos" className="text-[14px] font-semibold text-text">
          {n.gastos.length ? "Ver gastos →" : "Registrar →"}
        </Link>
      </div>
      {n.gastos.length === 0 ? (
        <p className="ui-sub m-0">Sin gastos registrados {n.esHoy ? "hoy" : "ese día"}.</p>
      ) : (
        <>
          <ul className="m-0 p-0 list-none flex flex-col">
            {n.gastos.map((g) => (
              <li key={g.id} className="flex items-baseline gap-2 py-2 border-b border-line last:border-b-0 text-[14px]">
                <span className="flex-1 min-w-0">
                  <span className="font-semibold">{g.concepto}</span>
                  <span className="text-muted">
                    {" "}
                    · {CATEGORIA_GASTO[g.categoria].label} · {CUENTA_GASTO[g.cuenta]}
                  </span>
                </span>
                <span className="ui-num font-semibold text-late whitespace-nowrap">−{moneyGasto(g.monto)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-2 text-[14px]">
            <span className="text-muted">Cobrado − gastos</span>
            <b className="ui-num">{moneyGasto(Math.round((n.resumen.cobros.total - total) * 100) / 100)}</b>
          </div>
        </>
      )}
    </Card>
  );
}

function NovedadesCard({ n, tz, date, className }: { n: NumerosDia; tz: string; date: string; className?: string }) {
  return (
    <Card aria-labelledby="novedades-dia" className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="novedades-dia" className="ui-title m-0">
          Novedades · {n.novedades.length}
        </h2>
        <Link href={`/hoy/${date}/turnos`} className="text-[14px] font-semibold text-text">
          Turnos →
        </Link>
      </div>
      {n.novedades.length === 0 ? (
        <p className="ui-sub m-0">El equipo no reportó novedades {n.esHoy ? "hoy" : "ese día"}.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col">
          {n.novedades.map((nv) => (
            <li key={nv.id} className="py-2 border-b border-line last:border-b-0">
              <p className="m-0 text-[15px] leading-snug whitespace-pre-wrap">{nv.body}</p>
              <p className="m-0 mt-0.5 text-[13px] text-muted ui-num">
                {formatTime(nv.at, tz)}
                {nv.who ? ` · ${nv.who}` : ""}
                {nv.turno ? ` · ${nv.turno}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CanceladosCard({ n, tz, className }: { n: NumerosDia; tz: string; className?: string }) {
  const r = n.resumen;
  if (r.cancelados.n === 0 && r.combinados === 0) return null;
  return (
    <Card aria-labelledby="cancelados" className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cancelados" className="ui-title m-0">
          Cancelados · {r.cancelados.n} · {posMoney(r.cancelados.total)}
        </h2>
        {r.combinados ? <span className="ui-sub text-[13px]">{plural(r.combinados, "pedido combinado", "pedidos combinados")} no cuentan</span> : null}
      </div>
      {r.cancelados.n > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-col">
          {r.cancelados.lista.map((o) => (
            <li key={o.id} className="flex items-baseline gap-2.5 py-2 border-b border-line last:border-b-0 text-[14px]">
              <span className="ui-num text-muted w-11">{formatTime(o.createdAt, tz)}</span>
              <b className="ui-num">{o.folio}</b>
              <span className="flex-1 min-w-0 truncate text-muted">{[o.customer, o.notes].filter(Boolean).join(" · ") || "sin nota"}</span>
              <span className="ui-num">{posMoney(o.total)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
