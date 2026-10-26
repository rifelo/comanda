import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { agruparPorProveedor, mensajePedido, waLink } from "@/lib/compras/compras";
import { listCompras, loadPorPedir } from "@/lib/compras/compras-db";
import { cantidadLegible, nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { todayIdxOf } from "@/lib/turno/state";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../_components/turnos-header";
import { ComprasClient, type GrupoView, type PedidoView } from "./compras-client";
import { Recibidos } from "./recibidos";
import { PorPedirMobile, type CaminoView, type ItemUnidad, type NuevoView } from "./por-pedir-mobile";
import { buildPorPedirMovil, qtyLegible, totales } from "@/lib/compras/por-pedir";
import { cuando, horaLocal, llegaLabel } from "@/lib/inventario/acabando";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Compras · co-manda" };

/**
 * Purchasing for the owner: what there is to order, by supplier (levels,
 * faltantes and what the team asked for from the tablet), with whoever is due
 * today first; one tap turns a supplier's lines into an order with the
 * WhatsApp message ready. Below, the orders on their way and each supplier's
 * order days.
 */
export default async function ComprasPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const [data, pedidos, recibidos, { data: sugeridos }] = await Promise.all([
    loadPorPedir(supabase, profile.organization_id),
    listCompras(supabase, profile.organization_id, ["pedido"]),
    listCompras(supabase, profile.organization_id, ["recibido", "cerrada"], 15),
    supabase
      .from("inventario_sugerencias")
      .select("id, nombre, estado, nota, created_at, quien:profiles!inventario_sugerencias_sugerido_por_fkey(full_name)")
      .eq("organization_id", profile.organization_id)
      .eq("tipo", "nuevo")
      .eq("status", "pendiente")
      .order("created_at"),
  ]);
  const itemById = new Map(data.items.map((i) => [i.id, i]));

  const grupos: GrupoView[] = agruparPorProveedor(data.lineas, data.proveedores, todayIdxOf(today)).map((g) => ({
    proveedor: g.proveedor ? { id: g.proveedor.id, name: g.proveedor.name, whatsapp: g.proveedor.whatsapp, dias: g.proveedor.dias_pedido_idx } : null,
    toca: g.toca,
    faltan: g.faltan,
    lineas: g.lineas.map((l) => {
      const it = l.ingredienteId ? itemById.get(l.ingredienteId) : undefined;
      const pieza = it ? piezaDe(it) : null;
      return {
        key: l.key,
        nombre: l.nombre,
        nivel: l.nivel,
        motivos: l.motivos,
        notas: l.notas,
        solicitudId: l.ingredienteId ? null : l.solicitudIds[0] ?? null,
        hay: it ? (it.stock < 0 ? "sin dato" : cantidadLegible(it.stock, it)) : null,
        qty: l.qty,
        // What the quantity is typed in: pieces when the item has one, else its unit.
        pieza,
        enQue: it ? (pieza ? nombrePaquete(it, 2) : it.unit) : "und",
      };
    }),
  }));

  const enCamino: PedidoView[] = pedidos.map((c) => {
    const lineas = c.items.map((it) => ({ nombre: it.nombre, cantidad: it.unit ? cantidadLegible(it.qty_pedida, { unit: it.unit, pack_qty: it.pack_qty, pieza_qty: it.pieza_qty, pack_label: it.pack_label }) : String(it.qty_pedida) }));
    return {
      id: c.id,
      folio: c.folio,
      proveedor: c.proveedor_name ?? "Sin proveedor",
      pedido: fechaCorta(todayInTz(tz, new Date(c.pedido_at))),
      llega: c.entrega_esperada ? fechaCorta(c.entrega_esperada) : null,
      atrasado: !!c.entrega_esperada && c.entrega_esperada < today,
      lineas,
      wa: waLink(c.proveedor_whatsapp, mensajePedido({ negocio: sede?.name ?? "la cafetería", folio: c.folio, lineas, nota: c.note })),
    };
  });

  // ── The phone (md:hidden): «Por pedir», only what the team marked or asked for.
  const movil = buildPorPedirMovil({ lineas: data.lineas, items: data.items, faltantes: data.faltantes, proveedores: data.proveedores, today });
  const unidades: Record<string, ItemUnidad> = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const nuevos: NuevoView[] = (sugeridos ?? []).map((n) => {
    const who = n.quien as unknown as { full_name: string | null } | { full_name: string | null }[] | null;
    const by = (Array.isArray(who) ? who[0]?.full_name : who?.full_name) ?? null;
    return {
      id: n.id as string,
      nombre: n.nombre as string,
      estado: (n.estado as "bajo" | "agotado" | null) ?? null,
      meta: [n.estado === "bajo" ? "Poco" : n.estado === "agotado" ? "Agotado" : "Falta en la lista", by ? `lo agregó ${by}` : null, cuando(n.created_at as string, today)].filter(Boolean).join(" · "),
      nota: (n.nota as string | null) ?? null,
    };
  });
  const caminoMovil: CaminoView[] = pedidos.map((c) => {
    const first = c.items[0];
    const qty = c.items.length === 1 && first?.unit ? qtyLegible(first.qty_pedida, { unit: first.unit, pack_qty: first.pack_qty, pieza_qty: first.pieza_qty, pack_label: first.pack_label, stock_critico: 0, stock_min: 0, stock_objetivo: null }) : `${c.items.length} productos`;
    return {
      id: c.id,
      nombre: c.items.length > 1 ? `${first?.nombre ?? "Pedido"} y ${c.items.length - 1} más` : first?.nombre ?? `Pedido n.º ${c.folio}`,
      qty,
      meta: `${c.proveedor_name ?? "Sin proveedor"} · ${llegaLabel(c.entrega_esperada, today)} · n.º ${c.folio}`,
    };
  });
  const recibidosHoy = recibidos
    .filter((c) => c.recibido_at && horaLocal(c.recibido_at).fecha === today)
    .map((c) => ({ id: c.id, nombre: c.items.length > 1 ? `${c.items[0]?.nombre} y ${c.items.length - 1} más` : c.items[0]?.nombre ?? `Pedido n.º ${c.folio}` }));
  const resumen = totales(movil, nuevos);

  return (
    <div>
      <div className="md:hidden">
        <PorPedirMobile
          negocio={sede?.name ?? "la cafetería"}
          hora={horaLocal(new Date().toISOString()).hora}
          grupos={movil}
          unidades={unidades}
          nuevos={nuevos}
          camino={caminoMovil}
          recibidosHoy={recibidosHoy}
          proveedores={data.proveedores.map((p) => ({ id: p.id, name: p.name }))}
          total={resumen.total}
          agotados={resumen.agotados}
        />
      </div>
      <div className="hidden md:block">
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Compras">
        <Link href="/inventario/niveles" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Niveles y proveedores</Link>
      </TurnosHeader>
      <ComprasClient
        grupos={grupos}
        enCamino={enCamino}
        proveedores={data.proveedores.map((p) => ({ id: p.id, name: p.name, whatsapp: p.whatsapp, dias: p.dias_pedido_idx, entregaDias: p.entrega_dias }))}
        items={data.items.map((i) => { const pieza = piezaDe(i); return { id: i.id, name: i.name, enQue: pieza ? nombrePaquete(i, 2) : i.unit }; })}
        today={today}
        recibidos={<Recibidos compras={recibidos} tz={tz} />}
      />
      </div>
    </div>
  );
}
