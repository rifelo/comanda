import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { etiquetaDescuento, formatoPesos as money } from "@/lib/pos/descuentos";
import { PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descuentos · Comanda" };

const ESTADO = { pendiente: ["Por aprobar", "brand"], aprobado: ["Aprobado", "ok"], rechazado: ["Rechazado", "late"], anulado: ["Retirado", "neutral"] } as const;
/** ISO of 60 days ago (outside the component: the lint rule bans Date.now in render). */
function hace60Dias(): string {
  return new Date(Date.now() - 60 * 86400_000).toISOString();
}

const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** Discount requests from the POS: waiting first, then the last 60 days. */
export default async function DescuentosPage() {
  const { profile } = await requireAdmin();
  const db = createSupabaseAdminClient();
  const desde = hace60Dias();
  const { data } = await db
    .from("orden_descuentos")
    .select("id, tipo, producto_nombre, precio_cop, porcentaje, motivo, estado, total_antes_cop, total_despues_cop, pedido_por_nombre, pedido_at, orden:ordenes(folio)")
    .eq("organization_id", profile.organization_id)
    .gte("pedido_at", desde)
    .order("pedido_at", { ascending: false });
  const rows = data ?? [];
  const pend = rows.filter((r) => r.estado === "pendiente");
  const hist = rows.filter((r) => r.estado !== "pendiente");
  const aprobado = hist.filter((r) => r.estado === "aprobado").reduce((s, r) => s + Number(r.total_antes_cop ?? 0) - Number(r.total_despues_cop ?? 0), 0);
  const folio = (r: (typeof rows)[number]) => {
    const o = r.orden as unknown as { folio: string } | { folio: string }[] | null;
    return (Array.isArray(o) ? o[0]?.folio : o?.folio) ?? "";
  };
  const Fila = ({ r }: { r: (typeof rows)[number] }) => {
    const [txt, tone] = ESTADO[r.estado as keyof typeof ESTADO];
    const ahorro = Number(r.total_antes_cop ?? 0) - Number(r.total_despues_cop ?? 0);
    return (
      <Link href={`/descuentos/${r.id}`} className="flex items-baseline gap-3 flex-wrap" style={{ padding: "10px 0", borderBottom: "1px dashed var(--rule)", textDecoration: "none", color: "inherit" }}>
        <span style={{ flex: 1, minWidth: 220 }}>
          <b>{folio(r)} · {etiquetaDescuento(r)}</b>
          <span className="text-muted" style={{ display: "block", fontSize: 14 }}>{r.motivo}{r.pedido_por_nombre ? ` · ${r.pedido_por_nombre}` : ""} · {fecha(r.pedido_at as string)}</span>
        </span>
        <span className="cmd-num" style={{ fontWeight: 700 }}>−{money(ahorro)}</span>
        <Pill tone={tone}>{txt}</Pill>
      </Link>
    );
  };
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="Descuentos" sub="Lo que pide la caja y tú apruebas" back="/mas" />
      <div className="px-4 sm:px-7 pb-12 flex flex-col gap-6">
        <section>
          <h2 className="font-bold" style={{ fontSize: 18 }}>Por aprobar · {pend.length}</h2>
          {pend.length ? pend.map((r) => <Fila key={r.id as string} r={r} />) : <p className="text-muted">Nada esperando.</p>}
        </section>
        <section>
          <div className="flex items-baseline gap-3">
            <h2 className="font-bold" style={{ fontSize: 18 }}>Últimos 60 días</h2>
            <span className="text-muted" style={{ marginLeft: "auto" }}>Descontado: <b className="cmd-num">{money(aprobado)}</b></span>
          </div>
          {hist.length ? hist.map((r) => <Fila key={r.id as string} r={r} />) : <p className="text-muted">Sin descuentos todavía.</p>}
        </section>
      </div>
    </div>
  );
}
