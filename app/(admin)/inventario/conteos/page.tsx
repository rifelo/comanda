import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getIngredientesView } from "@/lib/db/ingredients";
import { cargarConfig, diferenciasRepetidas, historialConteos, tareasPanel, vencidasSinContar, type ConteoPanel, type TareaPanel } from "@/lib/inventario/agente/db";
import { MOTIVOS, REGLAS, type Motivo } from "@/lib/inventario/agente/planificador";
import { posMoney } from "@/lib/pos/types";
import { todayInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/top-bar";
import {
  TONO,
  diaDe,
  estadoConteo,
  etiquetaDia,
  faltanteConteo,
  horaDe,
  lineaAplicada,
  nombreCorto,
  plural,
  porRevisar,
  sumarDias,
  tipoConteo,
  valorDe,
  type Tono,
} from "./_lib/formato";
import { PedirConteo } from "./_components/pedir-conteo";
import { PedirAhora } from "./_components/pedir-ahora";
import { ReglasAgente } from "./_components/reglas-agente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteos · Comanda" };

const DIAS = 30;
const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const pill = (t: Tono): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", background: TONO[t].bg, color: TONO[t].fg });

type Estado = "todos" | "revisar" | "programados" | "aplicados";
const ESTADOS: { value: Estado; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "revisar", label: "Por revisar" },
  { value: "programados", label: "Programados" },
  { value: "aplicados", label: "Aplicados" },
];

interface Fila {
  key: string;
  dia: string;
  orden: string;
  href: string | null;
  tipo: { label: string; asistente: boolean };
  titulo: string;
  meta: string;
  estado: { label: string; tono: Tono };
  valor: { text: string; color: string };
  destacada: boolean;
  grupo: Exclude<Estado, "todos"> | "rechazados";
}

function filaConteo(c: ConteoPanel): Fila {
  const rev = porRevisar(c);
  const falt = faltanteConteo(c);
  const vivas = c.lineas.filter((l) => l.revision !== "rechazado");
  const revisar = c.lineas.filter((l) => l.revision === "revisar");
  const conDif = vivas.filter((l) => Math.abs(l.counted - l.expected) > 1e-9).length;
  const det: string[] = [];
  if (c.kind === "agente") {
    const solos = c.lineas.filter((l) => l.revision === "aplicado").length;
    const detalle = c.lineas.find((l) => l.detalle)?.detalle;
    if (c.lineas.length <= 3) det.push(c.lineas.map((l) => l.name.toLowerCase()).join(", "));
    else if (detalle) det.push(detalle);
    if (revisar.length) det.push(`${revisar.length} por revisar`);
    if (solos && (revisar.length || !c.auto)) det.push(`${solos} se ajustaron`);
  } else {
    det.push(`${conDif} con diferencia`);
  }
  if (!rev && !c.auto && c.reviewedAt && c.status === "aprobado") det.push(`aprobado por ti a las ${horaDe(c.reviewedAt)}`);
  return {
    key: c.id,
    dia: diaDe(c.submittedAt),
    orden: c.submittedAt,
    href: `/inventario/conteos/${c.id}`,
    tipo: tipoConteo(c),
    titulo: c.kind === "completo" ? `Toda la tienda · ${plural(c.lineas.length, "insumo", "insumos")}` : c.kind === "diario" ? `Conteo de cierre · ${plural(c.lineas.length, "insumo", "insumos")}` : `Verificación · ${plural(c.lineas.length, "insumo", "insumos")}`,
    meta: [nombreCorto(c.countedBy), horaDe(c.submittedAt), ...det].filter(Boolean).join(" · "),
    estado: estadoConteo(c),
    valor: falt < 0 ? { text: `−${posMoney(-falt)}`, color: "var(--late)" } : { text: "cuadra", color: "var(--ok)" },
    destacada: rev,
    grupo: rev ? "revisar" : c.status === "rechazado" ? "rechazados" : "aplicados",
  };
}

