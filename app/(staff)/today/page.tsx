import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTodayShifts } from "@/lib/db/shifts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ComandaPlate,
  CmdSectionLabel,
  Stamp,
  Folio,
} from "@/components/comanda/primitives";
import { todayInTz, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { profile } = await requireUser();
  const shifts = await getTodayShifts();
  const today = todayInTz();

  // Hydrate restaurant + template names alongside each shift.
  const supabase = await createSupabaseServerClient();
  const { data: enriched } = await supabase
    .from("shift_instances")
    .select(
      "id, status, restaurant:restaurants(name), template:checklist_templates(name, shift)",
    )
    .in(
      "id",
      shifts.map((s) => s.id),
    );

  const items = enriched ?? [];
  const dateLabel = formatDateLabel(today);

  return (
    <div className="mx-auto w-full max-w-md">
      <ComandaPlate
        subtitle={`${profile.full_name} · Hoy`}
        restaurant="Daniel's Burger"
        date={dateLabel}
        time={formatTime(new Date())}
      />

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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const t = (s as any).template;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const r = (s as any).restaurant;
              return (
                <li key={s.id}>
                  <Link
                    href={`/shift/${s.id}`}
                    className="block px-4 py-3.5 active:bg-paper-lt"
                    style={{ borderBottom: "1px solid var(--rule-soft)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="text-ink"
                          style={{ fontSize: 14, fontWeight: 500 }}
                        >
                          {t?.name ?? "Turno"}
                        </div>
                        <div
                          className="text-muted mt-0.5"
                          style={{ fontSize: 11 }}
                        >
                          {r?.name}
                          {t?.shift ? ` · Turno ${t.shift === "day" ? "día" : "noche"}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Folio
                          n={`DR-${100 + idx}`}
                          label={s.status === "open" ? "ABIERTO" : "CERRADO"}
                        />
                        <span style={{ color: "var(--muted)" }}>→</span>
                      </div>
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
