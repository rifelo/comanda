import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listTasks } from "@/lib/db/tasks";
import { listRoster } from "@/lib/db/roster";
import { todayInTz } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { TurnosHeader } from "../../_components/turnos-header";
import { NuevaTareaForm } from "./_components/nueva-tarea-form";
import { TareaRow } from "./_components/tarea-row";

export const dynamic = "force-dynamic";

export default async function TurnosTareasPage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  if (!sede) {
    return (
      <div>
        <TurnosHeader kicker="SIN SEDE" title="Tareas" />
        <div style={{ padding: "24px 32px" }}>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Sin sede registrada todavía.
          </p>
        </div>
      </div>
    );
  }

  const today = todayInTz(sede.tz);
  const [tasks, roster] = await Promise.all([
    listTasks(sede.id),
    listRoster(sede.id),
  ]);

  const pending = tasks.filter((t) => t.status === "pending");
  const done = tasks.filter((t) => t.status === "done");

  const hoy = pending.filter(
    (t) => t.scheduled_date && t.scheduled_date <= today,
  );
  const proximas = pending.filter(
    (t) => t.scheduled_date && t.scheduled_date > today,
  );
  const sinFecha = pending.filter((t) => !t.scheduled_date);

  return (
    <div>
      <TurnosHeader
        kicker={`${sede.name.toUpperCase()} · PENDIENTES ${pending.length}`}
        title="Tareas"
      />
      <div style={{ padding: "24px 32px", maxWidth: 760 }}>
        <NuevaTareaForm restaurantId={sede.id} roster={roster} />

        {tasks.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>
            No hay tareas todavía. Crea la primera.
          </p>
        ) : (
          <>
            <Group label="Hoy y vencidas" tasks={hoy} />
            <Group label="Próximas" tasks={proximas} />
            <Group label="Sin fecha" tasks={sinFecha} />
            <Group label={`Completadas · ${done.length}`} tasks={done} />
          </>
        )}
      </div>
    </div>
  );
}

function Group({ label, tasks }: { label: string; tasks: Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <section style={{ marginTop: 8 }}>
      <div
        className="text-muted"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "16px 0 4px",
        }}
      >
        {label}
      </div>
      {tasks.map((t) => (
        <TareaRow key={t.id} task={t} />
      ))}
    </section>
  );
}
