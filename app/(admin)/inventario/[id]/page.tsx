import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getInsumoContexto, getIngredientesView } from "@/lib/db/ingredients";
import { getKardex } from "@/lib/db/movements";
import { kardexLineas, kardexTotales } from "@/lib/movimientos";
import { parsePeriodo } from "@/lib/kardex-periodo";
import { bogotaDay } from "@/lib/pos/pending";
import { cuando, presentacion, zonaDe } from "@/lib/inventario/acabando";
import { cantidadLegible, nivelDe } from "@/lib/inventario/niveles";
import { parPanel } from "@/lib/inventario/agente/db";
import { Pill } from "@/components/ui/pill";
import { PageHeader } from "@/components/ui/top-bar";
import { cantidad, pesos } from "../../productos/_components/bits";
import { InsumoAcciones } from "./insumo-acciones";
import { KardexClient } from "./kardex-client";
import { PreparacionEditor } from "./preparacion-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insumo · Comanda" };

const NIVEL = { verde: ["ok", "Hay"], amarillo: ["brand", "Poco"], rojo: ["late", "Se acabó"] } as const;

/**
 * One insumo: how much there is (Corregir / Editar), sales since it was last
 * counted, levels and supplier, the recipes that use it, and its kardex for
 * the period in the URL (?dias / ?desde&hasta via a plain GET form).
 */
