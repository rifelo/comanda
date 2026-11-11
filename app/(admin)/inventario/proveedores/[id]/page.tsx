import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listCompras } from "@/lib/compras/compras-db";
import { resumenPago, totalCompra } from "@/lib/compras/pagos";
import { resumenProveedor, whatsappLegible } from "@/lib/compras/proveedores";
import { getProveedorFicha, listItemsProveedor, listProveedoresFicha } from "@/lib/compras/proveedores-db";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/top-bar";
import { ItemsProveedor } from "../_components/items-proveedor";
import { ProveedorForm, QuitarProveedor } from "../_components/proveedor-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedor · Comanda" };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: "14px 16px" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const section: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--line)", marginBottom: 2 };
const DIAS_VENTANA = 90;

const ESTADO: Record<string, { label: string; color: string }> = {
  pedido: { label: "En camino", color: "var(--amber)" },
  recibido: { label: "Recibido", color: "var(--green)" },
  cerrada: { label: "Cerrado", color: "var(--muted)" },
  cancelada: { label: "Cancelado", color: "var(--muted)" },
};

/**
 * One supplier: its data (editable), the items it brings, its recent orders
 * with what each one still owes, and «Quitar» at the bottom.
 */
export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { profile, supabase }, sede] = await Promise.all([params, requireAdmin(), getActiveSede()]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const orgId = profile.organization_id;
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);

  const [proveedor, items, todos, compras] = await Promise.all([
    getProveedorFicha(supabase, orgId, id),
    listItemsProveedor(supabase, orgId),
    listProveedoresFicha(supabase, orgId),
    listCompras(supabase, orgId, undefined, 30, id),
  ]);
  if (!proveedor) notFound();

  const suyos = items.filter((i) => i.proveedor_id === id);
  const otros = items.filter((i) => i.proveedor_id !== id);
  const nombres = Object.fromEntries(todos.map((p) => [p.id, p.name]));
  const desde = inicioDia(today, DIAS_VENTANA);
  const r = resumenProveedor(compras, desde);
  const wa = proveedor.whatsapp ? `https://wa.me/${proveedor.whatsapp}` : null;

  return (
    <div>
      <PageHeader
        back="/inventario/proveedores"
        title={proveedor.name}
        sub={whatsappLegible(proveedor.whatsapp) ?? "Sin WhatsApp"}
        actions={wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm" })}>Escribir por WhatsApp</a> : undefined}
      />
      <div className="px-4 sm:px-7 pb-10 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <div style={card}>
            <div style={kicker}>Se le debe</div>
            <div className="cmd-num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: r.debe ? "var(--red)" : "var(--text)" }}>{posMoney(r.debe)}</div>
            {r.sinTotal > 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>+ {r.sinTotal} sin total de factura</div>}
          </div>
          <div style={card}>
            <div style={kicker}>Comprado · {DIAS_VENTANA} días</div>
            <div className="cmd-num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{posMoney(r.comprado)}</div>
          </div>
          <div style={card}>
            <div style={kicker}>Pedidos</div>
            <div className="cmd-num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{r.pedidos}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.enCamino ? `${r.enCamino} en camino` : r.ultimoPedido ? `último ${fechaCorta(todayInTz(tz, new Date(r.ultimoPedido)))}` : "ninguno aún"}</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section aria-label="Datos del proveedor">
            <div style={section}>Datos</div>
            <div style={{ paddingTop: 12 }}>
              <ProveedorForm key={JSON.stringify(proveedor)} proveedor={proveedor} />
            </div>
          </section>

          <ItemsProveedor proveedorId={id} items={suyos} otros={otros} proveedorNombre={nombres} />
        </div>

        <section aria-label="Pedidos">
          <div className="flex items-center" style={{ ...section, gap: 10 }}>
            <span>Pedidos recientes · {compras.length}</span>
            <Link href="/inventario/pedidos" style={{ marginLeft: "auto", color: "var(--text)", fontWeight: 600 }}>Ir a Pedidos →</Link>
          </div>
          {compras.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>Todavía no hay pedidos a este proveedor.</div>}
          {compras.map((c) => {
            const total = totalCompra(c);
            const pago = c.status === "cancelada" || c.status === "pedido" ? null : resumenPago(total, c.pagos);
            const e = ESTADO[c.status];
            return (
              <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1fr)_auto]" style={{ gap: "4px 14px", alignItems: "baseline", padding: "10px 0", borderBottom: "1px dashed var(--line)", fontSize: 14, opacity: c.status === "cancelada" ? 0.55 : 1 }}>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  n.º {c.folio} · {fechaCorta(todayInTz(tz, new Date(c.pedido_at)))}
                  {c.status === "pedido" && c.entrega_esperada ? <><br />llega {c.entrega_esperada < today ? <b style={{ color: "var(--red)" }}>{fechaCorta(c.entrega_esperada)} (atrasado)</b> : fechaCorta(c.entrega_esperada)}</> : null}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ color: e.color }}>{e.label}</b>
                  <span style={{ color: "var(--muted)" }}> · {c.items.length} ítem{c.items.length === 1 ? "" : "s"}{c.origen === "directa" ? " · compra directa" : ""}</span>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.items.map((i) => i.nombre).join(", ")}</div>
                  {pago && <div style={{ fontSize: 12.5, color: pago.debe ? "var(--red)" : "var(--muted)" }}>{pago.texto}</div>}
                </span>
                <span className="cmd-num" style={{ fontWeight: 700, textAlign: "right" }}>{total ? posMoney(total) : "—"}</span>
              </div>
            );
          })}
        </section>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <QuitarProveedor id={id} name={proveedor.name} items={suyos.length} />
        </div>
      </div>
    </div>
  );
}
