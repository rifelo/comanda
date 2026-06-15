import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { listShifts } from "@/lib/db/shifts";
import { listAssignments, isoMonday } from "@/lib/db/assignments";
import { listRoster } from "@/lib/db/roster";
import { CmdProgress } from "@/components/comanda/primitives";
import { TurnosHeader } from "../../_components/turnos-header";
import { todayInTz, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Turnos · Resumen — definition of today's shifts.
 *
 * Mirrors `comanda-turnos.jsx` Resumen section. Live values:
 *   - status pill (EN CURSO / POR ABRIR) from today's shift_instance row
 *   - tiempo restante (server-time relative to `fin`)
 *   - última tarea (last completed for the shift_instance, by completed_at)
 *   - personal de hoy (weekly_assignments cell for (template_id, dow))
 */
export default async function TurnosResumenPage() {
  const [{ supabase }, sede] = await Promise.all([
    requireAdmin(),
    getActiveSede(),
  ]);
  if (!sede) {
    return (
      <div>
        <TurnosHeader kicker="DEFINICIÓN" title="Resumen de turnos" />
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
  // Mon-indexed day-of-week for today (0 = Monday … 6 = Sunday).
  const [y, m, d] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0 = Sunday
  const todayIdx = dow === 0 ? 6 : dow - 1;

  const [shifts, instancesRes, assignments, roster] = await Promise.all([
    listShifts(sede.id),
    supabase
      .from("shift_instances")
      .select("id, template_id, status, opened_at, closed_at, date")
      .eq("restaurant_id", sede.id)
      .eq("date", today),
    listAssignments(sede.id, weekStart),
    listRoster(sede.id),
  ]);

  const instances = instancesRes.data ?? [];
  const instanceByTemplate = new Map(
    instances.map((i) => [i.template_id as string, i]),
  );

  // Pull task completions for today's open shifts so we can render
  // "última tarea". Single round-trip across all of today's instances.
  const instanceIds = instances.map((i) => i.id as string);
  let lastCompletionByInstance = new Map<
    string,
    { template_task_id: string; completed_at: string }
  >();
  if (instanceIds.length > 0) {
    const { data: comps } = await supabase
      .from("task_completions")
      .select("template_task_id, completed_at, shift_instance_id")
      .in("shift_instance_id", instanceIds)
      .order("completed_at", { ascending: false });
    lastCompletionByInstance = new Map();
    for (const c of comps ?? []) {
      const k = c.shift_instance_id as string;
      if (!lastCompletionByInstance.has(k)) {
        lastCompletionByInstance.set(k, {
          template_task_id: c.template_task_id as string,
          completed_at: c.completed_at as string,
        });
      }
    }
  }

  // Roster lookup by profile id for the "personal de hoy" line.
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  // "12:34"-style live clock in the sede's timezone (server-rendered → no
  // hydration flicker; the design uses 12:34 as the demo clock).
  const nowLabel = formatTime(new Date(), sede.tz);
  const [nowH, nowM] = nowLabel.split(":").map(Number);
  const NOW_MIN = nowH * 60 + nowM;

  // Compact per-shift card data — reused by the mobile stacked-card view. The
  // desktop grid below computes its own locals inline (left untouched).
  const dur = (a: string, b: string) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    let mins = bh * 60 + bm - (ah * 60 + am);
    if (mins <= 0) mins += 1440;
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  };
  const cards = shifts.map((t) => {
    const inst = instanceByTemplate.get(t.id);
    const open = inst?.status === "open";
    const closed = inst?.status === "closed";
    const cell = assignments.find(
      (a) => a.template_id === t.id && a.dia_idx === todayIdx,
    );
    const member = cell?.member_id ? rosterById.get(cell.member_id) ?? null : null;
    return {
      id: t.id,
      name: t.name,
      inicio: t.inicio,
      fin: t.fin,
      duration: dur(t.inicio, t.fin),
      statusLabel: open ? "EN CURSO" : closed ? "CERRADO" : "POR ABRIR",
      open,
      total: t.tasks.length,
      photoCount: t.tasks.filter((tk) => tk.requires_photo).length,
      memberName: member?.name ?? null,
      memberInitials: member?.initials ?? null,
    };
  });

  return (
    <>
      {/* ── Mobile · stacked turno cards ─────────────────────────── */}
      <div className="md:hidden" style={{ padding: "8px 14px 28px" }}>
        <div
          className="flex items-center text-muted"
          style={{ gap: 8, padding: "12px 0 10px" }}
        >
          <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Turnos configurados
          </span>
          <span className="flex-1" style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }} />
          <span style={{ fontSize: 10 }}>{shifts.length} por día</span>
        </div>

        {shifts.length === 0 ? (
          <div
            style={{ border: "1px dashed var(--rule)", padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}
          >
            Aún no hay turnos configurados.
          </div>
        ) : (
          cards.map((c) => (
            <div
              key={c.id}
              className="cmd-noise relative"
              style={{
                border: "1.5px solid var(--ink)",
                background: "var(--paper-lt)",
                padding: 16,
                marginBottom: 14,
                boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-slab" style={{ fontSize: 24, lineHeight: 1, textTransform: "capitalize" }}>
                    {c.name}
                  </div>
                  <div className="cmd-num text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {c.inicio} – {c.fin} · {c.duration}
                  </div>
                </div>
                <span
                  className="inline-flex items-center whitespace-nowrap"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    padding: "4px 8px",
                    gap: 5,
                    border: `1px solid ${c.open ? "var(--green)" : "var(--rule)"}`,
                    color: c.open ? "var(--green)" : "var(--muted)",
                    background: c.open ? "rgba(31,138,91,.08)" : "transparent",
                  }}
                >
                  {c.open ? (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                  ) : null}
                  {c.statusLabel}
                </span>
              </div>

              <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px dashed var(--rule)" }}>
                <div
                  className="text-muted"
                  style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 7 }}
                >
                  Personal de hoy
                </div>
                {c.memberName ? (
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        border: "1.5px solid var(--ink)",
                        background: "var(--paper)",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {c.memberInitials}
                    </span>
                    <div className="min-w-0">
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.memberName}</div>
                      <div className="text-muted" style={{ fontSize: 10.5 }}>
                        {c.open ? `${c.total} tareas hoy` : "asignado"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-muted flex justify-between items-center"
                    style={{ fontSize: 12.5, fontStyle: "italic" }}
                  >
                    <span>— sin asignar —</span>
                    <Link href="/turnos/asignacion" className="cmd-link" style={{ fontSize: 11, fontStyle: "normal" }}>
                      asignar →
                    </Link>
                  </div>
                )}
              </div>

              {c.open ? (
                <div style={{ marginTop: 14 }}>
                  <CmdProgress done={0} total={c.total || 1} />
                </div>
              ) : null}

              <div
                className="flex justify-between items-center"
                style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)" }}
              >
                <span className="cmd-num text-muted" style={{ fontSize: 10.5 }}>
                  {c.total} tareas · {c.photoCount} con foto
                </span>
                <Link href={`/turnos/resumen/${c.id}/editar`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>
                  Editar turno →
                </Link>
              </div>
            </div>
          ))
        )}

        <Link
          href="/turnos/resumen/nuevo"
          className="cmd-btn"
          style={{ width: "100%", padding: 14, marginTop: 4, textDecoration: "none", textAlign: "center" }}
        >
          + Nuevo turno
        </Link>
      </div>

      {/* ── Desktop · two-column grid (unchanged) ────────────────── */}
      <div className="hidden md:block">
      <TurnosHeader
        kicker={`DEFINICIÓN · ${sede.name.toUpperCase()}`}
        title="Resumen de turnos"
      >
        <Link href="/turnos/resumen/nuevo" className="cmd-btn sm">
          + Nuevo turno
        </Link>
      </TurnosHeader>

      <div style={{ padding: "24px 32px" }}>
        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Turnos configurados · {shifts.length} por día
        </div>

        {shifts.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--rule)",
              padding: 32,
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            Aún no hay turnos configurados. Crea el primero con
            <Link href="/turnos/resumen/nuevo" className="cmd-link" style={{ marginLeft: 6 }}>
              + Nuevo turno
            </Link>
            .
          </div>
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}
          >
            {shifts.map((t) => {
              const inst = instanceByTemplate.get(t.id);
              const open = inst?.status === "open";
              const closed = inst?.status === "closed";
              const total = t.tasks.length;

              // "Personal de hoy": cell for today's day-of-week.
              const cell = assignments.find(
                (a) => a.template_id === t.id && a.dia_idx === todayIdx,
              );
              const member = cell?.member_id
                ? rosterById.get(cell.member_id) ?? null
                : null;

              // "Última tarea": most-recent completion for today's instance.
              const lastComp = inst
                ? lastCompletionByInstance.get(inst.id as string)
                : null;
              const lastTask =
                lastComp != null
                  ? t.tasks.find((tk) => tk.id === lastComp.template_task_id)
                  : null;

              // Tiempo restante (fin − now), wraps midnight. 30-min amber.
              const [fh, fm] = t.fin.split(":").map(Number);
              const finMin = fh * 60 + fm;
              let rem = finMin - NOW_MIN;
              if (rem < 0) rem += 24 * 60;
              const remLabel = `${Math.floor(rem / 60)}h ${String(rem % 60).padStart(2, "0")}m`;
              const remColor = rem <= 30 ? "var(--amber)" : "var(--ink)";

              const completed = closed ? total : 0;
              const completionsCount = inst
                ? // not strictly accurate (we only fetched the last per instance),
                  // but a reasonable lower-bound stand-in until /hoy completions
                  // join is wired in; the design's `done` number falls back here.
                  lastComp != null
                  ? Math.max(1, completed)
                  : completed
                : 0;
              void completionsCount;

              return (
                <article
                  key={t.id}
                  className="cmd-noise relative"
                  style={{
                    border: "1.5px solid var(--ink)",
                    background: "var(--paper-lt)",
                    padding: 22,
                    boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div
                        className="font-slab"
                        style={{ fontSize: 26, lineHeight: 1, textTransform: "capitalize" }}
                      >
                        {t.name}
                      </div>
                      <div
                        className="cmd-num text-muted"
                        style={{ fontSize: 12, marginTop: 6 }}
                      >
                        {t.inicio} – {t.fin}
                      </div>
                    </div>
                    <div className="flex flex-col items-end" style={{ gap: 8 }}>
                      <span
                        className="inline-flex items-center"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          padding: "3px 7px",
                          gap: 5,
                          border: `1px solid ${open ? "var(--green)" : "var(--rule)"}`,
                          color: open ? "var(--green)" : "var(--muted)",
                          background: open ? "rgba(31,138,91,.08)" : "transparent",
                        }}
                      >
                        {open ? (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "var(--green)",
                            }}
                          />
                        ) : null}
                        {open ? "EN CURSO" : closed ? "CERRADO" : "POR ABRIR"}
                      </span>
                      <Link
                        href={`/turnos/resumen/${t.id}/editar`}
                        className="cmd-link"
                        style={{ fontSize: 11 }}
                      >
                        editar turno →
                      </Link>
                    </div>
                  </div>

                  {/* metrics row */}
                  <div
                    className="grid"
                    style={{
                      marginTop: 18,
                      paddingTop: 16,
                      borderTop: "1px dashed var(--rule)",
                      gridTemplateColumns: "1.4fr 1fr",
                      gap: 14,
                    }}
                  >
                    <div>
                      <div
                        className="text-muted"
                        style={{
                          fontSize: 8,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                        }}
                      >
                        Última tarea completada
                      </div>
                      {lastTask ? (
                        <div
                          className="flex items-baseline"
                          style={{ marginTop: 5, gap: 8 }}
                        >
                          <span style={{ color: "var(--green)", fontSize: 13 }}>
                            ✓
                          </span>
                          <div className="min-w-0">
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {lastTask.title}
                            </div>
                            <div
                              className="cmd-num text-muted"
                              style={{ fontSize: 10, marginTop: 2 }}
                            >
                              completada · {formatTime(lastComp!.completed_at, sede.tz)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="text-muted"
                          style={{
                            fontSize: 12,
                            marginTop: 6,
                            fontStyle: "italic",
                          }}
                        >
                          turno no iniciado
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        paddingLeft: 14,
                        borderLeft: "1px solid var(--rule-soft)",
                      }}
                    >
                      <div
                        className="text-muted"
                        style={{
                          fontSize: 8,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                        }}
                      >
                        {open ? "Tiempo restante" : "Abre a las"}
                      </div>
                      <div
                        className="cmd-num font-slab"
                        style={{
                          fontSize: 24,
                          lineHeight: 1.1,
                          marginTop: 4,
                          color: open ? remColor : "var(--ink)",
                        }}
                      >
                        {open ? remLabel : t.inicio}
                      </div>
                      <div
                        className="text-muted"
                        style={{ fontSize: 9, marginTop: 3 }}
                      >
                        {open
                          ? "para cerrar turno"
                          : `${total} tareas por hacer`}
                      </div>
                    </div>
                  </div>

                  {/* personal de hoy */}
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 14,
                      borderTop: "1px dashed var(--rule)",
                    }}
                  >
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Personal de hoy
                    </div>
                    {member ? (
                      <div className="flex items-center" style={{ gap: 10 }}>
                        <span
                          className="inline-flex items-center justify-center"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            border: "1.5px solid var(--ink)",
                            background: "var(--paper)",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {member.initials}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {member.name}
                          </div>
                          <div className="text-muted" style={{ fontSize: 10 }}>
                            {open ? `${total} tareas hoy` : "asignado"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-muted flex justify-between items-center"
                        style={{ fontSize: 12 }}
                      >
                        <span>— sin asignar —</span>
                        <Link
                          href="/turnos/asignacion"
                          className="cmd-link"
                          style={{ fontSize: 11 }}
                        >
                          asignar →
                        </Link>
                      </div>
                    )}
                  </div>

                  {open ? (
                    <div style={{ marginTop: 16 }}>
                      <CmdProgress done={0} total={total || 1} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