export default async function InsumoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string; desde?: string; hasta?: string }> }) {
  const [{ profile, supabase }, { id }, sp] = await Promise.all([requireAdmin(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const orgId = profile.organization_id;
  const today = bogotaDay();
  const periodo = parsePeriodo(sp, today);
  const [ctx, data, view, [par], { data: prepRows }, { data: opcionesRows }] = await Promise.all([
    getInsumoContexto(orgId, id),
    getKardex(orgId, id, periodo.desdeIso, periodo.hastaIso),
    getIngredientesView(orgId),
    parPanel(supabase, orgId, id),
    supabase
      .from("preparacion_items")
      .select("ingrediente_id, qty, position, ing:ingredientes!preparacion_items_ingrediente_id_fkey(name, unit, cost_cop)")
      .eq("organization_id", orgId)
      .eq("preparacion_id", id)
      .order("position"),
    supabase.from("ingredientes").select("id, name, unit, cost_cop").eq("organization_id", orgId).eq("archived", false).is("rinde", null).neq("id", id).order("name"),
  ]);
  if (!ctx || !data) notFound();
  const it = ctx.item;
  const lineas = kardexLineas(data.movimientos);
  const totales = kardexTotales(lineas, data.saldoInicial);
  const stock = Number(it.stock_current);
  const nivel = nivelDe(stock, Number(it.stock_critico ?? 0), Number(it.stock_min ?? 0));
  const [tone, nivelTxt] = NIVEL[nivel];
  const recetaHref = ctx.recetas[0] ? `/productos/${ctx.recetas[0].producto_id}?tab=receta` : null;
  const legible = (n: number) => (n < 0 ? `−${cantidadLegible(-n, it)}` : cantidadLegible(n, it));

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-10">
      <PageHeader
        back="/inventario"
        title={it.name}
        sub={[ctx.categoria ?? "Sin categoría", zonaDe(it.ubicacion), presentacion(it)].join(" · ")}
        actions={<InsumoAcciones item={it} categorias={view.categorias} recetaHref={recetaHref} />}
      />

      <div className="px-4 sm:px-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="ui-label">Hay ahora</div>
          <div className={`ui-h2 ui-num mt-1 ${stock < 0 ? "text-late" : ""}`} data-testid="insumo-stock">
            {legible(stock)}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Pill tone={tone}>{stock < 0 ? "Negativo" : nivelTxt}</Pill>
            <span className="ui-sub ui-num">{pesos(Math.max(0, stock) * Number(it.cost_cop))} al costo</span>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="ui-label">Vendido desde el último conteo</div>
          <div className="ui-h2 ui-num mt-1">{ctx.ultimoConteo ? legible(ctx.ventasDesdeConteo) : "—"}</div>
          <div className="ui-sub mt-1">{ctx.ultimoConteo ? `Contado ${cuando(ctx.ultimoConteo, today)}` : "Nunca se ha contado"}</div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="ui-label">Costo</div>
          <div className="ui-h2 ui-num mt-1">
            {pesos(Number(it.cost_cop), { unit: true })} <span className="ui-sub">/ {it.unit}</span>
          </div>
          <div className="ui-sub mt-1">
            {it.pack_qty && it.pack_cost_cop ? `${pesos(Number(it.pack_cost_cop))} el paquete de ${cantidad(Number(it.pack_qty))} ${it.unit}` : Number(it.cost_cop) > 0 ? "Por unidad" : "Sin costo: el margen de sus recetas miente"}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="ui-label">Niveles y proveedor</div>
          <div className="ui-sub mt-1 leading-relaxed">
            Poco: {it.stock_min > 0 ? legible(Number(it.stock_min)) : "—"} · Se acabó: {Number(it.stock_critico ?? 0) > 0 ? legible(Number(it.stock_critico)) : "—"}
            <br />
            Pedir hasta: {it.stock_objetivo ? legible(Number(it.stock_objetivo)) : "—"}
            <br />
            {ctx.proveedor ?? "Sin proveedor"}
          </div>
          <Link href="/inventario/niveles" className="inline-flex items-center min-h-11 text-text font-semibold">
            Cambiar niveles →
          </Link>
        </div>
      </div>

      {par && par.consumoDiario > 0 ? (
        <section aria-labelledby="repo-h" className="px-4 sm:px-7 mb-6">
          <div className="flex items-end gap-3 mb-2">
            <h2 id="repo-h" className="ui-h2 m-0 flex-1">
              Reposición
            </h2>
            <Link href="/inventario/reorden?ver=todos" className="text-text font-semibold min-h-11 inline-flex items-center">
              Punto de reorden →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="bg-surface border border-line rounded-card p-4">
              <div className="ui-label">Stock de seguridad</div>
              <div className="ui-h2 ui-num mt-1">{legible(par.stockSeguridad)}</div>
              <div className="ui-sub ui-num mt-1">
                {legible(par.consumoDiario)}/día × {par.seguridadDias} d{par.seguridadManual ? " (fijado por ti)" : par.masivo ? " (compra masiva)" : ""}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-card p-4">
              <div className="ui-label">ROP · cuándo pedir</div>
              <div className="ui-h2 ui-num mt-1">{legible(par.puntoReorden)}</div>
              <div className="ui-sub ui-num mt-1">
                {legible(par.consumoDiario)}/día × {par.entregaDias} d entrega + stock de seguridad
              </div>
            </div>
            <div className="bg-surface border border-line rounded-card p-4">
              <div className="ui-label">PAR · hasta cuánto llenar</div>
              <div className="ui-h2 ui-num mt-1">{legible(par.parNivel)}</div>
              <div className="ui-sub ui-num mt-1">
                {par.masivo && par.lote ? `ROP + un lote de ${legible(par.lote)} (compra masiva)` : `${legible(par.consumoDiario)}/día × (${par.entregaDias} d entrega + ${par.cicloDias} d entre pedidos) + stock de seguridad`}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-card p-4">
              <div className="ui-label">Ahora</div>
              <div className="mt-1">
                <Pill tone={par.pedir ? "late" : "ok"}>{par.pedir ? "Pedir" : "Bien"}</Pill>
              </div>
              <div className="ui-sub ui-num mt-1">
                {par.pedir && par.cantidadSugerida ? `Pedir ${legible(par.cantidadSugerida)} para llegar al PAR` : par.coberturaDias != null ? `Alcanza para ${String(par.coberturaDias).replace(".", ",")} días` : "—"}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-card p-4">
              <div className="ui-label">Confiabilidad</div>
              <div className="mt-1">
                <Pill tone={par.confiabilidad === "alta" ? "ok" : par.confiabilidad === "media" ? "brand" : "late"}>
                  {{ alta: "Alta", media: "Media", baja: "Baja", sin_datos: "Sin datos" }[par.confiabilidad]}
                </Pill>
              </div>
              <div className="ui-sub mt-1 leading-relaxed">{par.faltan.length && par.confiabilidad !== "alta" ? par.faltan.join(" · ") : "Datos completos"}</div>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="usos-h" className="px-4 sm:px-7 mb-6">
        <h2 id="usos-h" className="ui-h2 m-0 mb-2">
          En recetas <span className="ui-num text-muted text-[17px]">· {ctx.recetas.length}</span>
        </h2>
        {ctx.recetas.length === 0 ? (
          <p className="ui-sub m-0">Ninguna receta lo usa{ctx.opciones ? `; ${ctx.opciones} modificador${ctx.opciones === 1 ? "" : "es"} sí` : ""}: las ventas no lo descuentan.</p>
        ) : (
          <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
            {ctx.recetas.map((r) => (
              <li key={r.producto_id} className="border-b border-line last:border-b-0">
                <Link href={`/productos/${r.producto_id}?tab=receta`} className="flex items-center gap-3 min-h-14 px-4 sm:px-5 py-2 text-text no-underline hover:bg-surface-2">
                  <span className="flex-1 min-w-0 ui-title truncate">{r.name}</span>
                  <span className="ui-num ui-sub whitespace-nowrap">
                    {cantidad(r.qty)} {r.unit} · {r.vendidas30} vendidos/30 d
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prep-h" className="px-4 sm:px-7 mb-6">
        <h2 id="prep-h" className="ui-h2 m-0 mb-2">
          Preparación de la casa
        </h2>
        <PreparacionEditor
          id={it.id}
          unit={it.unit}
          rinde={it.rinde != null ? Number(it.rinde) : null}
          lineas={(prepRows ?? []).map((r) => {
            const ing = (Array.isArray(r.ing) ? r.ing[0] : r.ing) as { name: string; unit: string; cost_cop: number } | null;
            return { ingredienteId: r.ingrediente_id as string, name: ing?.name ?? "—", unit: ing?.unit ?? "", qty: Number(r.qty), costo: Number(ing?.cost_cop ?? 0) };
          })}
          opciones={(opcionesRows ?? []).map((o) => ({ id: o.id as string, name: o.name as string, unit: o.unit as string, costo: Number(o.cost_cop) }))}
        />
      </section>

      <div className="px-4 sm:px-7 flex items-end gap-3 mb-2">
        <h2 className="ui-h2 m-0 flex-1">Kardex</h2>
        <Link href={`/inventario/movimientos?ingrediente=${it.id}`} className="text-text font-semibold min-h-11 inline-flex items-center">
          Movimientos →
        </Link>
      </div>
      <KardexClient item={data.item} periodo={periodo} lineas={lineas} totales={totales} truncado={data.truncado} />
    </div>
  );
}
