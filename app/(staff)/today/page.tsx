import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTodayShifts } from "@/lib/db/shifts";
import { listMyTasks } from "@/lib/db/tasks";
import {
  ComandaPlate,
  CmdSectionLabel,
  CmdProgress,
  Stamp,
} from "@/components/comanda/primitives";
import { TaskTodoRow } from "@/components/task-todo-row";
import { todayInTz, formatTime, formatDateLabelEs } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // Profile, shift list, and assigned tasks are independent — fan them out.
  const [{ profile }, items, myTasks] = await Promise.all([
    requireUser(),
    getTodayShifts(),
    listMyTasks(),
  ]);
  const today = todayInTz();
  const dateLabel = formatDateLabelEs(today);

  // Staff are usually assigned to a single sede, but admins-on-shift can
  // have today-shifts across more than one. Dedupe + join so the nameplate
  // truthfully reflects whichever restaurants today's turnos belong to.
  const restaurantNames = Array.from(
    new Set(
      items
        .map((s) => s.restaurant_name)
        .filter((n): n is string => !!n),
    ),
  );
  const restaurantLabel =
    restaurantNames.length > 0 ? restaurantNames.join(" · ") : undefined;

  return (
    <div className="mx-auto w-full max-w-md">
      <ComandaPlate
        subtitle={`${profile.full_name} · Hoy`}
        restaurant={restaurantLabel}
        date={dateLabel}
        time={formatTime(new Date())}
      />

      {myTasks.length > 0 ? (
        <>
          <CmdSectionLabel>Tareas asignadas</CmdSectionLabel>
          <ul>
            {myTasks.map((t) => (
              <TaskTodoRow key={t.id} task={t} userId={profile.id} />
            ))}
          </ul>
        </>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <Stamp rotate={-4} size={11}>
            Sin turnos hoy
          </Stamp>
          <p className="text-muted mt-6" style={{ fontSize: 12, lineHeight: 1.5 }}>
            No hay turnos abiertos.
            <br />
            Pídele al administrador que genere los turnos del día.
          </p>
        </div>
      ) : (
        <>
          <CmdSectionLabel>Turnos · {dateLabel}</CmdSectionLabel>
          <ul>
            {items.map((s, idx) => {
              const isOpen = s.status === "open";
              const total = s.total_tasks;
              const done = s.completed_tasks;
              const allDone = total > 0 && done >= total;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <li key={s.id}>
                  <Link
                    href={`/shift/${s.id}`}
                    className="block px-4 py-3.5 active:bg-paper-lt"
                    style={{ borderBottom: "1px solid var(--rule-soft)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {/* Status is now the lead element — big, color-coded. */}
                        <StatusPill open={isOpen} />
                        <div
                          className="text-ink mt-1.5"
                          style={{ fontSize: 15, fontWeight: 600 }}
                        >
                          {s.template_name ?? "Turno"}
                        </div>
                        <div
                          className="text-muted mt-0.5"
                          style={{ fontSize: 11 }}
                        >
                          {s.restaurant_name}
                        </div>
                      </div>
                      {/* DR id demoted to a faint corner stamp. */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="cmd-num"
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.12em",
                            color: "var(--muted)",
                            opacity: 0.6,
                          }}
                        >
                          DR-{100 + idx}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: 16 }}>
                          →
                        </span>
                      </div>
                    </div>

                    {/* Task completion indicator. */}
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <CmdProgress
                        done={done}
                        total={total}
                        color={allDone ? "var(--green)" : "var(--ink)"}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: allDone ? "var(--green)" : "var(--muted)",
                          fontWeight: allDone ? 600 : 400,
                        }}
                      >
                        {total === 0
                          ? "Sin tareas"
                          : allDone
                            ? `✓ ${done}/${total} completadas`
                            : `${done}/${total} tareas · ${pct}%`}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Prominent, color-coded shift status. Green = ABIERTO, muted ink = CERRADO. */
function StatusPill({ open }: { open: boolean }) {
  const color = open ? "var(--green)" : "var(--muted)";
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        border: `1.5px solid ${color}`,
        color,
        background: open ? "rgba(63,107,58,0.08)" : "transparent",
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        borderRadius: 2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {open ? "Abierto" : "Cerrado"}
    </span>
  );
}

