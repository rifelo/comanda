import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { diasLegibles, tocaHoy } from "@/lib/compras/compras";
import { resumenProveedor, whatsappLegible } from "@/lib/compras/proveedores";
import { listComprasResumen, listItemsProveedor, listProveedoresFicha } from "@/lib/compras/proveedores-db";
import { nivelDe } from "@/lib/inventario/niveles";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { posMoney } from "@/lib/pos/types";
import { todayIdxOf } from "@/lib/turno/state";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/top-bar";
import { NuevoProveedor } from "./_components/proveedor-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedores · Comanda" };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: "14px 16px" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const DIAS_VENTANA = 90;

/**
 * Proveedores: who the café buys from — when to order from each one, what
 * they bring, what was bought from them lately and what is still owed.
 * Each card opens the supplier's page (data, items, orders).
 */
export default async function ProveedoresPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const todayIdx = todayIdxOf(today);
  const desde = inicioDia(today, DIAS_VENTANA);

  const [proveedores, items, compras] = await Promise.all([
    listProveedoresFicha(supabase, orgId),
    listItemsProveedor(supabase, orgId),
    listComprasResumen(supabase, orgId),
  ]);

  const filas = proveedores
    .map((p) => {
      const suyos = items.filter((i) => i.proveedor_id === p.id);
      const bajos = suyos.filter((i) => i.stock_current >= 0 && nivelDe(i.stock_current, i.stock_critico, i.stock_min) !== "verde").length;
      return { p, suyos: suyos.length, bajos, r: resumenProveedor(compras.filter((c) => c.proveedor_id === p.id), desde), toca: p.dias_pedido_idx.length > 0 && tocaHoy(p.dias_pedido_idx, todayIdx) };
    })
    // Who takes orders today first, then who is owed, then A→Z.
    .sort((a, b) => Number(b.toca) - Number(a.toca) || b.r.debe - a.r.debe || a.p.name.localeCompare(b.p.name, "es"));

  const debeTotal = filas.reduce((s, f) => s + f.r.debe, 0);
  const compradoTotal = filas.reduce((s, f) => s + f.r.comprado, 0);
  const sinProveedor = items.filter((i) => !i.proveedor_id).length;
  const tocanHoy = filas.filter((f) => f.toca).length;

  return (
    <div>
      <PageHeader back="/inventario" title="Proveedores" sub="A quién se le compra, cuándo pedirle, qué trae y cuánto se le debe." />
      <div className="px-4 sm:px-7 pb-10 flex flex-col gap-5" style={{ maxWidth: 1100 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div style={card}>
            <div style={kicker}>Se debe</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: debeTotal ? "var(--red)" : "var(--text)" }}>{posMoney(debeTotal)}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>pedidos recibidos sin pagar</div>
          </div>
          <div style={card}>
            <div style={kicker}>Comprado · {DIAS_VENTANA} días</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{posMoney(compradoTotal)}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>en pedidos a proveedores</div>
          </div>
          <div style={card}>
            <div style={kicker}>Toca pedir hoy</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{tocanHoy}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{tocanHoy === 1 ? "proveedor" : "proveedores"} · <Link href="/inventario/pedidos" style={{ color: "var(--text)" }}>ver por pedir</Link></div>
          </div>
        </div>

        <div className="flex items-start flex-wrap" style={{ gap: 12 }}>
          <NuevoProveedor />
          {sinProveedor > 0 && (
            <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>
              {sinProveedor} ítem{sinProveedor === 1 ? "" : "s"} del inventario sin proveedor: entra a un proveedor y usa «Agregar ítems».
            </span>
          )}
        </div>

        <section aria-label="Proveedores" className="grid gap-3 sm:grid-cols-2">
          {filas.length === 0 && <div style={{ ...card, color: "var(--muted)", fontSize: 14 }}>Todavía no hay proveedores. Crea el primero con «Nuevo proveedor».</div>}
          {filas.map(({ p, suyos, bajos, r, toca }) => (
            <Link key={p.id} href={`/inventario/proveedores/${p.id}`} style={{ ...card, color: "var(--text)", textDecoration: "none" }} className="flex flex-col gap-2 hover:border-[var(--text)]">
              <div className="flex items-start" style={{ gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {toca && <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "var(--amber)", color: "#171717", whiteSpace: "nowrap" }}>Toca hoy</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                Pide: {diasLegibles(p.dias_pedido_idx)} · entrega {p.entrega_dias === 0 ? "el mismo día" : `en ${p.entrega_dias} día${p.entrega_dias === 1 ? "" : "s"}`}
                <br />
                <span className="cmd-num">{whatsappLegible(p.whatsapp) ?? "sin WhatsApp"}</span>
              </div>
              <div className="flex flex-wrap" style={{ gap: "4px 14px", fontSize: 13, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <span>{suyos} ítem{suyos === 1 ? "" : "s"}{bajos ? <b style={{ color: "var(--amber)" }}> · {bajos} por pedir</b> : null}</span>
                <span style={{ color: "var(--muted)" }}>{r.ultimoPedido ? `último pedido ${fechaCorta(todayInTz(tz, new Date(r.ultimoPedido)))}` : "sin pedidos"}{r.enCamino ? ` · ${r.enCamino} en camino` : ""}</span>
                {r.debe > 0 && <b className="cmd-num" style={{ color: "var(--red)" }}>Debe {posMoney(r.debe)}</b>}
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
