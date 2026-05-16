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
import { formatTime } from "@/lib/utils";
import { ShiftBoard } from "./shift-board";

export const dynamic = "force-dynamic";

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireUser();
  const view = await getShiftView(id);
  if (!view) notFound();

  const completedCount = Object.keys(view.completions).length;
  const total = view.tasks.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const dateLabel = formatDateLabel(view.shift.date);

  return (
    <div className="mx-auto w-full max-w-md">
      <Link
        href="/today"
        className="block px-4 pt-3 text-muted"
        style={{ fontSize: 11, letterSpacing: "0.06em" }}
      >
        ← Hoy
      </Link>

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

      <ShiftBoard view={view} userId={profile.id} />
    </div>
  );
}

function formatDateLabel(yyyyMMdd: string) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wk = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"][dt.getUTCDay()];
  const month = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEP",
    "OCT",
    "NOV",
    "DIC",
  ][m - 1];
  return `${wk} ${d}·${month}`;
}
