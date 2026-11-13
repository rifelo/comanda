import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { etiquetaDescuento, formatoPesos as money } from "@/lib/pos/descuentos";
import { Card, PageHeader, Pill } from "@/components/ui";
import { Responder } from "../responder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descuento · Comanda" };

const ESTADO = { pendiente: ["Por aprobar", "brand"], aprobado: ["Aprobado", "ok"], rechazado: ["Rechazado", "late"], anulado: ["Retirado", "neutral"] } as const;

/** The page the WhatsApp link opens: what was asked, what it costs the café, Aprobar / Rechazar. */
export default async function DescuentoPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ profile }, { id }] = await Promise.all([requireAdmin(), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createSupabaseAdminClient();
  const orgId = profile.organization_id;
  const { data: d } = await db.from("orden_descuentos").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!d) notFound();
  const [{ data: orden }, { data: items }, { data: prod }] = await Promise.all([
    db.from("ordenes").select("folio, status, total_cop, subtotal_cop, paid_cop, customer_name, created_at").eq("id", d.orden_id).maybeSingle(),
    db.from("orden_items").select("id, name, qty, unit_price_cop, producto_id, customer_name").eq("orden_id", d.orden_id).order("position"),
    d.producto_id ? db.from("productos").select("price_cop, cost_cop").eq("id", d.producto_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [estadoTxt, tone] = ESTADO[d.estado as keyof typeof ESTADO];
  const costo = prod ? Number(prod.cost_cop ?? 0) : null;
  const precio = d.tipo === "precio" ? Number(d.precio_cop) : null;
  const margen = costo !== null && precio ? Math.round(((precio - costo) / precio) * 100) : null;
  const unidades = d.producto_id ? (items ?? []).filter((i) => i.producto_id === d.producto_id).reduce((s, i) => s + Number(i.qty), 0) : null;
  const antes = Number(d.total_antes_cop ?? orden?.total_cop ?? 0);
  const despues = Number(d.total_despues_cop ?? 0);

  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <PageHeader title={`Descuento · ${orden?.folio ?? ""}`} sub={d.pedido_por_nombre ? `Lo pide ${d.pedido_por_nombre}` : "Pedido desde la caja"} back="/descuentos" />
      <div className="px-4 sm:px-7 flex flex-col gap-4">
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <b style={{ fontSize: 20 }}>{etiquetaDescuento(d)}</b>
              <Pill tone={tone}>{estadoTxt}</Pill>
            </div>
            <div style={{ fontSize: 18 }}>
              Total {money(antes)} → <b>{money(despues)}</b> <span className="text-muted">(−{money(antes - despues)})</span>
            </div>
            <div><span className="text-muted">Motivo:</span> {d.motivo}</div>
            {precio !== null && prod ? (
              <div className="text-muted" style={{ fontSize: 15 }}>
                Precio normal {money(Number(prod.price_cop))} · costo {money(costo ?? 0)} · margen con este precio{" "}
                <b style={{ color: margen !== null && margen < 55 ? "var(--late)" : undefined }}>{margen ?? "—"} %</b>
                {unidades ? ` · ${unidades} und en el pedido` : ""}
              </div>
            ) : null}
            {d.respuesta ? <div className="text-muted">Nota: {d.respuesta}</div> : null}
            {d.estado === "pendiente" && orden?.status !== "pendiente" ? (
              <div className="text-late font-semibold">El pedido ya fue {orden?.status === "pagada" ? "cobrado" : "cancelado"}: no se puede aplicar.</div>
            ) : null}
          </div>
        </Card>
        {d.estado === "pendiente" && orden?.status === "pendiente" ? (
          <Card><Responder id={d.id as string} /></Card>
        ) : null}
        <Card>
          <div className="flex flex-col gap-1">
            <b>Pedido {orden?.folio}{orden?.customer_name ? ` · ${orden.customer_name}` : ""}</b>
            {(items ?? []).map((i) => (
              <div key={i.id as string} className="flex justify-between gap-3" style={{ fontSize: 15, borderBottom: "1px dashed var(--rule)", padding: "6px 0" }}>
                <span>{i.qty} × {i.name}{i.customer_name ? <span className="text-muted"> · {i.customer_name}</span> : null}</span>
                <span className="cmd-num">{money(Number(i.qty) * Number(i.unit_price_cop))}</span>
              </div>
            ))}
            <div className="flex justify-between" style={{ paddingTop: 6 }}><b>Total actual</b><b className="cmd-num">{money(Number(orden?.total_cop ?? 0))}</b></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
