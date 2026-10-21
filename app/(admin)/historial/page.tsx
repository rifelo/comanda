import { requireAdmin } from "@/lib/auth";
import { getMovimientos } from "@/lib/db/movements";
import { getIngredientesView } from "@/lib/db/ingredients";
import { parsePeriodo } from "@/lib/kardex-periodo";
import { bogotaDay } from "@/lib/pos/pending";
import { HistorialClient } from "./historial-client";

export const metadata = { title: "Operación · Movimientos · co-manda" };
export const dynamic = "force-dynamic";

const LIMIT = 300;

/**
 * Movimientos: the whole org's stock log, newest first. ?ingrediente=<id>
 * narrows to one item, ?dias / ?desde&hasta bound the period (server-side, so
 * the 300-row page is the filtered one, not the newest 300 of everything).
 */
export default async function HistorialPage({ searchParams }: { searchParams: Promise<{ ingrediente?: string; dias?: string; desde?: string; hasta?: string }> }) {
  const [{ profile }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const ingredienteId = sp.ingrediente && /^[0-9a-f-]{36}$/i.test(sp.ingrediente) ? sp.ingrediente : undefined;
  const acotado = Boolean(sp.dias || (sp.desde && sp.hasta));
  const periodo = acotado ? parsePeriodo(sp, bogotaDay()) : null;
  const [movimientos, ingredientesView] = await Promise.all([
    getMovimientos(profile.organization_id, { limit: LIMIT, ingredienteId, desde: periodo?.desdeIso, hasta: periodo?.hastaIso }),
    getIngredientesView(profile.organization_id),
  ]);
  const ingredientes = ingredientesView.ingredientes.map((i) => ({ id: i.id, name: i.name, unit: i.unit }));
  return <HistorialClient movimientos={movimientos} ingredientes={ingredientes} ingredienteId={ingredienteId ?? null} periodo={periodo} limit={LIMIT} />;
}
