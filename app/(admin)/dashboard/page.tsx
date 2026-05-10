import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDashboardSummary } from "@/lib/db/reports";
import { todayInTz, formatTime } from "@/lib/utils";
import { CmdProgress, Stamp } from "@/components/comanda/primitives";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdmin();
  const today = todayInTz();
  const supabase = await createSupabaseServerClient();
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name");

  const summary = await getDashboardSummary(today);

  const byRestaurant = (restaurants ?? []).map((r) => ({
    ...r,
    shifts: summary.filter((s) => s.restaurant_id === r.id),
  }));

  // KPIs
  const totalSedes = (restaurants ?? []).length;
  const activeSedes = byRestaurant.filter((r) => r.shifts.length > 0).length;
  const totalTasks = summary.reduce((a, s) => a + s.total_tasks, 0);
  const doneTasks = summary.reduce((a, s) => a + s.completed_tasks, 0);
  const totalNovedades = summary.reduce((a, s) => a + s.novedad_count, 0);
  const globalPct =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div>
      {/* hero */}
      <header
        className="flex items-end justify-between"
        style={{
          padding: "24px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {formatDateLabel(today)}
          </div>
          <h1
            className="font-slab"
            style={{
              fontSize: 36,
              margin: "4px 0 0",
              letterSpacing: "-0.01em",
            }}
          >
            Operación de hoy
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Stamp rotate={-3} size={10}>
            en vivo · {formatTime(new Date())}
          </Stamp>
          {totalSedes === 0 ? (
            <Link href="/restaurants/new" className="cmd-btn red sm">
              Crear primer restaurante
            </Link>
          ) : (
            <button type="button" className="cmd-btn ghost sm">
              Exportar día
            </button>
          )}
        </div>
      </header>

      {/* KPI strip */}
      <div
        className="grid"
        style={{
          padding: "20px 32px",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        {[
          {
            label: "Sedes activas",
            val: String(activeSedes),
            sub: `/ ${totalSedes} totales`,
          },
          {
            label: "Avance global",
            val: `${globalPct}%`,
            sub: `${doneTasks} / ${totalTasks} tareas`,
          },
          {
            label: "Novedades hoy",
            val: String(totalNovedades),
            sub:
              totalNovedades > 0 ? "revisar bitácora" : "sin reportes nuevos",
          },
          {
            label: "Turnos abiertos",
            val: String(summary.filter((s) => s.status === "open").length),
            sub: `${summary.length} total hoy`,
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{ borderLeft: "2px solid var(--ink)", paddingLeft: 14 }}
          >
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {k.label}
            </div>
            <div
              className="cmd-num font-slab"
              style={{ fontSize: 36, lineHeight: 1, marginTop: 4 }}
            >
              {k.val}
            </div>
            <div
              className="text-muted"
              style={{ fontSize: 11, marginTop: 4 }}
            >
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "24px 32px" }}>
        <SectionLabel>Sedes — turnos en curso</SectionLabel>

        {byRestaurant.length === 0 ? (
          <div
            className="text-center cmd-paper-lt"
            style={{
              padding: "32px",
              border: "1.5px solid var(--ink)",
            }}
          >
            <p className="text-muted" style={{ fontSize: 13 }}>
              Aún no tienes restaurantes registrados. Crea el primero para
              empezar.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
          >
            {byRestaurant.map((r) => {
              const novedades = r.shifts.reduce(
                (a, s) => a + s.novedad_count,
                0,
              );
              const alert = r.shifts.some(
                (s) =>
                  s.status === "open" &&
                  s.pct < 60 &&
                  s.completed_tasks < s.total_tasks,
              );
              return (
                <article
                  key={r.id}
                  className="cmd-noise relative"
                  style={{
                    border: `1.5px solid ${alert ? "var(--red)" : "var(--ink)"}`,
                    background: "var(--paper-lt)",
                    padding: 16,
                    boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                  }}
                >
                  {alert ? (
                    <div style={{ position: "absolute", top: -10, right: 12 }}>
                      <Stamp rotate={6} size={9} color="var(--red)">
                        revisar
                      </Stamp>
                    </div>
                  ) : null}
                  <div
                    style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}
                  >
                    {r.name}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 10, letterSpacing: "0.06em" }}
                  >
                    Folio · DR-{r.id.slice(0, 4).toUpperCase()}
                  </div>

                  {r.shifts.length === 0 ? (
                    <div
                      className="text-muted"
                      style={{
                        marginTop: 14,
                        paddingTop: 10,
                        borderTop: "1px dashed var(--rule)",
                        fontSize: 11,
                      }}
                    >
                      No hay turnos generados hoy.
                    </div>
                  ) : (
                    r.shifts.map((s) => (
                      <Link
                        key={s.shift_id}
                        href={`/shifts/${s.shift_id}`}
                        className="block"
                        style={{
                          marginTop: 14,
                          paddingTop: 10,
                          borderTop: "1px dashed var(--rule)",
                        }}
                      >
                        <div className="flex justify-between mb-1.5">
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: "0.16em",
                              textTransform: "uppercase",
                              fontWeight: 600,
                            }}
                          >
                            Turno {s.shift === "day" ? "día" : "noche"}
                          </span>
                          <ShiftStatus status={s.status} pct={s.pct} />
                        </div>
                        <div className="flex items-center gap-2">
                          <CmdProgress
                            done={s.completed_tasks}
                            total={s.total_tasks}
                            color={
                              s.status === "closed"
                                ? "var(--green)"
                                : s.pct < 60
                                  ? "var(--amber)"
                                  : "var(--ink)"
                            }
                          />
                          <span
                            className="cmd-num text-muted ml-auto"
                            style={{ fontSize: 11 }}
                          >
                            {s.completed_tasks}/{s.total_tasks}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}

                  <div
                    className="flex justify-between items-center"
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: "1.5px solid var(--ink)",
                      fontSize: 11,
                    }}
                  >
                    <span>
                      <span className="text-muted">Novedades:</span>{" "}
                      <strong>{novedades}</strong>
                    </span>
                    <Link
                      href={`/restaurants/${r.id}`}
                      className="cmd-link"
                      style={{ fontSize: 11 }}
                    >
                      abrir →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Bitacora summary={summary} />
      </div>
    </div>
  );
}

function ShiftStatus({
  status,
  pct,
}: {
  status: "open" | "closed";
  pct: number;
}) {
  const color =
    status === "closed"
      ? "var(--green)"
      : pct < 60
        ? "var(--amber)"
        : "var(--ink)";
  const label =
    status === "closed" ? "CERRADO" : pct < 60 ? "CON RETRASO" : "EN CURSO";
  return (
    <span
      style={{ fontSize: 9, letterSpacing: "0.14em", color }}
      className="cmd-num"
    >
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted mb-3.5"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

async function Bitacora({
  summary,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
}) {
  const supabase = await createSupabaseServerClient();

  // Fetch the most recent novedades + completions for the audit log.
  const shiftIds = summary.map((s) => s.shift_id);
  if (shiftIds.length === 0) return null;

  const [{ data: novs }, { data: comps }, { data: shifts }] = await Promise.all([
    supabase
      .from("novedades")
      .select(
        "id, body, submitted_at, shift_instance_id, profiles:profiles!novedades_submitted_by_fkey(full_name)",
      )
      .in("shift_instance_id", shiftIds)
      .order("submitted_at", { ascending: false })
      .limit(8),
    supabase
      .from("task_completions")
      .select(
        "id, completed_at, photo_url, shift_instance_id, profiles:profiles!task_completions_completed_by_fkey(full_name), template_tasks:template_tasks!inner(title)",
      )
      .in("shift_instance_id", shiftIds)
      .order("completed_at", { ascending: false })
      .limit(8),
    supabase
      .from("shift_instances")
      .select("id, restaurants:restaurants(name)")
      .in("id", shiftIds),
  ]);

  const sedeOf: Record<string, string> = {};
  for (const s of shifts ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sedeOf[s.id] = (s as any).restaurants?.name ?? "";
  }

  type Entry = {
    t: string;
    sede: string;
    body: string;
    tag: "novedad" | "task" | "open" | "close";
    photo?: boolean;
  };

  const entries: Entry[] = [
    ...(novs ?? []).map(
      (n) =>
        ({
          t: n.submitted_at,
          sede: sedeOf[n.shift_instance_id] ?? "",
          body: `${
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (n as any).profiles?.full_name ?? "—"
          } envió novedad — "${n.body.slice(0, 60)}${n.body.length > 60 ? "…" : ""}"`,
          tag: "novedad" as const,
        }),
    ),
    ...(comps ?? []).map(
      (c) =>
        ({
          t: c.completed_at,
          sede: sedeOf[c.shift_instance_id] ?? "",
          body: `${
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c as any).profiles?.full_name ?? "—"
          } completó "${
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c as any).template_tasks?.title ?? "tarea"
          }"`,
          tag: "task" as const,
          photo: !!c.photo_url,
        }),
    ),
  ]
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, 8);

  if (entries.length === 0) return null;

  return (
    <div className="mt-7">
      <SectionLabel>Bitácora · audit log</SectionLabel>
      <div
        style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}
      >
        {entries.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-4"
            style={{
              padding: "8px 14px",
              borderBottom:
                i < entries.length - 1
                  ? "1px solid var(--rule-soft)"
                  : "none",
              fontSize: 12,
            }}
          >
            <span
              className="cmd-num text-muted"
              style={{ width: 44, flexShrink: 0 }}
            >
              {formatTime(e.t)}
            </span>
            <span
              className="text-muted shrink-0 hidden sm:inline-flex items-center"
              style={{
                fontSize: 9,
                padding: "2px 5px",
                border: "1px solid var(--rule)",
                letterSpacing: "0.14em",
              }}
            >
              {(e.sede.match(/[A-Z]/g)?.join("") ?? "—").slice(0, 3) || "—"}
            </span>
            <span className="flex-1 truncate">{e.body}</span>
            {e.photo ? (
              <span className="text-muted" style={{ fontSize: 10 }}>
                📷
              </span>
            ) : null}
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color:
                  e.tag === "novedad"
                    ? "var(--red)"
                    : e.tag === "close"
                      ? "var(--green)"
                      : "var(--muted)",
              }}
            >
              {e.tag.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDateLabel(yyyyMMdd: string) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
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
  return `${dayNames[dt.getUTCDay()]} ${d}·${month}`;
}

