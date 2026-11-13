import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarConfig, planificarDia } from "@/lib/inventario/agente/db";
import { tareaToca } from "./dias-tarea";
export { VINCULOS, esVinculo, type Vinculo } from "./vinculo-info";

/**
 * Turno tasks tied to other work (template_tasks.vinculo, mig 0084). They are
 * never ticked by hand: `sincronizarVinculadas` writes or removes their
 * completion from the real state, so the tablet, /hoy and the reports all see
 * the same thing.
 *
 * 'verificar_insumos' — done when no inventory verification (agente_tareas)
 * is pending for the org today; while one is pending the task stays open,
 * also if it had been completed earlier (the owner asked for another count).
 */

type Ctx = { admin: SupabaseClient; organizationId: string; restaurantId: string };

/** Pending verifications today (after making sure today is planned) and who did the last one. */
async function estadoVerificacion(ctx: Ctx, fecha: string): Promise<{ pendientes: number; ultimaPor: string | null }> {
  const config = await cargarConfig(ctx.admin, ctx.organizationId);
  if (config.ultimoPlan !== fecha) {
    try {
      await planificarDia(ctx.admin, ctx.organizationId, { fecha, restaurantId: ctx.restaurantId });
    } catch (e) {
      console.error("[vinculos] planificarDia", e);
    }
  }
  const [{ count }, { data: ultima }] = await Promise.all([
    ctx.admin
      .from("agente_tareas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId)
      .eq("estado", "pendiente")
      .lte("fecha", fecha),
    ctx.admin
      .from("agente_tareas")
      .select("hecha_por")
      .eq("organization_id", ctx.organizationId)
      .not("hecha_por", "is", null)
      .gte("hecha_at", `${fecha}T00:00:00-05:00`)
      .order("hecha_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { pendientes: count ?? 0, ultimaPor: (ultima?.hecha_por as string | null) ?? null };
}

/**
 * Bring the completions of today's linked tasks (open turnos of the sede) in
 * line with the real state. Cheap when no turno has a linked task: two small queries.
 * Never throws — a failure only leaves the tablet as it was.
 */
export async function sincronizarVinculadas(ctx: Ctx & { actorId: string }, fecha: string): Promise<void> {
  try {
    const { data: insts } = await ctx.admin
      .from("shift_instances")
      .select("id, template_id")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("date", fecha)
      .neq("status", "closed");
    if (!insts?.length) return;
    const { data: tasks } = await ctx.admin
      .from("template_tasks")
      .select("id, template_id, vinculo, dias")
      .in("template_id", [...new Set(insts.map((i) => i.template_id as string))])
      .eq("vinculo", "verificar_insumos");
    const linked: { instanceId: string; taskId: string }[] = [];
    for (const i of insts) {
      for (const t of tasks ?? []) {
        if (t.template_id === i.template_id && tareaToca(t.dias, fecha)) linked.push({ instanceId: i.id as string, taskId: t.id as string });
      }
    }
    if (!linked.length) return;

    const { pendientes, ultimaPor } = await estadoVerificacion(ctx, fecha);
    const { data: comps } = await ctx.admin
      .from("task_completions")
      .select("shift_instance_id, template_task_id")
      .in("shift_instance_id", [...new Set(linked.map((l) => l.instanceId))])
      .in("template_task_id", linked.map((l) => l.taskId));
    const done = new Set((comps ?? []).map((c) => `${c.shift_instance_id}:${c.template_task_id}`));

    for (const l of linked) {
      const isDone = done.has(`${l.instanceId}:${l.taskId}`);
      if (pendientes === 0 && !isDone) {
        const { error } = await ctx.admin.from("task_completions").upsert(
          {
            shift_instance_id: l.instanceId,
            template_task_id: l.taskId,
            completed_by: ultimaPor ?? ctx.actorId,
            note: ultimaPor ? "Verificación de insumos terminada" : "Sin insumos por verificar hoy",
          },
          { onConflict: "shift_instance_id,template_task_id" },
        );
        if (error) console.error("[vinculos] completar", error);
      } else if (pendientes > 0 && isDone) {
        await ctx.admin.from("task_completions").delete().eq("shift_instance_id", l.instanceId).eq("template_task_id", l.taskId);
      }
    }
  } catch (e) {
    console.error("[vinculos] sincronizar", e);
  }
}
