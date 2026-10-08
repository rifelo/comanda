import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTodayShifts } from "@/lib/db/shifts";
import { listMyTasks } from "@/lib/db/tasks";
import { loadRutina } from "@/lib/inventario/conteos";
import { NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { ComandaPlate } from "@/components/comanda/primitives";
import { todayInTz, formatTime, formatDateLabelEs } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Staff home — where a team member lands after signing in. Three doors: the
 * day's turnos (checklists), the register and the inventory (the tablet's
 * own screens, signed by this person). Each one says what is waiting
 * behind it, so the person knows where they are needed before tapping.
 */
export default async function StaffHomePage() {
  const [{ profile, supabase }, shifts, myTasks] = await Promise.all([
    requireUser(),
    getTodayShifts(),
    listMyTasks(),
  ]);
  const { rutina } = await loadRutina(supabase, profile.organization_id, "America/Bogota");
  const dateLabel = formatDateLabelEs(todayInTz());
  const firstName = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;

  const restaurantNames = Array.from(
    new Set(shifts.map((s) => s.restaurant_name).filter((n): n is string => !!n)),
  );

  const open = shifts.filter((s) => s.status === "open");
  const total = open.reduce((n, s) => n + s.total_tasks, 0);
  const done = open.reduce((n, s) => n + s.completed_tasks, 0);
  const turnosLine =
    shifts.length === 0
      ? "Sin turnos hoy"
      : open.length === 0
        ? `${shifts.length} turno${shifts.length === 1 ? "" : "s"} · cerrado${shifts.length === 1 ? "" : "s"}`
        : `${open.length} turno${open.length === 1 ? "" : "s"} abierto${open.length === 1 ? "" : "s"} · ${done}/${total} tareas`;

  return (
    <div className="w-full">
      <ComandaPlate
        subtitle={`Hola, ${firstName}`}
        restaurant={restaurantNames.length > 0 ? restaurantNames.join(" · ") : undefined}
        date={dateLabel}
        time={formatTime(new Date())}
      />

      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 px-4 py-5 sm:grid-cols-2 sm:py-8 lg:max-w-6xl lg:grid-cols-3">
        <Door
          href="/today"
          kicker="01"
          title="Turnos"
          text="Tu lista de tareas del día: abre el turno y marca lo que vas haciendo."
          accent="var(--green)"
          status={turnosLine}
          alert={
            myTasks.length > 0
              ? `${myTasks.length} tarea${myTasks.length === 1 ? "" : "s"} asignada${myTasks.length === 1 ? "" : "s"} a ti`
              : null
          }
        />
        <Door
          href="/pos"
          kicker="02"
          title="Punto de venta"
          text="Toma pedidos, cobra y consulta los productos y sus recetas."
          accent="var(--red)"
          status="Caja y pedidos"
          alert={null}
        />
        <Door
          href="/turno/inventario"
          kicker="03"
          title="Inventario"
          text="Cuenta lo que hay al cierre, mira las existencias y avisa lo que se acabó."
          accent="var(--amber)"
          status={rutina.hecho ? `${NOMBRE_CONTEO[rutina.toca]} · enviado` : `${NOMBRE_CONTEO[rutina.toca]} · al cierre`}
          alert={null}
        />
      </div>
    </div>
  );
}

function Door({
  href,
  kicker,
  title,
  text,
  accent,
  status,
  alert,
}: {
  href: string;
  kicker: string;
  title: string;
  text: string;
  accent: string;
  status: string;
  alert: string | null;
}) {
  return (
    <Link
      href={href}
      className="bg-paper-lt active:bg-paper-dk relative flex flex-col overflow-hidden"
      style={{
        minHeight: 200,
        padding: "18px 18px 16px 24px",
        border: "1.5px solid var(--ink)",
        borderRadius: 6,
        textDecoration: "none",
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: accent }}
      />
      <span
        className="cmd-num text-muted"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        {kicker}
      </span>
      <span className="font-slab" style={{ fontSize: 30, lineHeight: 1.1, marginTop: 6 }}>
        {title}
        <span style={{ color: accent }}>.</span>
      </span>
      <span
        className="text-ink-2"
        style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8, maxWidth: 340 }}
      >
        {text}
      </span>

      <span className="mt-auto flex items-end justify-between gap-3" style={{ paddingTop: 18 }}>
        <span className="min-w-0">
          {alert ? (
            <span
              className="block"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 3 }}
            >
              ● {alert}
            </span>
          ) : null}
          <span
            className="text-muted block"
            style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {status}
          </span>
        </span>
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: 4,
            background: "var(--ink)",
            color: "var(--paper-lt)",
            fontSize: 20,
          }}
        >
          →
        </span>
      </span>
    </Link>
  );
}
