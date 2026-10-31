import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getIngredientesView, getPorRevisarExtra, recetaMasVendidaPorInsumo } from "@/lib/db/ingredients";
import { getCostosPendientes } from "@/lib/db/costos-pendientes";
import { cuando } from "@/lib/inventario/acabando";
import { conteoSummary } from "@/lib/inventario/conteo";
import { loadConteosPanel } from "@/lib/inventario/conteos";
import { listFaltantesAbiertos, listFaltantesRecientes } from "@/lib/inventario/faltantes-db";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { todayInTz } from "@/lib/utils";
import { InventarioScreen } from "./_components/inventario-screen";
import type { PorRevisarData } from "./_components/por-revisar";

// TODO(P4→Ola 3): lib/nav/items.ts Inventario sections — Movimientos href "/historial" → "/inventario/movimientos",
// Pedidos "/compras" → "/inventario/pedidos", Faltantes "/inventario/faltantes" → "/inventario?vista=acabando"
// (label «Se acaba»), and «Existencias» should also match /inventario/<id> (today it lights no section there).
export const metadata: Metadata = { title: "Inventario · Comanda" };
export const dynamic = "force-dynamic";

/**
 * Owner's inventory: «Por revisar» (negatives, counts to approve, costs
 * missing, team suggestions, mermas) + the list with «Corregir».
 * `?vista=acabando` opens what the team flagged (ex /inventario/faltantes).
 */
export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const [{ profile, supabase }, sede, sp] = await Promise.all([requireAdmin(), getActiveSede(), searchParams]);
  const orgId = profile.organization_id;
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const [view, costos, conteos, extra, recetaPorInsumo, abiertos, recientes] = await Promise.all([
    getIngredientesView(orgId),
    getCostosPendientes(supabase, orgId),
    loadConteosPanel(supabase, orgId, tz),
    getPorRevisarExtra(orgId, inicioDia(today, 7)),
    recetaMasVendidaPorInsumo(orgId),
    listFaltantesAbiertos(supabase, orgId),
    listFaltantesRecientes(supabase, orgId, 40),
  ]);

  const porRevisar: PorRevisarData = {
    negativos: costos.negativos.sort((a, b) => a.stock - b.stock),
    sinCosto: costos.sinCosto,
    conteos: conteos.pendientes.map((c) => {
      const s = conteoSummary(c.items);
      return {
        id: c.id,
        kind: c.kind,
        quien: c.counted_by_name,
        cuando: cuando(c.submitted_at, today),
        lineas: s.lines,
        conDiferencia: s.withDiff,
        neto: s.netValue,
        propuestas: conteos.propuestas[c.id] ?? 0,
      };
    }),
    ayerSinConteo: conteos.ayerSinConteo,
    sugerencias: extra.sugerencias,
    mermas: extra.mermas.map((m) => ({ ...m, cuando: cuando(m.reportedAt, today) })),
  };

  return (
    <InventarioScreen
      ingredientes={view.ingredientes}
      categorias={view.categorias}
      porRevisar={porRevisar}
      recetaPorInsumo={recetaPorInsumo}
      faltantes={{ abiertos, recientes, tz }}
      vistaInicial={sp.vista === "acabando" ? "acabando" : "existencias"}
    />
  );
}
