import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getShiftView } from "@/lib/db/shifts";
import {
  ComandaPlate,
  CmdProgress,
  Folio,
  Stamp,
} from "@/components/comanda/primitives";
import { formatTime, formatDateLabelEs } from "@/lib/utils";
import { getCierreByInstance } from "@/lib/caja/cierres";
import { countFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { ShiftBoard } from "./shift-board";
import { ShiftTools } from "./shift-tools";
import { RealtimeAdHoc } from "./realtime-adhoc";

export const dynamic = "force-dynamic";

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, supabase } = await requireUser();
  const view = await getShiftView(id);
  if (!view) notFound();
  // Shift tools (arqueo + quick inventory) state, read with the person's own session.
  const [cierre, faltantes] = await Promise.all([
    getCierreByInstance(supabase, profile.organization_id, view.shift.id),
    countFaltantesAbiertos(supabase, profile.organization_id),
  ]);
  const hasCajaTask = view.tasks.some((t) => /arqueo|cierre de caja/i.test(t.title));

  const completedCount = Object.keys(view.completions).length;
  const total = view.tasks.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const dateLabel = formatDateLabelEs(view.shift.date);

  return (
    // Phone-first (448 px), but on the tablet the task list takes the whole
    // width: from 768 px there is no cap at all (the same reading face as /turno).
    <div className="turno-ui mx-auto w-full max-w-md md:max-w-none">
      <div className="px-4 pt-3">
        <Link
          href={profile.role === "admin" ? `/hoy/${view.shift.date}?turno=${view.shift.id}` : "/today"}
          className="cmd-btn ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 16px", fontSize: 13, textDecoration: "none" }}
        >
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
          {profile.role === "admin" ? "Volver al panel" : "Volver a Hoy"}
        </Link>
      </div>

      {view.shift.status === "closed" ? (
        <div className="px-4 pt-3 flex justify-center">
          <Stamp rotate={-4} size={12} color="var(--green)">
            ✓ Turno cerrado
          </Stamp>
        </div>
      ) : null}

      <ComandaPlate
        subtitle={`${profile.full_name} · ${view.template.name}`}
        restaurant={view.restaurant.name}
        date={dateLabel}
        time={formatTime(new Date())}
      />

      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px dashed var(--rule)" }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-muted mb-1"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Avance del turno
          </div>
          <CmdProgress done={completedCount} total={total} />
        </div>
        <div className="text-right">
          <div
            className="cmd-num font-slab leading-none"
            style={{ fontSize: 28 }}
          >
            {pct}
            <span className="text-muted" style={{ fontSize: 14 }}>
              %
            </span>
          </div>
          <div
            className="text-muted"
            style={{ fontSize: 9, letterSpacing: "0.14em" }}
          >
            {completedCount}/{total} TAREAS
          </div>
        </div>
        <Folio n={`DR-${view.shift.id.slice(0, 4).toUpperCase()}`} />
      </div>

      <ShiftTools shiftId={view.shift.id} cierre={cierre} faltantes={faltantes} hasCajaTask={hasCajaTask} />

      <ShiftBoard view={view} userId={profile.id} cajaPending={hasCajaTask && !cierre} />
      <RealtimeAdHoc shiftId={view.shift.id} />
    </div>
  );
}

