import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { loadNumerosDia } from "@/lib/numeros/data";
import { METODOS, METODO_LABEL, addDays, diaSemana, esFecha, horaEnTz } from "@/lib/numeros/dia";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, formatDateLabelEs, formatTime, todayInTz } from "@/lib/utils";
import { Stamp } from "@/components/comanda/primitives";
import { AutoRefresh } from "../_components/auto-refresh";
import { FechaPicker } from "../_components/fecha-picker";
import { VentasHoraChart } from "../_components/ventas-hora-chart";
import { VerificarConteo } from "../_components/verificar-conteo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy · Números · co-manda" };

const money = (n: number) => (n < 0 ? `-${posMoney(-n)}` : posMoney(n));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const TOP = 8;

/**
 * Hoy · Números — the owner's numbers for one day: how sales are going, what
 * came in by payment method, the cash against the team's arqueo, the best
 * sellers, the orders still open and the novedades. `/numeros` is today and
 * refreshes itself; `/numeros/YYYY-MM-DD` is any past day. Read-only.
 */
export default async function NumerosPage({ params }: { params: Promise<{ fecha?: string[] }> }) {
  const { fecha } = await params;
  const [{ supabase, profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  if (fecha && (fecha.length > 1 || !esFecha(fecha[0]))) notFound();
  const date = fecha?.[0] ?? today;
  if (date > today || (fecha && date === today)) redirect("/numeros");

  const now = new Date();
  const n = await loadNumerosDia(supabase, { orgId: profile.organization_id, sedeId: sede?.id ?? null, tz, date, now });
  const { resumen: r, caja } = n;
  const sedeName = sede?.name ?? "Daniel's Burger";

  const href = (d: string) => (d === today ? "/numeros" : `/numeros/${d}`);
  const diaLabel = n.esHoy ? "Hoy" : fechaCorta(date);
  const previoLabel = `${diaSemana(n.previa)} pasado`;
  const top = r.productos[0] ?? null;
  const porCobrar = n.abiertos.reduce((s, o) => s + (o.total - o.abonado), 0);
  const viejos = n.abiertos.filter((o) => o.viejo).length;
  const ultimaNovedad = n.novedades[0] ?? null;
  const maxUnidades = Math.max(1, ...r.productos.map((p) => p.unidades));
  const lastArqueo = caja.arqueos[caja.arqueos.length - 1] ?? null;

  return (
    <div style={{ paddingBottom: 48 }}>
      {n.esHoy ? <AutoRefresh seconds={60} /> : null}

      <header
        className="flex flex-wrap items-end justify-between px-[14px] pt-3 pb-3 md:px-8 md:pt-6 md:pb-4"
        style={{ borderBottom: "1.5px solid var(--ink)", gap: 12 }}
      >
        <div>
          <div className="text-muted" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {formatDateLabelEs(date, "long")} · {sedeName}
          </div>
          <h1 className="font-slab text-[26px] md:text-[36px]" style={{ margin: "4px 0 0", letterSpacing: "-0.01em", lineHeight: 1.05 }}>
            Números del día
          </h1>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {n.esHoy ? (
            <Stamp rotate={-3} size={10} style={{ marginRight: 6 }}>
              en vivo · {formatTime(now, tz)}
            </Stamp>
          ) : null}
          <Link href={href(addDays(date, -1))} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>
            ‹ día ant.
          </Link>
          <FechaPicker date={date} today={today} />
          {n.esHoy ? null : (
            <>
              <Link href={href(addDays(date, 1))} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>
                día sig. ›
              </Link>
              <Link href="/numeros" className="cmd-btn sm" style={{ textDecoration: "none" }}>
                hoy
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ── KPIs ── */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 px-[14px] py-4 md:px-8 md:py-5"
        style={{ gap: "16px 12px", borderBottom: "1px dashed var(--rule)" }}
      >
        <Kpi label={n.esHoy ? "Ventas de hoy" : "Ventas del día"} value={posMoney(r.ventas.total)}>
          <div>
            {plural(r.ventas.pedidos, "pedido", "pedidos")}
            {r.ventas.pedidos > 0 ? ` · ticket ${posMoney(r.ventas.ticket)}` : ""}
          </div>
          <Delta pct={r.comparacion.pct} previo={r.comparacion.total} label={`${previoLabel}${n.esHoy ? " a esta hora" : ""}`} />
        </Kpi>
        <Kpi label="Pedidos abiertos" value={String(n.abiertos.length)} tone={n.abiertos.length ? "var(--amber)" : undefined}>
          <div>{n.abiertos.length ? `${posMoney(porCobrar)} por cobrar` : "todo cobrado"}</div>
          {viejos > 0 ? <div style={{ color: "var(--red)" }}>⚠ {plural(viejos, "es", "son")} de días anteriores</div> : null}
        </Kpi>
        <Kpi label="Más vendido" value={top ? top.name : "—"} small>
          <div>{top ? `${plural(top.unidades, "unidad", "unidades")} · ${posMoney(top.ingreso)}` : "sin ventas todavía"}</div>
        </Kpi>
        <Kpi label="Novedades" value={String(n.novedades.length)} tone={n.novedades.length ? "var(--red)" : undefined}>
          <div>
            {ultimaNovedad
              ? `última ${formatTime(ultimaNovedad.at, tz)}${ultimaNovedad.who ? ` · ${ultimaNovedad.who}` : ""}`
              : "sin reportes del equipo"}
          </div>
        </Kpi>
      </div>

      <div className="px-[14px] md:px-8">
        {/* ── cobros por método ── */}
        <SectionLabel right={`${plural(r.cobros.pagos, "cobro", "cobros")}`}>Lo que entró · por método de pago</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
          {METODOS.map((m) => {
            const c = r.cobros[m];
            const share = r.cobros.total > 0 ? Math.round((c.monto / r.cobros.total) * 100) : 0;
            return (
              <div key={m} style={{ border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: "12px 14px" }}>
                <div className="flex flex-wrap items-baseline justify-between" style={{ gap: "2px 8px" }}>
                  <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>{METODO_LABEL[m]}</span>
                  <span className="text-muted cmd-num" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>{plural(c.pagos, "cobro", "cobros")}</span>
                </div>
                <div className="font-slab text-[28px] sm:text-[20px] lg:text-[22px] xl:text-[28px]" style={{ lineHeight: 1.1, marginTop: 6, color: c.monto ? "var(--ink)" : "var(--muted)" }}>
                  {posMoney(c.monto)}
                </div>
                <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                  <div aria-hidden style={{ flex: 1, height: 6, background: "var(--paper-dk)" }}>
                    <div style={{ width: `${share}%`, height: "100%", background: "var(--ink)" }} />
                  </div>
                  <span className="text-muted cmd-num" style={{ fontSize: 10.5, width: 34, textAlign: "right" }}>{share}%</span>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="flex flex-wrap items-baseline justify-between"
          style={{ marginTop: 10, padding: "10px 14px", border: "1px solid var(--rule)", background: "var(--paper-lt)", gap: 10 }}
        >
          <span style={{ fontSize: 12 }}>
            <span className="text-muted" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", marginRight: 8 }}>Total cobrado</span>
            <b className="cmd-num" style={{ fontSize: 15 }}>{posMoney(r.cobros.total)}</b>
          </span>
          <CuadreVentas cuadre={r.cuadre} vendido={r.ventas.total} />
        </div>

        {/* ── cierre del día ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ columnGap: 24 }}>
          <div className="min-w-0">
            <SectionLabel right={<Link href="/caja" className="cmd-link">ver arqueos →</Link>}>Caja · efectivo contra el arqueo</SectionLabel>
            <div className="cmd-noise" style={{ border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: 16 }}>
              {lastArqueo ? (
                <>
                  <Line label={caja.efectivoDespues > 0 ? "Efectivo cobrado hasta el arqueo" : "Efectivo cobrado (sistema)"} value={posMoney(caja.efectivoHastaArqueo)} />
                  <Line
                    label="Entró a la caja según el arqueo"
                    hint={
                      caja.arqueos.length === 1
                        ? `contado ${posMoney(lastArqueo.contado)} − base inicial ${posMoney(lastArqueo.baseInicial)}`
                        : `suma de ${caja.arqueos.length} conteos (contado − base inicial)`
                    }
                    value={money(caja.entro)}
                  />
                  <Line label="Diferencia" value={<Veredicto diff={caja.diferencia ?? 0} />} strong />
                  {caja.efectivoDespues > 0 ? (
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>
                      Después del último arqueo se cobraron {posMoney(caja.efectivoDespues)} más en efectivo: en la caja debería haber{" "}
                      <b className="cmd-num" style={{ color: "var(--ink)" }}>{posMoney(caja.enCaja)}</b>.
                    </div>
                  ) : null}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)", display: "grid", gap: 10 }}>
                    {caja.arqueos.map((a) => (
                      <div key={a.id} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                        <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
                          <b>{a.turno ?? "Arqueo"}</b>
                          <span className="text-muted cmd-num">{formatTime(a.at, tz)}{a.contadoPor ? ` · ${a.contadoPor}` : ""}</span>
                          <span style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, color: a.status === "aprobado" ? "var(--green)" : "var(--amber)" }}>
                            {a.status === "aprobado" ? "✓ aprobado" : "● por aprobar"}
                          </span>
                        </div>
                        <div className="text-muted cmd-num">
                          base {posMoney(a.baseInicial)} · contado {posMoney(a.contado)} · queda de base {posMoney(a.baseDejada)} · entrega{" "}
                          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{money(a.entrega)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Line
                    label="Base con la que abrió"
                    hint={caja.baseOrigen === "cierre-anterior" ? "lo que dejó el último cierre" : "sin cierres anteriores"}
                    value={posMoney(caja.base)}
                  />
                  <Line label="Efectivo cobrado (sistema)" value={posMoney(caja.efectivo)} />
                  <Line label="Debería haber en caja" value={posMoney(caja.enCaja)} strong />
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.45 }}>
                    {n.esHoy ? "Todavía no hay arqueo de hoy." : "Ese día no se envió arqueo."} El equipo lo cuenta desde el turno (Caja · arqueo).
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <SectionLabel right="solo en este dispositivo">Tu conteo · verifica el día</SectionLabel>
            <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: 16 }}>
              <VerificarConteo
                date={date}
                esperado={{ efectivo: r.cobros.efectivo.monto, transferencia: r.cobros.transferencia.monto, tarjeta: r.cobros.tarjeta.monto }}
                hints={{
                  efectivo: `Efectivo de las ventas, sin la base${caja.base ? ` de ${posMoney(caja.base)}` : ""}.`,
                  transferencia: "Lo que llegó hoy a la cuenta o la billetera.",
                  tarjeta: "El cierre del datáfono.",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── ventas por hora + más vendidos ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5" style={{ columnGap: 24 }}>
          <div className="min-w-0 lg:col-span-3">
            <SectionLabel right={r.comparacion.total > 0 || r.horas.some((h) => h.previo > 0) ? undefined : `sin ventas el ${previoLabel}`}>Ventas por hora</SectionLabel>
            <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)", padding: 16 }}>
              {r.horas.length === 0 ? (
                <Empty>Sin ventas {n.esHoy ? "todavía" : "ese día"}.</Empty>
              ) : (
                <VentasHoraChart
                  horas={r.horas}
                  diaLabel={diaLabel}
                  previoLabel={previoLabel}
                  horaActual={n.esHoy ? horaEnTz(now.toISOString(), tz) : null}
                />
              )}
            </div>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <SectionLabel right={r.productos.length ? `${r.productos.length} distintos` : undefined}>Más vendidos</SectionLabel>
            <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)", padding: "6px 16px" }}>
              {r.productos.length === 0 ? (
                <Empty>Sin ventas {n.esHoy ? "todavía" : "ese día"}.</Empty>
              ) : (
                <>
                  {r.productos.slice(0, TOP).map((p, i) => (
                    <div key={p.key} style={{ padding: "9px 0", borderBottom: "1px solid var(--rule-soft)" }}>
                      <div className="flex items-baseline" style={{ gap: 8, fontSize: 12.5 }}>
                        <span className="cmd-num text-muted" style={{ fontSize: 10, width: 14 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: i === 0 ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span className="cmd-num" style={{ fontWeight: 700 }}>{p.unidades}</span>
                        <span className="cmd-num text-muted" style={{ fontSize: 11, width: 74, textAlign: "right" }}>{posMoney(p.ingreso)}</span>
                      </div>
                      <div aria-hidden style={{ marginLeft: 22, marginTop: 5, height: 5 }}>
                        <div style={{ width: `${Math.max(2, (p.unidades / maxUnidades) * 100)}%`, height: "100%", background: "var(--ink)", borderRadius: "0 3px 3px 0" }} />
                      </div>
                    </div>
                  ))}
                  <div className="text-muted flex justify-between" style={{ fontSize: 10.5, padding: "9px 0" }}>
                    <span>
                      {r.productos.length > TOP
                        ? `+ ${r.productos.length - TOP} más · ${r.productos.slice(TOP).reduce((s, p) => s + p.unidades, 0)} unidades`
                        : "unidades · ingreso"}
                    </span>
                    <span className="cmd-num">{r.productos.reduce((s, p) => s + p.unidades, 0)} unidades en total</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── pedidos abiertos + novedades ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ columnGap: 24 }}>
          <div className="min-w-0">
            <SectionLabel right={n.abiertos.length ? <Link href="/pos" className="cmd-link">cobrar en el punto de venta →</Link> : undefined}>
              Pedidos abiertos · {n.abiertos.length}
            </SectionLabel>
            <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
              {n.abiertos.length === 0 ? (
                <Empty pad>No hay pedidos por cobrar.</Empty>
              ) : (
                n.abiertos.map((o, i) => (
                  <div key={o.id} style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--rule-soft)" : "none" }}>
                    <div className="flex items-baseline" style={{ gap: 8, fontSize: 12.5 }}>
                      <b className="cmd-num">{o.folio}</b>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer ?? "sin nombre"}</span>
                      <b className="cmd-num">{posMoney(o.total - o.abonado)}</b>
                    </div>
                    <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>
                      <span className="cmd-num" style={{ color: o.viejo ? "var(--red)" : undefined, fontWeight: o.viejo ? 700 : 400 }}>
                        {o.viejo ? `⚠ del ${fechaCorta(todayInTz(tz, new Date(o.createdAt)))} · ` : ""}
                        {formatTime(o.createdAt, tz)}
                      </span>
                      {o.abonado > 0 ? ` · abonó ${posMoney(o.abonado)} de ${posMoney(o.total)}` : ""}
                      {o.items ? ` · ${o.items}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="min-w-0">
            <SectionLabel right={<Link href={`/hoy/${date}`} className="cmd-link">detalle del turno →</Link>}>Novedades · {n.novedades.length}</SectionLabel>
            <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
              {n.novedades.length === 0 ? (
                <Empty pad>El equipo no reportó novedades {n.esHoy ? "hoy" : "ese día"}.</Empty>
              ) : (
                n.novedades.map((nv, i) => (
                  <div key={nv.id} style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--rule-soft)" : "none" }}>
                    <div style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{nv.body}</div>
                    <div className="text-muted cmd-num" style={{ fontSize: 10.5, marginTop: 3 }}>
                      {formatTime(nv.at, tz)}
                      {nv.who ? ` · ${nv.who}` : ""}
                      {nv.turno ? ` · ${nv.turno}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── cancelados ── */}
        {r.cancelados.n > 0 || r.combinados > 0 ? (
          <>
            <SectionLabel right={r.combinados ? `${plural(r.combinados, "pedido combinado", "pedidos combinados")} no cuentan` : undefined}>
              Cancelados · {r.cancelados.n} · {posMoney(r.cancelados.total)}
            </SectionLabel>
            {r.cancelados.n > 0 ? (
              <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
                {r.cancelados.lista.map((o, i) => (
                  <div key={o.id} className="flex items-baseline" style={{ gap: 10, padding: "8px 14px", borderTop: i ? "1px solid var(--rule-soft)" : "none", fontSize: 12 }}>
                    <span className="cmd-num text-muted" style={{ width: 40 }}>{formatTime(o.createdAt, tz)}</span>
                    <b className="cmd-num">{o.folio}</b>
                    <span className="text-muted" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[o.customer, o.notes].filter(Boolean).join(" · ") || "sin nota"}
                    </span>
                    <span className="cmd-num">{posMoney(o.total)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <p className="text-muted" style={{ fontSize: 10.5, marginTop: 22, lineHeight: 1.55, maxWidth: 760 }}>
          Ventas = pedidos creados ese día y ya pagados. Lo que entró = todos los cobros del día por método, incluidos los abonos a pedidos abiertos.
          La diferencia de caja compara lo que el arqueo dice que entró (contado − base inicial) con todo el efectivo cobrado hasta ese momento.
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8, margin: "26px 0 10px" }}>
      <span className="text-muted" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        {children}
      </span>
      <span className="flex-1" style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }} />
      {right != null ? <span className="text-muted" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>{right}</span> : null}
    </div>
  );
}

function Kpi({ label, value, tone, small, children }: { label: string; value: string; tone?: string; small?: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ borderLeft: "2px solid var(--ink)", paddingLeft: 12, minWidth: 0 }}>
      <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        className={small ? "font-slab text-[17px] sm:text-[20px] lg:text-[17px] xl:text-[22px]" : "font-slab text-[20px] sm:text-[28px] lg:text-[22px] xl:text-[30px]"}
        style={{ lineHeight: 1.08, marginTop: 4, color: tone ?? "var(--ink)", overflowWrap: small ? "anywhere" : undefined }}
      >
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
        {children}
      </div>
    </div>
  );
}

/** "▲ 18 % vs jueves pasado a esta hora": the arrow and sign carry the direction. */
function Delta({ pct, previo, label }: { pct: number | null; previo: number; label: string }) {
  if (pct == null) return <div>sin ventas el {label}</div>;
  const tone = pct > 0 ? "var(--green)" : pct < 0 ? "var(--red)" : "var(--muted)";
  return (
    <div>
      <span className="cmd-num" style={{ color: tone, fontWeight: 700 }}>
        {pct > 0 ? "▲ +" : pct < 0 ? "▼ −" : "= "}
        {Math.abs(pct)} %
      </span>{" "}
      vs {label} ({posMoney(previo)})
    </div>
  );
}

function Veredicto({ diff }: { diff: number }) {
  const tone = diff === 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--amber)";
  return (
    <span className="cmd-num" style={{ color: tone }}>
      {diff === 0 ? "✓ cuadra" : diff < 0 ? `▼ faltan ${posMoney(-diff)}` : `▲ sobran ${posMoney(diff)}`}
    </span>
  );
}

/** Whether what came in matches what was sold, and why not when it does not. */
function CuadreVentas({ cuadre, vendido }: { cuadre: { diferencia: number; ajustes: { label: string; monto: number }[]; sinExplicar: number }; vendido: number }) {
  if (cuadre.diferencia === 0 && cuadre.sinExplicar === 0) {
    return (
      <span style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 600 }}>✓ coincide con lo vendido</span>
    );
  }
  return (
    <span style={{ fontSize: 11.5, lineHeight: 1.5, textAlign: "right" }}>
      <span className="text-muted">vendido {posMoney(vendido)}</span>
      {cuadre.ajustes.map((a) => (
        <span key={a.label} className="text-muted">
          {" "}· <span className="cmd-num">{a.monto > 0 ? "+" : "−"}{posMoney(Math.abs(a.monto))}</span> {a.label}
        </span>
      ))}
      {cuadre.sinExplicar !== 0 ? (
        <span style={{ color: "var(--red)", fontWeight: 700 }}>
          {" "}· ⚠ {money(cuadre.sinExplicar)} sin explicar
        </span>
      ) : null}
    </span>
  );
}

function Line({ label, hint, value, strong }: { label: string; hint?: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ gap: 12, padding: "7px 0", borderTop: strong ? "1.5px solid var(--ink)" : "none", marginTop: strong ? 6 : 0 }}
    >
      <span style={{ fontSize: 12.5, fontWeight: strong ? 700 : 400, minWidth: 0 }}>
        {label}
        {hint ? <span className="text-muted" style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 1 }}>{hint}</span> : null}
      </span>
      <span className="cmd-num" style={{ fontSize: strong ? 15 : 13, fontWeight: 700, whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

function Empty({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="text-muted" style={{ fontSize: 12, padding: pad ? "16px 14px" : "10px 0" }}>
      {children}
    </div>
  );
}
