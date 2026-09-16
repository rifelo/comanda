import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listShifts } from "@/lib/db/shifts";
import { listRoster } from "@/lib/db/roster";
import { isoMonday, listAssignments } from "@/lib/db/assignments";
import { todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../../_components/turnos-header";
import { AsignacionGrid } from "./_components/asignacion-grid";
import { AsignacionMobile } from "./_components/asignacion-mobile";

export const dynamic = "force-dynamic";

export default async function TurnosAsignacionPage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  if (!sede) {
    return (
      <div>
        <TurnosHeader kicker="SIN SEDE" title="Asignación de personal" />
        <div style={{ padding: "24px 32px" }}>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Sin sede registrada todavía.
          </p>
        </div>
      </div>
    );
  }

  const today = todayInTz(sede.tz);
  const weekStart = isoMonday(today);

  const [shifts, roster, assignments] = await Promise.all([
    listShifts(sede.id),
    listRoster(sede.id),
    listAssignments(sede.id, weekStart),
  ]);

  const gridShifts = shifts.map((s) => ({
    id: s.id,
    name: s.name,
    inicio: s.inicio,
    dias: s.dias,
    puestos: s.puestos.map((p) => ({ id: p.puesto_id, name: p.puesto.name, color: p.puesto.color })),
  }));
  // Members and org admins (the owner runs Apertura); assigning someone
  // makes them a member.
  const gridRoster = roster
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      initials: r.initials,
      name: r.name,
      email: r.email,
      active: r.active,
    }));
  const gridAssignments = assignments.map((a) => ({
    template_id: a.template_id,
    dia_idx: a.dia_idx,
    puesto_id: a.puesto_id,
    member_id: a.member_id,
  }));

  return (
    <>
      {/* ── Mobile · day picker + bottom-sheet picker ────────────── */}
      <div className="md:hidden">
        <AsignacionMobile
          initialWeekStart={weekStart}
          today={today}
          shifts={gridShifts}
          roster={gridRoster}
          initialAssignments={gridAssignments}
        />
      </div>

      {/* ── Desktop · week grid (unchanged) ──────────────────────── */}
      <div className="hidden md:block">
        <AsignacionGrid
          initialWeekStart={weekStart}
          today={today}
          shifts={gridShifts}
          roster={gridRoster}
          initialAssignments={gridAssignments}
        />
      </div>
    </>
  );
}
