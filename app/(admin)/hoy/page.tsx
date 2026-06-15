import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getDashboardSummary } from "@/lib/db/reports";
import { todayInTz, formatTime, formatDateLabelEs } from "@/lib/utils";
import { CmdProgress, Stamp } from "@/components/comanda/primitives";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type BitacoraEntry = {
  t: string;
  body: string;
  tag: "novedad" | "task" | "open" | "close";
  photo?: boolean;
  shiftId: string;
};

/**
 * Hoy · Dashboard — single-sede "operación de hoy". Desktop (≥ md) keeps the
 * KPI strip + 2-col turno grid + bitácora; mobile (< md) reflows to a 2×2 KPI
 * grid, stacked turno cards, and a stacked bitácora log. Same data for both.
 */
export default async function HoyPage() {
  const [{ supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const summary = await getDashboardSummary(today);

  const sedeName = sede?.name ?? "Daniel's Burger";
  const sedeShifts = sede ? summary.filter((s) => s.restaurant_id === sede.id) : [];

  const turnoDia = sedeShifts[0] ?? null;
  const turnoNoche = sedeShifts[1] ?? null;
  const turnos = [
    { shift: "día" as const, horario: "10:30 – 14:30", data: turnoDia, defaultTotal: 11 },
    { shift: "noche" as const, horario: "14:30 – 02:30", data: turnoNoche, defaultTotal: 10 },
  ];

  const activeTurno =
    turnoDia?.status === "open" ? "Día" : turnoNoche?.status === "open" ? "Noche" : "—";
  const totalTasks = sedeShifts.reduce((a, s) => a + s.total_tasks, 0);
  const doneTasks = sedeShifts.reduce((a, s) => a + s.completed_tasks, 0);
  const globalPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const totalNovedades = sedeShifts.reduce((a, s) => a + s.novedad_count, 0);
  const photosPending = 1; // No DB field for "pending verified photos" yet; mirror the design's static count.

  const kpis = [
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
    { label: "Avance del día", val: `${globalPct}%`, sub: `${doneTasks} / ${totalTasks} tareas` },
    {
      label: "Novedades hoy",
      val: String(totalNovedades),
      sub: totalNovedades > 0 ? "revisar bitácora" : "sin reportes nuevos",
    },
    { label: "Fotos pendientes", val: String(photosPending), sub: "por verificar" },
  ];

  const shiftIds = sedeShifts.map((s) => s.shift_id);
  const bitacora = shiftIds.length ? await loadBitacora(supabase, shiftIds) : [];
  const lastMovement = new Map<string, string>();
  for (const e of bitacora) {
    if (e.tag === "task" && !lastMovement.has(e.shiftId)) lastMovement.set(e.shiftId, e.body);
  }

  const cards = turnos.map((t) => {
    const isOpen = t.data?.status === "open";
    const done = t.data?.completed_tasks ?? 0;
    const total = t.data?.total_tasks ?? t.defaultTotal;
    return {
      shift: t.shift,
      horario: t.horario,
      hasData: !!t.data,
      shiftId: t.data?.shift_id ?? null,
      isOpen,
      done,
      total,
      novedades: t.data?.novedad_count ?? 0,
      folio: t.data
        ? `DR-${t.data.shift_id.slice(0, 4).toUpperCase()}`
        : t.shift === "día"
          ? "DR-184"
          : "DR-185",
      lastTask: t.data ? lastMovement.get(t.data.shift_id) ?? null : null,
    };
  });

  return (
    <>
      {/* ── Mobile · operación en vivo ───────────────────────────── */}
      <div className="md:hidden" style={{ paddingBottom: 28 }}>
        <div className="flex items-center justify-between" style={{ padding: "12px 14px 4px" }}>
          <span
            className="text-muted"
            style={{ fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            {formatDateLabelEs(today, "long")}
          </span>
          <Stamp rotate={-3} size={9}>
            en vivo · {formatTime(new Date(), tz)}
          </Stamp>
        </div>

        {/* KPI 2×2 */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, padding: "8px 14px 0" }}>
          {kpis.map((k) => (
            <div
              key={k.label}
              style={{
                border: "1px solid var(--rule)",
                borderLeft: "2px solid var(--ink)",
                background: "var(--paper-lt)",
                padding: "11px 13px",
                borderRadius: 3,
              }}
            >
              <div
                className="text-muted"
                style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                {k.label}
              </div>
              <div className="cmd-num font-slab" style={{ fontSize: 30, lineHeight: 1, marginTop: 4 }}>
                {k.val}
              </div>
              <div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* turno cards */}
        <MobileSectionLabel right={`${cards.length} hoy`}>Turnos de hoy</MobileSectionLabel>
        <div style={{ padding: "0 14px" }}>
          {cards.map((c) => (
            <div
              key={c.shift}
              className="cmd-noise"
              style={{
                border: "1.5px solid var(--ink)",
                background: "var(--paper-lt)",
                padding: 16,
                marginBottom: 12,
                boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                opacity: c.hasData ? 1 : 0.9,
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>
                    Turno {c.shift}
                  </div>
                  <div className="cmd-num text-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                    {c.horario}
                  </div>
                </div>
                <span
                  className="inline-flex items-center"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    padding: "3px 7px",
                    gap: 5,
                    border: `1px solid ${c.isOpen ? "var(--green)" : "var(--rule)"}`,
                    color: c.isOpen ? "var(--green)" : "var(--muted)",
                  }}
                >
                  {c.isOpen ? (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                  ) : null}
                  {c.isOpen ? "EN CURSO" : "POR ABRIR"}
                </span>
              </div>

              <div className="flex items-center" style={{ gap: 10, marginTop: 14 }}>
                <CmdProgress done={c.done} total={c.total} color={c.isOpen ? "var(--ink)" : "var(--muted)"} />
                <span className="cmd-num font-slab" style={{ fontSize: 22, marginLeft: "auto", lineHeight: 1 }}>
                  {c.done}/{c.total}
                </span>
              </div>

              <div
                className="flex justify-between"
                style={{ gap: 12, marginTop: 14, paddingTop: 13, borderTop: "1px dashed var(--rule)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="text-muted" style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Personal
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 3 }}>
                    {c.isOpen ? "Mariana Castaño" : "— sin asignar —"}
                  </div>
                  {c.isOpen ? (
                    <div className="text-muted" style={{ fontSize: 10, marginTop: 1 }}>
                      Cajero · abrió 10:30
                    </div>
                  ) : null}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="text-muted" style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Folio · Nov.
                  </div>
                  <div className="cmd-num" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {c.folio} · <strong>{c.novedades}</strong>
                  </div>
                </div>
              </div>

              {c.lastTask ? (
                <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px dashed var(--rule)" }}>
                  <div
                    className="text-muted"
                    style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}
                  >
                    Último movimiento
                  </div>
                  <div className="text-ink-2" style={{ fontSize: 11.5, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--green)" }}>✓</span>
                    <span>{c.lastTask}</span>
                  </div>
                </div>
              ) : null}

              <div
                className="flex justify-end"
                style={{ marginTop: 13, paddingTop: 12, borderTop: "1.5px solid var(--ink)" }}
              >
                {c.shiftId ? (
                  <Link
                    href={`/hoy/${today}?turno=${c.shiftId}`}
                    className="cmd-btn ghost sm"
                    style={{ textDecoration: "none", opacity: c.isOpen ? 1 : 0.7 }}
                  >
                    {c.isOpen ? "abrir detalle →" : "ver plantilla →"}
                  </Link>
                ) : (
                  <span className="cmd-btn ghost sm" style={{ opacity: 0.5, cursor: "default" }}>
                    ver plantilla →
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* bitácora */}
        <MobileSectionLabel>Bitácora · audit log</MobileSectionLabel>
        <div style={{ padding: "0 14px" }}>
          {bitacora.length === 0 ? (
            <div
              className="text-muted"
              style={{ border: "1px dashed var(--rule)", padding: 20, textAlign: "center", fontSize: 12 }}
            >
              Sin movimientos todavía.
            </div>
          ) : (
            <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
              {bitacora.map((e, i) => (
                <div
                  key={i}
                  className="flex items-start"
                  style={{
                    gap: 11,
                    padding: "10px 12px",
                    borderBottom: i < bitacora.length - 1 ? "1px solid var(--rule-soft)" : "none",
                  }}
                >
                  <span className="cmd-num text-muted" style={{ fontSize: 11, width: 38, flexShrink: 0, paddingTop: 1 }}>
                    {formatTime(e.t)}
                  </span>
                  <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.35 }}>{e.body}</span>
                  {e.photo ? <span style={{ fontSize: 10 }}>📷</span> : null}
                  <span
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.12em",
                      flexShrink: 0,
                      paddingTop: 2,
                      color: e.tag === "novedad" ? "var(--red)" : e.tag === "close" ? "var(--green)" : "var(--muted)",
                    }}
                  >
                    {e.tag.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop (unchanged) ──────────────────────────────────── */}
      <div className="hidden md:block">
        <header
          className="flex items-end justify-between"
          style={{ padding: "24px 32px 16px", borderBottom: "1.5px solid var(--ink)" }}
        >
          <div>
            <div
              className="text-muted"
              style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}
            >
              {formatDateLabelEs(today, "long")} · {sedeName}
            </div>
            <h1 className="font-slab" style={{ fontSize: 36, margin: "4px 0 0", letterSpacing: "-0.01em" }}>
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
          {kpis.map((k) => (
            <div key={k.label} style={{ borderLeft: "2px solid var(--ink)", paddingLeft: 14 }}>
              <div
                className="text-muted"
                style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
              >
                {k.label}
              </div>
              <div className="cmd-num font-slab" style={{ fontSize: 36, lineHeight: 1, marginTop: 4 }}>
                {k.val}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "24px 32px" }}>
          <DesktopSectionLabel>Turnos de hoy</DesktopSectionLabel>
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
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
                      <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700 }}>
                        Turno {t.shift}
                      </div>
                      <div className="text-muted cmd-num" style={{ fontSize: 11, marginTop: 3 }}>
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

                  <div className="flex items-center" style={{ gap: 10, marginTop: 18 }}>
                    <CmdProgress done={done} total={total} color={isOpen ? "var(--ink)" : "var(--muted)"} />
                    <span className="cmd-num font-slab ml-auto" style={{ fontSize: 24, lineHeight: 1 }}>
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
                      <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
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
                      <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                        Folio · Novedades
                      </div>
                      <div className="cmd-num" style={{ marginTop: 3 }}>
                        {folio} · <strong>{novedades}</strong>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 16, paddingTop: 12, borderTop: "1.5px solid var(--ink)" }}
                  >
                    {t.data && isOpen ? (
                      <Link
                        href={`/hoy/${today}?turno=${t.data.shift_id}#asignar`}
                        className="cmd-link"
                        style={{ fontSize: 11, color: "var(--red)" }}
                      >
                        + asignar tarea
                      </Link>
                    ) : (
                      <span />
                    )}
                    {t.data ? (
                      <Link
                        href={`/hoy/${today}?turno=${t.data.shift_id}`}
                        className="cmd-link"
                        style={{ fontSize: 11 }}
                      >
                        {isOpen ? "abrir detalle →" : "ver plantilla →"}
                      </Link>
                    ) : (
                      <span className="cmd-link" style={{ fontSize: 11, opacity: 0.5 }}>
                        ver plantilla →
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {bitacora.length > 0 ? (
            <div className="mt-7">
              <DesktopSectionLabel>Bitácora · audit log</DesktopSectionLabel>
              <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
                {bitacora.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4"
                    style={{
                      padding: "8px 14px",
                      borderBottom: i < bitacora.length - 1 ? "1px solid var(--rule-soft)" : "none",
                      fontSize: 12,
                    }}
                  >
                    <span className="cmd-num text-muted" style={{ width: 44, flexShrink: 0 }}>
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
                          e.tag === "novedad" ? "var(--red)" : e.tag === "close" ? "var(--green)" : "var(--muted)",
                      }}
                    >
                      {e.tag.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function DesktopSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted mb-3.5"
      style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}
    >
      {children}
    </div>
  );
}

function MobileSectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8, padding: "16px 14px 8px" }}>
      <span
        className="text-muted"
        style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}
      >
        {children}
      </span>
      <span className="flex-1" style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }} />
      {right != null ? <span className="text-muted" style={{ fontSize: 10 }}>{right}</span> : null}
    </div>
  );
}

/** Last 8 bitácora entries (novedades + task completions) for the given shifts. */
async function loadBitacora(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  shiftIds: string[],
): Promise<BitacoraEntry[]> {
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

  const entries: BitacoraEntry[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((novs ?? []) as any[]).map((n) => ({
      t: n.submitted_at as string,
      body: `${n.profiles?.full_name ?? "—"} envió novedad — "${n.body.slice(0, 60)}${n.body.length > 60 ? "…" : ""}"`,
      tag: "novedad" as const,
      shiftId: n.shift_instance_id as string,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((comps ?? []) as any[]).map((c) => ({
      t: c.completed_at as string,
      body: `${c.profiles?.full_name ?? "—"} completó "${c.template_tasks?.title ?? "tarea"}"`,
      tag: "task" as const,
      photo: !!c.photo_url,
      shiftId: c.shift_instance_id as string,
    })),
  ]
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, 8);

  return entries;
}
