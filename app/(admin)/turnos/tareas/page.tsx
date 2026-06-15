import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listTasks } from "@/lib/db/tasks";
import { listRoster } from "@/lib/db/roster";
import { todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../../_components/turnos-header";
import { TareasManager } from "./_components/tareas-manager";

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

  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <div>
      <TurnosHeader
        kicker={`${sede.name.toUpperCase()} · ${pendingCount} PENDIENTES`}
        title="Tareas"
      />
      <TareasManager
        tasks={tasks}
        roster={roster}
        today={today}
        restaurantId={sede.id}
        sedeName={sede.name}
      />
    </div>
  );
}
