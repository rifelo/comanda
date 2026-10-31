import { todayInTz } from "@/lib/utils";
import { loadCajaEstado } from "@/lib/caja/estado";
import { contarAtrasadas } from "@/lib/turno/reads";
import { ahoraMs, actorOf, param, requireEquipo, withQuery, type SearchParams } from "../_components/gate";
import { EquipoShell } from "../_components/equipo";
import { CajaApp } from "./_components/caja-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caja · Comanda" };

/**
 * Caja on the team app (reference board 7), signed by whoever is logged in:
 * what the drawer should hold, every cash in and out with its «¿por qué?»,
 * the blind arqueo and the base check — one client screen
 * (./_components/caja-app.tsx) so it keeps working without internet. The
 * owner reviews it all at /caja. `?mov=entrada|salida` opens a new movement
 * straight away (Hoy's buttons).
 */
export default async function CajaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireEquipo(withQuery("/turno/caja", sp, ["mov"]));
  const [estado, atrasadas] = await Promise.all([
    loadCajaEstado(ctx.admin, { orgId: ctx.organizationId, restaurantId: ctx.restaurantId, tz: ctx.sede.tz, today: todayInTz(ctx.sede.tz) }),
    contarAtrasadas(ctx),
  ]);
  const mov = param(sp, "mov");
  const inst = estado.instances.find((i) => i.id === estado.instanceId) ?? null;
  const validada = estado.base.cierre?.base_validada_at ? "Base validada" : estado.porValidar ? "Falta validar la base" : null;
  const sub = [validada, inst ? `arqueo al cerrar · ${inst.fin.slice(0, 5).replace(/^0/, "")}` : null].filter(Boolean).join(" · ") || ctx.sede.name;
  return (
    <EquipoShell title="Caja" sub={sub} actor={actorOf(ctx)} tz={ctx.sede.tz} serverNow={ahoraMs()} atrasadas={atrasadas}>
      <CajaApp
        estado={estado}
        tz={ctx.sede.tz}
        actor={{ name: ctx.actor.fullName, isAdmin: ctx.actor.role === "admin" && !ctx.actor.viaDevice }}
        inicial={mov === "entrada" ? "entrada" : mov === "salida" ? "salida" : "inicio"}
      />
    </EquipoShell>
  );
}
