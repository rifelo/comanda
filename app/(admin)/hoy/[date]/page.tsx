import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  const [{ supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

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
  const [view, novedadesRes, completionsRes, roster] = await Promise.all([
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
  const photos = (completionDetails ?? []).filter((c) => c.photo_url);
  const opener = view.opener?.full_name ?? "—";

  // Ad-hoc tasks (0015): drop cancelled, immediate (no due_time) first.
  const adHoc = view.adHocTasks
    .filter((t) => t.status !== "cancelled")
    .sort((a, b) => {
      if (!a.due_time && b.due_time) return -1;
      if (a.due_time && !b.due_time) return 1;
      return (a.due_time ?? "").localeCompare(b.due_time ?? "");
    });

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
                      {dueLabel ?? ""}
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
