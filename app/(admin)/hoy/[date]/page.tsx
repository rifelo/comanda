import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getShiftView } from "@/lib/db/shifts";
import { listRoster } from "@/lib/db/roster";
import {
  CmdCheck,
  CmdProgress,
  Folio,
  PhotoPlaceholder,
} from "@/components/comanda/primitives";
import { formatTime, formatDateLabelEs } from "@/lib/utils";
import { AsignarTareaForm } from "./asignar-tarea-form";
import { ReviewButton } from "./review-button";
import { CajaCard } from "./caja-card";
import { getCierreByInstance } from "@/lib/caja/cierres";
import { listFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { FaltantesCard } from "@/components/inventario/faltantes-card";

export const dynamic = "force-dynamic";

/**
 * Hoy · Detalle — adapts the design's `AdminDrilldown` (`comanda-admin.jsx:231-316`).
 *
 * Keyed by `date` (YYYY-MM-DD) instead of `shift_id`: we look up the active
 * sede's shift_instance for that date and render the same task list + evidencia
 * + novedades panes as the old `/shifts/[id]` page.
 */
export default async function HoyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ turno?: string }>;
}) {
  const [{ date }, { turno }] = await Promise.all([params, searchParams]);
  const [{ supabase, profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  if (!sede) {
    // No sede registered yet — surface a friendly 404 / empty state.
    notFound();
  }

  // All shifts for (sede, date). The dashboard card links here with
  // `?turno=<shift_id>`, so honor that selection first; otherwise prefer the
  // ongoing (open) turno, and finally fall back to the first by id.
  const { data: shiftRows } = await supabase
    .from("shift_instances")
    .select("id, status")
    .eq("restaurant_id", sede.id)
    .eq("date", date)
    .order("id");

  const shiftRow =
    (turno ? shiftRows?.find((r) => r.id === turno) : undefined) ??
    shiftRows?.find((r) => r.status === "open") ??
    shiftRows?.[0] ??
    null;

  if (!shiftRow) {
    return <EmptyDetail date={date} sedeName={sede.name} />;
  }

  const shiftId = shiftRow.id as string;
  const [view, novedadesRes, completionsRes, roster, cierre] = await Promise.all([
    getShiftView(shiftId),
    supabase
      .from("novedades")
      .select(
        "id, body, submitted_at, profiles:profiles!novedades_submitted_by_fkey(full_name)",
      )
      .eq("shift_instance_id", shiftId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("task_completions")
      .select(
        "id, template_task_id, completed_at, photo_url, note, profiles:profiles!task_completions_completed_by_fkey(full_name)",
      )
      .eq("shift_instance_id", shiftId),
    listRoster(sede.id),
    // Cash close of this turno (0037), if the team sent one.
    profile.organization_id ? getCierreByInstance(supabase, profile.organization_id, shiftId) : Promise.resolve(null),
  ]);

  if (!view) notFound();
  const { data: novedades } = novedadesRes;
  const { data: completionDetails } = completionsRes;

  const completionsByTask: Record<
    string,
    {
      completed_at: string;
      photo_url: string | null;
      note: string | null;
      who: string;
    }
  > = {};
  for (const c of completionDetails ?? []) {
    completionsByTask[c.template_task_id] = {
      completed_at: c.completed_at,
      photo_url: c.photo_url,
      note: c.note,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      who: (c as any).profiles?.full_name ?? "—",
    };
  }

  const total = view.tasks.length;
  const done = Object.keys(completionsByTask).length;
  // Puesto name per task (turnos with puestos); shared tasks get none.
  const puestoName = new Map(view.puestos.map((p) => [p.puesto_id, p.puesto.name]));
  const puestoOf = (t: { puesto_id: string | null }) => (t.puesto_id ? puestoName.get(t.puesto_id) ?? null : view.puestos.length ? "Compartida" : null);
  const photos = (completionDetails ?? []).filter((c) => c.photo_url);
  const opener = view.opener?.full_name ?? "—";
  // Admin review (0032): the reviewer is an org admin, so the roster has the name.
  const review = {
    status: view.shift.status,
    reviewedAt: view.shift.reviewed_at ? formatTime(view.shift.reviewed_at, sede.tz) : null,
    reviewedBy: view.shift.reviewed_by ? roster.find((r) => r.id === view.shift.reviewed_by)?.name ?? null : null,
  };

  // Cierre de caja: the card needs the window in the sede's clock.
  const hasCajaTask = view.tasks.some((t) => /arqueo|cierre de caja/i.test(t.title));
  const faltantes = profile.organization_id ? await listFaltantesAbiertos(supabase, profile.organization_id) : [];
  const cajaWindow = cierre ? `${formatTime(cierre.ventana_desde, sede.tz)} – ${formatTime(cierre.ventana_hasta, sede.tz)}` : null;

  // Ad-hoc tasks (0015): drop cancelled, immediate (no due_time) first.
  const adHoc = view.adHocTasks
    .filter((t) => t.status !== "cancelled")
    .sort((a, b) => {
      if (!a.due_time && b.due_time) return -1;
      if (a.due_time && !b.due_time) return 1;
      return (a.due_time ?? "").localeCompare(b.due_time ?? "");
    });

  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const lateMin = (due: string | null, completedAt: string | null) => {
    if (!due || !completedAt) return 0;
    const [dh, dm] = due.split(":").map(Number);
    const [ch, cm] = formatTime(completedAt, sede.tz).split(":").map(Number);
    return ch * 60 + cm - (dh * 60 + dm);
  };

  return (
    <>
      {/* ── Mobile · detalle de hoy ───────────────────────────── */}
      <div className="md:hidden" style={{ paddingBottom: 28 }}>
        {/* turno header */}
        <div style={{ padding: "14px 14px", borderBottom: "1px dashed var(--rule)" }}>
          <div className="text-muted" style={{ fontSize: 9.5, letterSpacing: "0.12em" }}>
            HOY · {formatDateLabelEs(date)} · {view.template.name.toUpperCase()} · DR-
            {shiftId.slice(0, 4).toUpperCase()}
          </div>
          <div className="font-slab" style={{ fontSize: 24, margin: "4px 0 0" }}>
            {sede.name}
          </div>
          <div className="text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
            {opener} ·{" "}
            {view.shift.opened_at ? `abrió ${formatTime(view.shift.opened_at)}` : "sin abrir"}
          </div>
          <div className="flex" style={{ gap: 8, marginTop: 12 }}>
            <Link href={`/hoy/${prevDate}`} className="cmd-btn ghost sm" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>
              ‹ día ant.
            </Link>
            <span className="cmd-btn ghost sm" style={{ flex: 1.4, textAlign: "center", cursor: "default" }}>
              {formatDateLabelEs(date)}
            </span>
            <Link href={`/hoy/${nextDate}`} className="cmd-btn ghost sm" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>
              día sig. ›
            </Link>
          </div>
          {view.shift.status !== "closed" && (
            <Link href={`/shift/${shiftId}`} className="cmd-btn red" style={{ display: "block", marginTop: 10, textAlign: "center", textDecoration: "none" }}>
              ✎ Llenar turno
            </Link>
          )}
          {view.shift.status === "closed" && (
            <div style={{ marginTop: 12 }}>
              <ReviewButton shiftId={shiftId} status={review.status} reviewedAt={review.reviewedAt} reviewedBy={review.reviewedBy} compact />
            </div>
          )}
        </div>

        {/* tareas inmediatas */}
        <HMLabel>Tareas inmediatas</HMLabel>
        <div style={{ padding: "0 14px" }}>
          <AsignarTareaForm shiftInstanceId={shiftId} roster={roster} />
          {adHoc.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Sin tareas asignadas en el turno.
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {adHoc.map((t) => {
                const isDone = t.status === "done";
                const whenLabel = t.due_time ? t.due_time.slice(0, 5) : "Inmediata";
                const whoLabel = t.assigned_to ? (t.assignee_name ?? "Asignada") : "Para todos";
                return (
                  <div
                    key={t.id}
                    className="flex"
                    style={{ gap: 10, padding: "10px 0", borderBottom: "1px solid var(--rule-soft)" }}
                  >
                    <CmdCheck checked={isDone} mode="check" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between" style={{ gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{t.title}</span>
                        <span
                          className="whitespace-nowrap"
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: t.due_time ? "var(--muted)" : "var(--red)",
                          }}
                        >
                          {whenLabel}
                        </span>
                      </div>
                      <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {whoLabel}
                        {isDone && t.completed_at ? ` · ✓ ${formatTime(t.completed_at)}` : " · pendiente"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* tareas template */}
        <HMLabel right={`${done}/${total}`}>Tareas · {view.template.name}</HMLabel>
        <div style={{ padding: "0 14px" }}>
          <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
            {view.tasks.map((task, i) => {
              const c = completionsByTask[task.id];
              const isDone = !!c;
              const dueLabel = task.due_time?.slice(0, 5);
              const late = isDone ? lateMin(task.due_time, c.completed_at) : 0;
              return (
                <div
                  key={task.id}
                  className="flex items-start"
                  style={{
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: i < view.tasks.length - 1 ? "1px solid var(--rule-soft)" : "none",
                    opacity: isDone ? 1 : 0.65,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: 18,
                      height: 18,
                      minWidth: 18,
                      marginTop: 1,
                      borderRadius: 4,
                      border: `1.5px solid ${isDone ? "var(--green)" : "var(--rule)"}`,
                      background: isDone ? "var(--green)" : "transparent",
                      color: "var(--paper-lt)",
                      fontSize: 11,
                    }}
                  >
                    {isDone ? "✓" : ""}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{task.title}</div>
                    {isDone ? (
                      <div
                        className="text-muted flex flex-wrap"
                        style={{ fontSize: 10, marginTop: 2, gap: 10 }}
                      >
                        <span>✓ {formatTime(c.completed_at)} · {c.who}</span>
                        {task.requires_photo && c.photo_url ? (
                          <span style={{ color: "var(--green)" }}>📷 verificada</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="cmd-num text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                        {puestoOf(task) ? `${puestoOf(task)} · ` : ""}{dueLabel ? `programada ${dueLabel}` : "pendiente"}
                      </div>
                    )}
                  </div>
                  {!isDone && task.requires_photo ? (
                    <span
                      className="self-start whitespace-nowrap"
                      style={{ border: "1px solid var(--red)", color: "var(--red)", padding: "2px 5px", fontSize: 8, letterSpacing: "0.12em" }}
                    >
                      FOTO PEND.
                    </span>
                  ) : null}
                  {isDone && late > 0 ? (
                    <span className="cmd-num self-start" style={{ fontSize: 9.5, color: "var(--amber)", flexShrink: 0 }}>
                      +{late}m
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* cierre de caja */}
        {(cierre || hasCajaTask) && (
          <>
            <HMLabel>Cierre de caja</HMLabel>
            <div style={{ padding: "0 14px" }}>
              <CajaCard cierre={cierre} window={cajaWindow} hasCajaTask={hasCajaTask} compact />
            </div>
          </>
        )}

        {/* faltantes reportados */}
        {faltantes.length > 0 && (
          <>
            <HMLabel right={faltantes.length}>Faltantes reportados</HMLabel>
            <div style={{ padding: "0 14px" }}>
              <FaltantesCard items={faltantes} tz={sede.tz} compact />
            </div>
          </>
        )}

        {/* evidencia */}
        <HMLabel right={`${photos.length} fotos`}>Evidencia fotográfica</HMLabel>
        {photos.length === 0 ? (
          <div className="text-muted" style={{ padding: "0 14px", fontSize: 12 }}>
            Sin fotos todavía.
          </div>
        ) : (
          <div className="grid" style={{ padding: "0 14px", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {photos.map((p) => {
              const tt = view.tasks.find((x) => x.id === p.template_task_id);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const who = ((p as any).profiles?.full_name ?? "—")
                .split(" ")
                .map((s: string) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <div key={p.id} style={{ border: "1px solid var(--ink)" }}>
                  {p.photo_url ? (
                    <a href={p.photo_url} target="_blank" rel="noreferrer" className="relative block" style={{ width: "100%", height: 84 }}>
                      <Image
                        src={p.photo_url}
                        alt={tt?.title ?? "Foto de evidencia"}
                        fill
                        sizes="50vw"
                        unoptimized
                        style={{ objectFit: "cover" }}
                      />
                    </a>
                  ) : (
                    <PhotoPlaceholder w="100%" h={84} label={tt?.title ?? ""} />
                  )}
                  <div
                    className="text-muted flex items-center justify-between"
                    style={{ padding: 5, fontSize: 8.5, letterSpacing: "0.12em" }}
                  >
                    <span className="cmd-num">{formatTime(p.completed_at)}</span>
                    <span>{who}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* novedades */}
        <HMLabel right={(novedades ?? []).length}>Novedades</HMLabel>
        <div style={{ padding: "0 14px" }}>
          {(novedades ?? []).length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12 }}>
              Sin novedades reportadas.
            </div>
          ) : (
            (novedades ?? []).map((n, idx) => (
              <div
                key={n.id}
                style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)", padding: 11, marginBottom: 8 }}
              >
                <div className="flex justify-between" style={{ marginBottom: 5 }}>
                  <Folio n={`N-${44 + idx}`} />
                  <span className="cmd-num text-muted" style={{ fontSize: 10 }}>
                    {formatTime(n.submitted_at)}
                  </span>
                </div>
                <p className="text-ink-2 whitespace-pre-wrap" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                  {n.body}
                </p>
                <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(n as any).profiles?.full_name ?? "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Desktop (unchanged) ──────────────────────────────── */}
      <div className="hidden md:block">
      <header
        className="flex items-end justify-between"
        style={{
          padding: "20px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            HOY · {formatDateLabelEs(date)} · TURNO · FOLIO DR-
            {shiftId.slice(0, 4).toUpperCase()}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 30, margin: "4px 0 0" }}
          >
            {sede.name}
          </h1>
          <div
            className="text-muted"
            style={{ fontSize: 12, marginTop: 6 }}
          >
            {opener} ·{" "}
            {view.shift.opened_at
              ? `abrió ${formatTime(view.shift.opened_at)}`
              : "sin abrir"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view.shift.status !== "closed" && (
            <Link
              href={`/shift/${shiftId}`}
              className="cmd-btn red sm"
              style={{ textDecoration: "none", marginRight: 12 }}
            >
              ✎ Llenar turno
            </Link>
          )}
          {view.shift.status === "closed" && (
            <span style={{ marginRight: 12 }}>
              <ReviewButton shiftId={shiftId} status={review.status} reviewedAt={review.reviewedAt} reviewedBy={review.reviewedBy} />
            </span>
          )}
          <span
            className="cmd-num"
            style={{ fontSize: 10, color: "var(--muted)" }}
          >
            {done}/{total}
          </span>
          <CmdProgress
            done={done}
            total={total}
            color={
              view.shift.status === "closed"
                ? "var(--green)"
                : "var(--ink)"
            }
          />
        </div>
      </header>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}
      >
        <section
          style={{
            padding: "24px 32px",
            borderRight: "1px dashed var(--rule)",
          }}
        >
          <div id="asignar" style={{ scrollMarginTop: 16 }}>
            <SectionLabel>Tareas inmediatas</SectionLabel>
            <AsignarTareaForm shiftInstanceId={shiftId} roster={roster} />
          </div>
          {adHoc.length === 0 ? (
            <div
              className="text-muted"
              style={{ fontSize: 12, marginBottom: 20 }}
            >
              Sin tareas asignadas en el turno.
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              {adHoc.map((t) => {
                const isDone = t.status === "done";
                const whenLabel = t.due_time
                  ? t.due_time.slice(0, 5)
                  : "Inmediata";
                const whoLabel = t.assigned_to
                  ? (t.assignee_name ?? "Asignada")
                  : "Para todos";
                return (
                  <div
                    key={t.id}
                    className="flex gap-3"
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid var(--rule-soft)",
                    }}
                  >
                    <CmdCheck checked={isDone} mode="check" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3">
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          {t.title}
                        </span>
                        <span
                          className="whitespace-nowrap"
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: t.due_time ? "var(--muted)" : "var(--red)",
                          }}
                        >
                          {whenLabel}
                        </span>
                      </div>
                      {t.instructions ? (
                        <div
                          className="text-muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                        >
                          {t.instructions}
                        </div>
                      ) : null}
                      <div
                        className="text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {whoLabel}
                        {isDone && t.completed_at
                          ? ` · ✓ ${formatTime(t.completed_at)}`
                          : " · pendiente"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <SectionLabel>Tareas · {view.template.name}</SectionLabel>
          {view.tasks.map((task) => {
            const c = completionsByTask[task.id];
            const dueLabel = task.due_time?.slice(0, 5);
            return (
              <div
                key={task.id}
                className="flex gap-3"
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule-soft)",
                }}
              >
                <CmdCheck checked={!!c} mode="check" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-3">
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {task.title}
                    </span>
                    <span
                      className="cmd-num text-muted whitespace-nowrap"
                      style={{ fontSize: 11 }}
                    >
                      {puestoOf(task) ? `${puestoOf(task)} · ` : ""}{dueLabel ?? ""}
                    </span>
                  </div>
                  {c ? (
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        display: "flex",
                        gap: 12,
                      }}
                    >
                      <span>
                        ✓ {formatTime(c.completed_at)} · {c.who}
                      </span>
                      {task.requires_photo && c.photo_url ? (
                        <span style={{ color: "var(--green)" }}>
                          📷 verificada
                        </span>
                      ) : null}
                    </div>
                  ) : task.due_time ? (
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: "var(--amber)",
                      }}
                    >
                      Pendiente · vence {dueLabel}
                    </div>
                  ) : (
                    <div
                      className="text-muted"
                      style={{ fontSize: 11, marginTop: 2 }}
                    >
                      Pendiente
                    </div>
                  )}
                </div>
                {task.requires_photo && c?.photo_url ? (
                  <a
                    href={c.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block"
                    style={{
                      width: 56,
                      height: 42,
                      border: "1px solid var(--ink)",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <Image
                      src={c.photo_url}
                      alt="Foto de evidencia"
                      width={56}
                      height={42}
                      sizes="56px"
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : task.requires_photo && !c ? (
                  <span
                    className="self-start"
                    style={{
                      border: "1px solid var(--red)",
                      color: "var(--red)",
                      padding: "2px 6px",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                    }}
                  >
                    FOTO PEND.
                  </span>
                ) : null}
              </div>
            );
          })}

          {(cierre || hasCajaTask) && (
            <div style={{ marginTop: 28 }}>
              <SectionLabel>Cierre de caja</SectionLabel>
              <CajaCard cierre={cierre} window={cajaWindow} hasCajaTask={hasCajaTask} />
            </div>
          )}
          {faltantes.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <SectionLabel>Faltantes reportados · {faltantes.length}</SectionLabel>
              <FaltantesCard items={faltantes} tz={sede.tz} />
            </div>
          )}
        </section>

        <section style={{ padding: "24px 32px" }}>
          <SectionLabel>
            Evidencia fotográfica · {photos.length}
          </SectionLabel>
          {photos.length === 0 ? (
            <div
              className="text-muted"
              style={{ fontSize: 12, marginBottom: 24 }}
            >
              Sin fotos todavía.
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
            >
              {photos.map((p) => {
                const tt = view.tasks.find(
                  (x) => x.id === p.template_task_id,
                );
                return (
                  <div
                    key={p.id}
                    style={{ border: "1px solid var(--ink)" }}
                  >
                    {p.photo_url ? (
                      <div
                        className="relative"
                        style={{ width: "100%", height: 92 }}
                      >
                        <Image
                          src={p.photo_url}
                          alt={tt?.title ?? "Foto de evidencia"}
                          fill
                          sizes="(max-width: 768px) 50vw, 240px"
                          unoptimized
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <PhotoPlaceholder w="100%" h={92} label={tt?.title ?? ""} />
                    )}
                    <div
                      className="text-muted flex items-center justify-between"
                      style={{
                        padding: 6,
                        fontSize: 9,
                        letterSpacing: "0.14em",
                      }}
                    >
                      <span className="cmd-num">
                        {formatTime(p.completed_at)}
                      </span>
                      <span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((p as any).profiles?.full_name ?? "—")
                          .split(" ")
                          .map((s: string) => s[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-7">
            <SectionLabel>
              Novedades · {(novedades ?? []).length}
            </SectionLabel>
            {(novedades ?? []).length === 0 ? (
              <div className="text-muted" style={{ fontSize: 12 }}>
                Sin novedades reportadas.
              </div>
            ) : (
              (novedades ?? []).map((n, idx) => (
                <div
                  key={n.id}
                  style={{
                    border: "1px solid var(--rule)",
                    background: "var(--paper-lt)",
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Folio n={`N-${44 + idx}`} />
                    <span
                      className="cmd-num text-muted"
                      style={{ fontSize: 10 }}
                    >
                      {formatTime(n.submitted_at)}
                    </span>
                  </div>
                  <p
                    className="text-ink-2 whitespace-pre-wrap"
                    style={{ fontSize: 12, lineHeight: 1.4 }}
                  >
                    {n.body}
                  </p>
                  <div
                    className="text-muted"
                    style={{ fontSize: 10, marginTop: 4 }}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(n as any).profiles?.full_name ?? "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      </div>
    </>
  );
}

/** YYYY-MM-DD shifted by `delta` days (UTC, so it never drifts). */
function addDays(yyyyMMdd: string, delta: number): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function HMLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
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

function EmptyDetail({ date, sedeName }: { date: string; sedeName: string }) {
  return (
    <div>
      <header
        className="flex items-end justify-between"
        style={{
          padding: "20px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            HOY · {formatDateLabelEs(date)}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 30, margin: "4px 0 0" }}
          >
            {sedeName}
          </h1>
        </div>
      </header>
      <div style={{ padding: "48px 32px" }}>
        <div
          className="cmd-paper-lt text-center"
          style={{ padding: 32, border: "1.5px solid var(--ink)" }}
        >
          <p className="text-muted" style={{ fontSize: 13 }}>
            No hay turnos registrados para {formatDateLabelEs(date)}.
          </p>
          <Link
            href="/hoy"
            className="cmd-link"
            style={{ fontSize: 12, marginTop: 12, display: "inline-block" }}
          >
            ← volver a hoy
          </Link>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted mb-3"
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
