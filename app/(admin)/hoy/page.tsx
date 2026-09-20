import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getDashboardSummary } from "@/lib/db/reports";
import { listShifts } from "@/lib/db/shifts";
import { listAssignments, isoMonday } from "@/lib/db/assignments";
import { listRoster } from "@/lib/db/roster";
import { puestoColor } from "@/lib/turno/colors";
import { llenarTurno } from "./actions";
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

  // The dashboard turnos are the SAME templates shown in Turnos · Resumen
  // (listShifts), overlaid with today's live instance status/progress + the
  // assigned person — so the two screens never disagree.
  const [shifts, assignments, roster] = await Promise.all([
    sede ? listShifts(sede.id) : Promise.resolve([]),
    sede ? listAssignments(sede.id, isoMonday(today)) : Promise.resolve([]),
    sede ? listRoster(sede.id) : Promise.resolve([]),
  ]);
  const sedeSummary = sede ? summary.filter((s) => s.restaurant_id === sede.id) : [];
  const summaryByTemplate = new Map(sedeSummary.map((s) => [s.template_id, s]));
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  // Mon-indexed day-of-week for today (0 = Monday … 6 = Sunday).
  const [yy, mm, dd] = today.split("-").map(Number);
  const dowToday = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
  const todayIdx = dowToday === 0 ? 6 : dowToday - 1;

  const shiftIds = sedeSummary.map((s) => s.shift_id);
  const [bitacora, { data: photoRows }] = await Promise.all([
    shiftIds.length ? loadBitacora(supabase, shiftIds) : Promise.resolve([] as BitacoraEntry[]),
    shiftIds.length
      ? supabase.from("task_completions").select("shift_instance_id, template_task_id, photo_url").in("shift_instance_id", shiftIds)
      : Promise.resolve({ data: [] as { shift_instance_id: string; template_task_id: string; photo_url: string | null }[] }),
  ]);
  // Evidence taken today: (shift, task) pairs whose completion carries a photo.
  const photoTaken = new Set((photoRows ?? []).filter((r) => r.photo_url).map((r) => `${r.shift_instance_id}:${r.template_task_id}`));
  const lastMovement = new Map<string, string>();
  for (const e of bitacora) {
    if (e.tag === "task" && !lastMovement.has(e.shiftId)) lastMovement.set(e.shiftId, e.body);
  }

  const cards = shifts.map((t) => {
    const s = summaryByTemplate.get(t.id);
    const isOpen = s?.status === "open";
    const closed = s?.status === "closed";
    const cell = assignments.find((a) => a.template_id === t.id && a.dia_idx === todayIdx && !a.puesto_id);
    const member = cell?.member_id ? rosterById.get(cell.member_id) ?? null : null;
    // Turnos with puestos: one line per puesto with today's person.
    const puestoLines = t.puestos.map((p) => {
      const pc = assignments.find((a) => a.template_id === t.id && a.dia_idx === todayIdx && a.puesto_id === p.puesto_id);
      const who = pc?.member_id ? rosterById.get(pc.member_id) ?? null : null;
      return { id: p.puesto_id, name: p.puesto.name, color: p.puesto.color, who: who?.name ?? null };
    });
    // Photo-evidence tasks of today's instance still without a photo.
    const photosPending = s ? t.tasks.filter((tk) => tk.requires_photo && !photoTaken.has(`${s.shift_id}:${tk.id}`)).length : 0;
    return {
      puestoLines,
      id: t.id,
      name: t.name,
      horario: `${t.inicio} – ${t.fin}`,
      isOpen,
      closed,
      statusLabel: isOpen ? "EN CURSO" : closed ? "CERRADO" : "POR ABRIR",
      hasData: !!s,
      shiftId: s?.shift_id ?? null,
      photosPending,
      reviewedAt: s?.reviewed_at ? formatTime(s.reviewed_at, tz) : null,
      reviewedBy: s?.reviewed_by_name ?? null,
      needsReview: closed && !s?.reviewed_at,
      done: s?.completed_tasks ?? 0,
      total: s?.total_tasks ?? t.tasks.length,
      novedades: s?.novedad_count ?? 0,
      folio: s ? `DR-${s.shift_id.slice(0, 4).toUpperCase()}` : "—",
      lastTask: s ? lastMovement.get(s.shift_id) ?? null : null,
      memberName: member?.name ?? null,
      memberInitials: member?.initials ?? null,
    };
  });

  const openCount = cards.filter((c) => c.isOpen).length;
  const totalTasks = cards.reduce((a, c) => a + c.total, 0);
  const doneTasks = cards.reduce((a, c) => a + c.done, 0);
  const globalPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const totalNovedades = cards.reduce((a, c) => a + c.novedades, 0);
  const photosPending = cards.reduce((a, c) => a + c.photosPending, 0);
  const porRevisar = cards.filter((c) => c.needsReview).length;

  const kpis = [
    {
      label: "Turnos en curso",
      val: String(openCount),
      sub: porRevisar > 0 ? `de ${cards.length} hoy · ${porRevisar} por revisar` : `de ${cards.length} hoy`,
    },
    { label: "Avance del día", val: `${globalPct}%`, sub: `${doneTasks} / ${totalTasks} tareas` },
    {
      label: "Novedades hoy",
      val: String(totalNovedades),
      sub: totalNovedades > 0 ? "revisar bitácora" : "sin reportes nuevos",
    },
    { label: "Fotos pendientes", val: String(photosPending), sub: photosPending > 0 ? "sin tomar hoy" : "todas tomadas" },
  ];

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
              key={c.id}
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
              <div className="flex justify-between items-start" style={{ gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="font-slab" style={{ fontSize: 20, lineHeight: 1.05, textTransform: "capitalize" }}>
                    {c.name}
                  </div>
                  <div className="cmd-num text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                    {c.horario}
                  </div>
                </div>
                <span
                  className="inline-flex items-center whitespace-nowrap"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    padding: "3px 7px",
                    gap: 5,
                    flexShrink: 0,
                    border: `1px solid ${c.isOpen ? "var(--green)" : "var(--rule)"}`,
                    color: c.isOpen ? "var(--green)" : "var(--muted)",
                  }}
                >
                  {c.isOpen ? (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                  ) : null}
                  {c.statusLabel}
                </span>
              </div>
              {c.reviewedAt ? (
                <div style={{ marginTop: 8 }}>
                  <Stamp rotate={-3} size={8.5} color="var(--green)">revisado · {c.reviewedBy ?? "admin"} · {c.reviewedAt}</Stamp>
                </div>
              ) : null}

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
                  {c.puestoLines.length > 0 ? (
                    <PuestoLines lines={c.puestoLines} />
                  ) : c.memberName ? (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 3 }}>{c.memberName}</div>
                      <div className="text-muted" style={{ fontSize: 10, marginTop: 1 }}>
                        {c.isOpen ? `${c.total} tareas hoy` : "asignado"}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{ fontSize: 12.5, fontWeight: 500, marginTop: 3, fontStyle: "italic", color: "var(--muted)" }}
                    >
                      — sin asignar —
                    </div>
                  )}
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
                className="flex justify-between items-center"
                style={{ marginTop: 13, paddingTop: 12, borderTop: "1.5px solid var(--ink)", gap: 8 }}
              >
                {c.statusLabel !== "CERRADO" ? <LlenarTurnoButton templateId={c.id} /> : <span />}
                {c.shiftId ? (
                  <Link
                    href={`/hoy/${today}?turno=${c.shiftId}`}
                    className={c.needsReview ? "cmd-btn red sm" : "cmd-btn ghost sm"}
                    style={{ textDecoration: "none", opacity: c.isOpen || c.needsReview ? 1 : 0.7 }}
                  >
                    {c.isOpen ? "abrir detalle →" : c.needsReview ? "revisar →" : c.closed ? "ver detalle →" : "ver plantilla →"}
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
            {cards.map((c) => (
              <article
                key={c.id}
                className="cmd-noise relative"
                style={{
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-lt)",
                  padding: 20,
                  boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                  opacity: c.hasData ? 1 : 0.82,
                }}
              >
                <div className="flex justify-between items-start" style={{ gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-slab" style={{ fontSize: 24, lineHeight: 1.05, textTransform: "capitalize" }}>
                      {c.name}
                    </div>
                    <div className="text-muted cmd-num" style={{ fontSize: 11, marginTop: 5 }}>
                      {c.horario}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center whitespace-nowrap"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      padding: "3px 7px",
                      gap: 5,
                      flexShrink: 0,
                      border: `1px solid ${c.isOpen ? "var(--green)" : "var(--rule)"}`,
                      color: c.isOpen ? "var(--green)" : "var(--muted)",
                      background: c.isOpen ? "rgba(31,138,91,.08)" : "transparent",
                    }}
                  >
                    {c.isOpen ? (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                    ) : null}
                    {c.statusLabel}
                  </span>
                </div>
                {c.reviewedAt ? (
                  <div style={{ marginTop: 10 }}>
                    <Stamp rotate={-3} size={9} color="var(--green)">revisado · {c.reviewedBy ?? "admin"} · {c.reviewedAt}</Stamp>
                  </div>
                ) : null}

                <div className="flex items-center" style={{ gap: 10, marginTop: 18 }}>
                  <CmdProgress done={c.done} total={c.total} color={c.isOpen ? "var(--ink)" : "var(--muted)"} />
                  <span className="cmd-num font-slab ml-auto" style={{ fontSize: 24, lineHeight: 1 }}>
                    {c.done}/{c.total}
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
                    {c.puestoLines.length > 0 ? (
                      <PuestoLines lines={c.puestoLines} />
                    ) : (
                      <>
                        <div
                          style={{
                            marginTop: 3,
                            fontWeight: 500,
                            fontStyle: c.memberName ? "normal" : "italic",
                            color: c.memberName ? "var(--ink)" : "var(--muted)",
                          }}
                        >
                          {c.memberName ?? "— sin asignar —"}
                        </div>
                        {c.memberName ? (
                          <div className="text-muted" style={{ marginTop: 1 }}>
                            {c.isOpen ? `${c.total} tareas hoy` : "asignado"}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Folio · Novedades
                    </div>
                    <div className="cmd-num" style={{ marginTop: 3 }}>
                      {c.folio} · <strong>{c.novedades}</strong>
                    </div>
                  </div>
                </div>

                {c.lastTask ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)" }}>
                    <div
                      className="text-muted"
                      style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}
                    >
                      Último movimiento
                    </div>
                    <div className="text-ink-2 flex" style={{ fontSize: 12, gap: 8 }}>
                      <span style={{ color: "var(--green)" }}>✓</span>
                      <span>{c.lastTask}</span>
                    </div>
                  </div>
                ) : null}

                <div
                  className="flex items-center justify-between"
                  style={{ marginTop: 16, paddingTop: 12, borderTop: "1.5px solid var(--ink)" }}
                >
                  <div className="flex items-center" style={{ gap: 14 }}>
                    {c.statusLabel !== "CERRADO" ? <LlenarTurnoButton templateId={c.id} /> : null}
                    {c.shiftId && c.isOpen ? (
                      <Link
                        href={`/hoy/${today}?turno=${c.shiftId}#asignar`}
                        className="cmd-link"
                        style={{ fontSize: 11, color: "var(--red)" }}
                      >
                        + asignar tarea
                      </Link>
                    ) : null}
                  </div>
                  {c.shiftId ? (
                    <Link
                      href={`/hoy/${today}?turno=${c.shiftId}`}
                      className="cmd-link"
                      style={{ fontSize: 11, color: c.needsReview ? "var(--red)" : undefined, fontWeight: c.needsReview ? 700 : undefined }}
                    >
                      {c.isOpen ? "abrir detalle →" : c.needsReview ? "revisar →" : "ver detalle →"}
                    </Link>
                  ) : (
                    <span className="cmd-link" style={{ fontSize: 11, opacity: 0.5 }}>
                      ver plantilla →
                    </span>
                  )}
                </div>
              </article>
            ))}
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

/** "Apertura · Jesús" lines for turnos with puestos (both layouts). */
function PuestoLines({ lines }: { lines: { id: string; name: string; color: string; who: string | null }[] }) {
  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
      {lines.map((l) => (
        <div key={l.id} className="flex items-center" style={{ gap: 6, fontSize: 11.5 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 7, background: puestoColor(l.color), flexShrink: 0 }} />
          <span style={{ color: "var(--muted)" }}>{l.name}</span>
          <span style={{ fontWeight: 500, fontStyle: l.who ? "normal" : "italic", color: l.who ? "var(--ink)" : "var(--muted)" }}>{l.who ?? "sin asignar"}</span>
        </div>
      ))}
    </div>
  );
}

/** Owner fills the turno himself: opens (creating if needed) today's checklist. */
function LlenarTurnoButton({ templateId }: { templateId: string }) {
  return (
    <form action={llenarTurno}>
      <input type="hidden" name="template_id" value={templateId} />
      <button type="submit" className="cmd-btn red sm" aria-label="Llenar turno">
        ✎ Llenar turno
      </button>
    </form>
  );
}
