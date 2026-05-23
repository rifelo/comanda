import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTodayShifts } from "@/lib/db/shifts";
import {
  ComandaPlate,
  CmdSectionLabel,
  Stamp,
  Folio,
} from "@/components/comanda/primitives";
import { todayInTz, formatTime, formatDateLabelEs } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // Both the profile and the shift list are independent — fan them out.
  const [{ profile }, items] = await Promise.all([
    requireUser(),
    getTodayShifts(),
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
            {items.map((s, idx) => (
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
                        {s.template_name ?? "Turno"}
                      </div>
                      <div
                        className="text-muted mt-0.5"
                        style={{ fontSize: 11 }}
                      >
                        {s.restaurant_name}
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
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

