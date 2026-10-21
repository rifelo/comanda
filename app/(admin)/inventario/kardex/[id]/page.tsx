import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getKardex } from "@/lib/db/movements";
import { kardexLineas, kardexTotales } from "@/lib/movimientos";
import { parsePeriodo } from "@/lib/kardex-periodo";
import { bogotaDay } from "@/lib/pos/pending";
import { TurnosHeader } from "../../../_components/turnos-header";
import { KardexClient } from "./kardex-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Kardex · co-manda" };

/**
 * Kardex of one insumo: every movement in the period as entrada / salida with
 * the running saldo and its value, plus totals. The period comes from the URL
 * (?dias=7|30|90 or ?desde&hasta) through a plain GET form, because
 * router.push with only a changed query no-ops on this Next version.
 */
export default async function KardexPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string; desde?: string; hasta?: string }> }) {
  const [{ profile }, { id }, sp] = await Promise.all([requireAdmin(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const periodo = parsePeriodo(sp, bogotaDay());
  const data = await getKardex(profile.organization_id, id, periodo.desdeIso, periodo.hastaIso);
  if (!data) notFound();
  const lineas = kardexLineas(data.movimientos);
  const totales = kardexTotales(lineas, data.saldoInicial);

  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO · KARDEX" title={data.item.name}>
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
        <Link href={`/historial?ingrediente=${data.item.id}`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Movimientos</Link>
      </TurnosHeader>
      <KardexClient item={data.item} periodo={periodo} lineas={lineas} totales={totales} truncado={data.truncado} />
    </div>
  );
}
