import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSede } from "@/lib/data/sede";
import { getDashboardSummary } from "@/lib/db/reports";
import { todayInTz, formatTime, formatDateLabelEs } from "@/lib/utils";
import { CmdProgress, Stamp } from "@/components/comanda/primitives";

export const dynamic = "force-dynamic";

/**
 * Hoy · Dashboard — single-sede "operación de hoy".
 *
 * Adapts the design's `AdminDashboard` (`comanda-admin.jsx:103-229`). The
 * prior per-sede grid (`byRestaurant.map`) is replaced by two turno cards
 * (día / noche). KPIs are reframed for a single sede.
 */
export default async function HoyPage() {
  const [{ supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const summary = await getDashboardSummary(today);

  const sedeName = sede?.name ?? "Daniel's Burger";
  const sedeShifts = sede
    ? summary.filter((s) => s.restaurant_id === sede.id)
    : [];

  // Match the design's two-turno layout. The first sede-shift becomes "día",
  // the second "noche"; missing slots show "POR ABRIR" with no progress.
  const turnoDia = sedeShifts[0] ?? null;
  const turnoNoche = sedeShifts[1] ?? null;
  const turnos = [
    {
      shift: "día" as const,
      horario: "10:30 – 14:30",
      data: turnoDia,
      defaultTotal: 11,
    },
    {
      shift: "noche" as const,
      horario: "14:30 – 02:30",
      data: turnoNoche,
      defaultTotal: 10,
    },
  ];

  // KPIs reframed for a single sede.
  const activeTurno =
    turnoDia?.status === "open"
      ? "Día"
      : turnoNoche?.status === "open"
        ? "Noche"
        : "—";
  const totalTasks = sedeShifts.reduce((a, s) => a + s.total_tasks, 0);
  const doneTasks = sedeShifts.reduce((a, s) => a + s.completed_tasks, 0);
  const globalPct =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const totalNovedades = sedeShifts.reduce((a, s) => a + s.novedad_count, 0);
  const photosPending = 1; // No DB field for "pending verified photos" yet; mirror the design's static count.

  return (
    <div>
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
            {formatDateLabelEs(today, "long")} · {sedeName}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 36, margin: "4px 0 0", letterSpacing: "-0.01em" }}
          >
            Operación de hoy
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Stamp rotate={-3} size={10}>
            en vivo · {formatTime(new Date(), tz)}
          </Stamp>
          <button type="button" className="cmd-btn ghost sm">
            Exportar día
          </button>
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
            label: "Turno activo",
            val: activeTurno,
            sub:
              activeTurno === "Día"
                ? "noche por abrir"
                : activeTurno === "Noche"
                  ? "día cerrado"
                  : "sin turnos abiertos",
          },
          {
            label: "Avance del día",
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
            label: "Fotos pendientes",
            val: String(photosPending),
            sub: "por verificar",
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
        <SectionLabel>Turnos de hoy</SectionLabel>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}
        >
          {turnos.map((t) => {
            const isOpen = t.data?.status === "open";
            const done = t.data?.completed_tasks ?? 0;
            const total = t.data?.total_tasks ?? t.defaultTotal;
            const novedades = t.data?.novedad_count ?? 0;
            const folio = t.data
              ? `DR-${t.data.shift_id.slice(0, 4).toUpperCase()}`
              : t.shift === "día"
                ? "DR-184"
                : "DR-185";

            return (
              <article
                key={t.shift}
                className="cmd-noise relative"
                style={{
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-lt)",
                  padding: 20,
                  boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                  opacity: t.data ? 1 : 0.82,
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Turno {t.shift}
                    </div>
                    <div
                      className="text-muted cmd-num"
                      style={{ fontSize: 11, marginTop: 3 }}
                    >
                      {t.horario}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      padding: "3px 7px",
                      border: `1px solid ${isOpen ? "var(--ink)" : "var(--rule)"}`,
                      color: isOpen ? "var(--ink)" : "var(--muted)",
                    }}
                  >
                    {isOpen ? "EN CURSO" : "POR ABRIR"}
                  </span>
                </div>

                <div
                  className="flex items-center"
                  style={{ gap: 10, marginTop: 18 }}
                >
                  <CmdProgress
                    done={done}
                    total={total}
                    color={isOpen ? "var(--ink)" : "var(--muted)"}
                  />
                  <span
                    className="cmd-num font-slab ml-auto"
                    style={{ fontSize: 24, lineHeight: 1 }}
                  >
                    {done}/{total}
                  </span>
                </div>

                <div
                  className="grid"
                  style={{
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px dashed var(--rule)",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    fontSize: 11,
                  }}
                >
                  <div>
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      Personal
                    </div>
                    <div style={{ marginTop: 3, fontWeight: 500 }}>
                      {isOpen ? "Mariana Castaño" : "— sin asignar —"}
                    </div>
                    {isOpen ? (
                      <div className="text-muted" style={{ marginTop: 1 }}>
                        Cajero · abrió 10:30
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      Folio · Novedades
                    </div>
                    <div className="cmd-num" style={{ marginTop: 3 }}>
                      {folio} · <strong>{novedades}</strong>
                    </div>
                  </div>
                </div>

                <div
                  className="flex justify-end"
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: "1.5px solid var(--ink)",
                  }}
                >
                  {t.data ? (
                    <Link
                      href={`/hoy/${today}?turno=${t.data.shift_id}`}
                      className="cmd-link"
                      style={{ fontSize: 11 }}
                    >
                      {isOpen ? "abrir detalle →" : "ver plantilla →"}
                    </Link>
                  ) : (
                    <span
                      className="cmd-link"
                      style={{ fontSize: 11, opacity: 0.5 }}
                    >
                      ver plantilla →
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <Bitacora summary={sedeShifts} />
      </div>
    </div>
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

/**
 * Single-sede Bitácora — same Supabase queries as the old multi-sede dashboard
 * but the per-row sede chip is dropped (single sede, redundant).
 */
async function Bitacora({
  summary,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
}) {
  const supabase = await createSupabaseServerClient();

  const shiftIds = summary.map((s) => s.shift_id);
  if (shiftIds.length === 0) return null;

  const [{ data: novs }, { data: comps }] = await Promise.all([
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
  ]);

  type Entry = {
    t: string;
    body: string;
    tag: "novedad" | "task" | "open" | "close";
    photo?: boolean;
  };

  const entries: Entry[] = [
    ...(novs ?? []).map(
      (n) =>
        ({
          t: n.submitted_at,
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