/** Pending tasks of one day, as one «Programada» row. */
function filaProgramada(dia: string, ts: TareaPanel[], hoy: string): Fila {
  const n = new Map<Motivo, number>();
  for (const t of ts) n.set(t.motivo, (n.get(t.motivo) ?? 0) + 1);
  const m = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const nombres = ts.map((t) => t.name.toLowerCase());
  const det = ts.length === 1 && ts[0].detalle ? ts[0].detalle : nombres.slice(0, 4).join(", ") + (nombres.length > 4 ? ` y ${nombres.length - 4} más` : "");
  return {
    key: `prog-${dia}`,
    dia: dia < hoy ? hoy : dia,
    orden: `${dia < hoy ? hoy : dia}T99`,
    href: null,
    tipo: { label: MOTIVOS[m].label, asistente: true },
    titulo: `Verificación · ${plural(ts.length, "insumo", "insumos")}`,
    meta: [dia < hoy ? "Quedó pendiente, vuelve hoy" : "En la tablet", det].join(" · "),
    estado: { label: "Programada", tono: "neutral" },
    valor: { text: "—", color: "var(--muted)" },
    destacada: false,
    grupo: "programados",
  };
}

export default async function ConteosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const [{ profile, supabase }, sede, sp] = await Promise.all([requireAdmin(), getActiveSede(), searchParams]);
  const orgId = profile.organization_id;
  const hoy = todayInTz(sede?.tz ?? "America/Bogota");
  const desdeDia = sumarDias(hoy, -DIAS);
  const desdeISO = `${desdeDia}T05:00:00.000Z`;
  const estado: Estado = ESTADOS.some((e) => e.value === sp.estado) ? (sp.estado as Estado) : "todos";

  const [conteos, tareas, config, view, vencidasMap] = await Promise.all([
    historialConteos(supabase, orgId, desdeISO),
    tareasPanel(supabase, orgId, desdeDia),
    cargarConfig(supabase, orgId),
    getIngredientesView(orgId),
    vencidasSinContar(supabase, orgId, hoy),
  ]);

  // ── KPIs ──
  const lineasRevisar = conteos.flatMap((c) => c.lineas.filter((l) => l.revision === "revisar").map((l) => ({ l, dia: diaDe(c.submittedAt) })));
  const delPeriodo = tareas.filter((t) => t.fecha >= desdeDia && t.fecha <= hoy);
  const hechas = delPeriodo.filter((t) => t.estado === "hecha").length;
  const cerradas = delPeriodo.filter((t) => t.estado === "hecha" || t.estado === "no_encontrado" || t.estado === "vencida").length;
  const aTiempo = cerradas ? Math.round((hechas / cerradas) * 100) : null;
  const pendientes = tareas.filter((t) => t.estado === "pendiente");
  const nombreDe = new Map(view.ingredientes.map((i) => [i.id, i.name]));
  const enLista = new Set(pendientes.map((t) => t.ingredienteId));
  const vencidas = [...vencidasMap.values()].filter((v) => nombreDe.has(v.ingredienteId)).sort((a, b) => a.desde.localeCompare(b.desde));
  const atrasadas = pendientes.filter((t) => t.fecha < hoy).length;
  const negativos = view.ingredientes.filter((i) => !i.archived && Number(i.stock_current) < 0).length;
  const faltante = conteos.reduce(
    (s, c) => s + c.lineas.reduce((t, l) => (lineaAplicada(l, c) && l.expected > 0 ? t + Math.min(0, valorDe(l)) : t), 0),
    0,
  );

  // ── history rows ──
  const porDia = new Map<string, TareaPanel[]>();
  for (const t of pendientes) {
    const k = t.fecha < hoy ? "atrasadas" : t.fecha;
    porDia.set(k, [...(porDia.get(k) ?? []), t]);
  }
  const programadas = [...porDia.entries()].map(([k, ts]) => filaProgramada(k === "atrasadas" ? sumarDias(hoy, -1) : k, ts, hoy));
  const todas = [...conteos.map(filaConteo), ...programadas];
  const cuenta: Record<Estado, number> = {
    todos: todas.length,
    revisar: todas.filter((f) => f.grupo === "revisar").length,
    programados: todas.filter((f) => f.grupo === "programados").length,
    aplicados: todas.filter((f) => f.grupo === "aplicados").length,
  };
  const filas = (estado === "todos" ? todas : todas.filter((f) => f.grupo === estado)).sort((a, b) => b.orden.localeCompare(a.orden));
  const dias: { dia: string; filas: Fila[] }[] = [];
  for (const f of filas) {
    const last = dias[dias.length - 1];
    if (last && last.dia === f.dia) last.filas.push(f);
    else dias.push({ dia: f.dia, filas: [f] });
  }

  // ── right column ──
  const repetidas = diferenciasRepetidas(conteos);
  const proximos = new Map<string, TareaPanel[]>();
  for (const t of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const k = t.fecha < hoy ? hoy : t.fecha;
    proximos.set(k, [...(proximos.get(k) ?? []), t]);
  }

  const revNombres = [...new Set(lineasRevisar.map((x) => x.l.name.toLowerCase()))];
  const revSub = lineasRevisar.length
    ? `${revNombres.slice(0, 2).join(", ")}${revNombres.length > 2 ? ` y ${revNombres.length - 2} más` : ""}${lineasRevisar.every((x) => x.dia === hoy) ? ", de hoy" : ""}`
    : "nada pendiente";

  return (
    <div>
      <PageHeader
        back="/inventario"
        title="Conteos"
        sub="El control de inventario decide qué insumos contar y cuándo. El equipo cuenta en la tablet y aquí queda el historial."
        actions={<PedirConteo ingredientes={view.ingredientes.filter((i) => !i.archived).map((i) => ({ id: i.id, name: i.name, ubicacion: i.ubicacion ?? null }))} />}
      />
      <div className="px-4 sm:px-7 pb-10 grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex flex-col gap-4 min-w-0">
          <div className="grid gap-3 grid-cols-2 min-[1100px]:grid-cols-4">
            <Kpi titulo="Necesitan segunda verificación" valor={String(lineasRevisar.length)} color={lineasRevisar.length ? "var(--late)" : undefined} sub={revSub} />
            <Kpi titulo={`Conteos · ${DIAS} días`} valor={cerradas ? `${hechas} de ${cerradas}` : "—"} sub="hechos a tiempo" />
            <Kpi titulo="Stock negativo" valor={String(negativos)} color={negativos ? "var(--late)" : undefined} sub={negativos === 1 ? "insumo" : "insumos"} />
            <Kpi titulo={`Faltante · ${DIAS} días`} valor={faltante < 0 ? `−${posMoney(-faltante)}` : posMoney(0)} color={faltante < 0 ? "var(--late)" : undefined} sub="lo contado vs. lo esperado" />
          </div>

          <nav aria-label="Estado del conteo" className="ui-scroll-x inline-flex self-start max-w-full bg-surface-2 rounded-btn p-1 gap-1">
            {ESTADOS.map((e) => {
              const on = e.value === estado;
              return (
                <Link
                  key={e.value}
                  href={e.value === "todos" ? "/inventario/conteos" : `/inventario/conteos?estado=${e.value}`}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex items-center shrink-0 h-9 min-h-9 px-3.5 rounded-[9px] text-sm font-semibold whitespace-nowrap no-underline ${on ? "bg-surface text-text shadow-[var(--shadow-1)]" : "text-muted hover:text-text"}`}
                >
                  {e.label} <span className="ui-num">&nbsp;· {cuenta[e.value]}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-col gap-2">
            {dias.length === 0 && (
              <div style={{ ...card, padding: "14px 16px", color: "var(--muted)", fontSize: 14 }}>
                {estado === "todos" ? "Todavía no hay conteos. El control de inventario programa los primeros esta noche y el equipo los hace en la tablet." : "Nada en este estado."}
              </div>
            )}
            {dias.map((d) => (
              <div key={d.dia} className="flex flex-col gap-2">
                <div className="flex items-center" style={{ gap: 10, fontSize: 13, fontWeight: 600, color: "var(--muted)", paddingTop: 6 }}>
                  {etiquetaDia(d.dia, hoy)}
                  <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
                {d.filas.map((f) => (
                  <FilaConteo key={f.key} f={f} />
                ))}
              </div>
            ))}
          </div>
        </main>

        <aside className="flex flex-col gap-3 min-w-0">
          <ReglasAgente
            max={config.max}
            diasSinContar={config.diasSinContar}
            inicial={Object.fromEntries(REGLAS.map((r) => [r, config.reglas[r]]))}
            aTiempo={aTiempo}
            atrasadas={atrasadas}
          />

          <section style={{ ...card, padding: 16 }} className="flex flex-col gap-2.5" aria-labelledby="rep-t">
            <h2 id="rep-t" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Diferencias que se repiten</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: "19px", color: "var(--muted)" }}>Si un insumo siempre falta o siempre sobra, el problema suele estar en la receta o en compras sin registrar.</p>
            {repetidas.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 10 }}>Nada se repite por ahora.</p>}
            {repetidas.map((r) => {
              const siempre = r.veces === r.de;
              const t: Tono = r.lado === "falta" ? (siempre || r.veces >= 3 ? "late" : "brand") : "neutral";
              return (
                <div key={r.ingredienteId} className="flex flex-col" style={{ gap: 2, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <Link href={`/inventario/kardex/${r.ingredienteId}`} style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none" }}>{r.name}</Link>
                    <span style={{ ...pill(t), padding: "2px 8px", fontSize: 12, color: t === "neutral" ? "var(--text)" : TONO[t].fg }}>
                      {r.lado === "falta" ? (siempre ? "siempre falta" : "falta seguido") : siempre ? "siempre sobra" : "sobra"}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {r.veces} de {r.de} verificaciones · {r.lado === "falta" ? "revisa la receta o las mermas sin registrar" : "¿compras que no pasaron por «Recibir»?"}
                  </span>
                </div>
              );
            })}
          </section>

          <section style={{ ...card, padding: 16, borderColor: vencidas.length ? "var(--late)" : "var(--line)" }} className="flex flex-col gap-2.5" aria-labelledby="vc-t">
            <h2 id="vc-t" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Vencidas sin contar{vencidas.length ? <span style={{ color: "var(--late)" }}> · {vencidas.length}</span> : null}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              Verificaciones que nadie alcanzó en 3 días. Vuelven solas al día siguiente como «Pendiente de días anteriores».
            </p>
            {vencidas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>Ninguna. El equipo está al día.</p>
            ) : (
              vencidas.map((v) => (
                <div key={v.ingredienteId} className="flex items-center" style={{ gap: 10, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{nombreDe.get(v.ingredienteId)}</span>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                      Se pidió el {etiquetaDia(v.desde, hoy)}
                      {v.veces > 1 ? ` · se venció ${v.veces} veces` : ""} · {MOTIVOS[v.motivo]?.label ?? v.motivo}
                    </span>
                  </span>
                  {enLista.has(v.ingredienteId) ? (
                    <span style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600, whiteSpace: "nowrap" }}>En la lista de hoy</span>
                  ) : (
                    <PedirAhora ingredienteId={v.ingredienteId} nombre={nombreDe.get(v.ingredienteId) ?? ""} />
                  )}
                </div>
              ))
            )}
          </section>

          <section style={{ ...card, padding: 16 }} className="flex flex-col gap-2.5" aria-labelledby="px-t">
            <h2 id="px-t" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Próximos conteos</h2>
            {proximos.size === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                Nada programado. Esta noche el control de inventario elige los insumos que hay que verificar con las ventas del día.
              </p>
            )}
            {[...proximos.entries()].map(([dia, ts]) => (
              <div key={dia} className="flex items-baseline" style={{ gap: 10, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <span style={{ width: 92, color: "var(--muted)", flexShrink: 0 }}>{dia === hoy ? "Hoy" : dia === sumarDias(hoy, 1) ? "Mañana" : etiquetaDia(dia, hoy)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {ts.map((t) => t.name).join(", ")}
                  <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{[...new Set(ts.map((t) => MOTIVOS[t.motivo].label))].join(" · ")}</span>
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, sub, color }: { titulo: string; valor: string; sub: string; color?: string }) {
  return (
    <div style={{ ...card, padding: "14px 16px", minWidth: 0 }}>
      <div style={kicker}>{titulo}</div>
      <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: color ?? "var(--text)" }}>{valor}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

const SPARKLE = "M9 4h6v2H9zM7 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1M9 13l2 2 4-4";
const LIST = "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01";

function FilaConteo({ f }: { f: Fila }) {
  const inner = (
    <>
      <span style={{ ...pill(f.tipo.asistente ? "brand" : "neutral"), color: "var(--text)", justifySelf: "start" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={f.tipo.asistente ? SPARKLE : LIST} />
        </svg>
        {f.tipo.label}
      </span>
      <span style={{ minWidth: 0 }} className="col-span-2 min-[700px]:col-span-1 order-last min-[700px]:order-none">
        <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{f.titulo}</span>
        <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.meta}</span>
      </span>
      <span className="justify-self-end flex items-center" style={{ gap: 12 }}>
        <span style={pill(f.estado.tono)}>{f.estado.label}</span>
        <span className="cmd-num" style={{ minWidth: 80, textAlign: "right", fontSize: 14, fontWeight: 700, color: f.valor.color }}>{f.valor.text}</span>
      </span>
    </>
  );
  const cls = "grid items-center gap-x-4 gap-y-2 grid-cols-[auto_minmax(0,1fr)] min-[700px]:grid-cols-[150px_minmax(0,1fr)_auto]";
  const style: React.CSSProperties = { ...card, padding: "14px 16px", color: "var(--text)", textDecoration: "none", borderColor: f.destacada ? "var(--text)" : "var(--line)" };
  return f.href ? (
    <Link href={f.href} className={`${cls} hover:border-[var(--text)]`} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
