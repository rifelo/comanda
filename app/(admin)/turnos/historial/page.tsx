import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateLabelEs } from "@/lib/utils";
import { TurnosHeader } from "../../_components/turnos-header";
import { HistorialClient } from "./_components/historial-client";

export const dynamic = "force-dynamic";

/**
 * Past-shifts list. We pull the most recent 60 `shift_instances` with
 * joined template + completion + novedad counts and let the client component
 * own the selection state.
 */
export default async function TurnosHistorialPage() {
  const [{ supabase }, sede] = await Promise.all([
    requireAdmin(),
    getActiveSede(),
  ]);

  if (!sede) {
    return (
      <div>
        <TurnosHeader
          kicker="DANIEL'S BURGER · TURNOS PASADOS"
          title="Historial"
        />
        <div style={{ padding: "24px 32px" }}>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Sin sede registrada todavía.
          </p>
        </div>
      </div>
    );
  }

  const { data: shifts } = await supabase
    .from("shift_instances")
    .select(
      `id, restaurant_id, template_id, date, status,
       template:checklist_templates!inner(id, name, inicio, fin),
       completions:task_completions(count),
       novedades:novedades(count),
       opener:profiles!shift_instances_opened_by_fkey(full_name)`,
    )
    .eq("restaurant_id", sede.id)
    .order("date", { ascending: false })
    .limit(60);

  const rows = (shifts ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sx = s as any;
    return {
      id: sx.id as string,
      date: sx.date as string,
      dateLabel: formatDateLabelEs(sx.date as string),
      template_id: sx.template?.id as string,
      template_name: (sx.template?.name as string) ?? "—",
      status: sx.status as "open" | "closed",
      done: (sx.completions?.[0]?.count as number) ?? 0,
      novedades: (sx.novedades?.[0]?.count as number) ?? 0,
      opener: (sx.opener?.full_name as string) ?? "—",
    };
  });

  // Hydrate the selected shift's tasks once on the server (the client just
  // swaps selection between already-loaded rows — re-fetching on click would
  // be more accurate but adds a round-trip per row). For per-shift task
  // detail we fetch only the first row's template tasks.
  const firstTemplateId = rows[0]?.template_id;
  let firstTasks: {
    id: string;
    title: string;
    due_time: string | null;
    requires_photo: boolean;
  }[] = [];
  if (firstTemplateId) {
    const { data } = await supabase
      .from("template_tasks")
      .select("id, title, due_time, requires_photo, order_index")
      .eq("template_id", firstTemplateId)
      .order("order_index");
    firstTasks = (data ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      due_time: ((t.due_time as string | null) ?? null)?.slice(0, 5) ?? null,
      requires_photo: t.requires_photo as boolean,
    }));
  }

  return (
    <div>
      <TurnosHeader
        kicker={`${sede.name.toUpperCase()} · TURNOS PASADOS`}
        title="Historial"
      >
        <button type="button" className="cmd-btn ghost sm">
          Filtrar ▾
        </button>
        <button type="button" className="cmd-btn ghost sm">
          ↓ Exportar
        </button>
      </TurnosHeader>
      <HistorialClient
        rows={rows}
        initialTasks={firstTasks}
      />
    </div>
  );
}
