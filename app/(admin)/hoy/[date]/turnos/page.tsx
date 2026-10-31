import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getShiftView } from "@/lib/db/shifts";
import { listRoster } from "@/lib/db/roster";
import { cn, formatTime, todayInTz } from "@/lib/utils";
import { fechaLarga } from "@/lib/numeros/hoy";
import { Button, Card, EmptyState, IconButton, PageHeader, Pill, ProgressBar } from "@/components/ui";
import { AsignarTareaForm } from "./asignar-tarea-form";
import { ReviewButton } from "./review-button";
import { CajaCard } from "./caja-card";
import { getCierreByInstance } from "@/lib/caja/cierres";
import { loadConteosPanel } from "@/lib/inventario/conteos";
import { listFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { ConteosCard } from "@/components/inventario/conteos-card";
import { FaltantesCard } from "@/components/inventario/faltantes-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turnos del día · Comanda" };

/**
 * Turnos del día (ex /hoy/[date]): one turno of the sede on `date` —
 * `?turno=<shift id>` picks it (chips switch between the day's turnos),
 * otherwise the open one. Inmediatas (assign while it runs), the checklist
 * with times and photos, novedades, the cash close, counts and faltantes,
 * and «Marcar revisado» once it is closed. One responsive layout: a column
 * on the phone, main + 380 px aside from lg.
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
    .select("id, status, template:checklist_templates(name)")
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
  // Admin review (0032): the reviewer is an org admin, so the roster has the name.
  const review = {
    status: view.shift.status,
    reviewedAt: view.shift.reviewed_at ? formatTime(view.shift.reviewed_at, sede.tz) : null,
    reviewedBy: view.shift.reviewed_by ? roster.find((r) => r.id === view.shift.reviewed_by)?.name ?? null : null,
  };

  // Cierre de caja: the card needs the window in the sede's clock.
  const hasCajaTask = view.tasks.some((t) => /arqueo|cierre de caja/i.test(t.title));
  const faltantes = profile.organization_id ? await listFaltantesAbiertos(supabase, profile.organization_id) : [];
  const conteos = profile.organization_id ? await loadConteosPanel(supabase, profile.organization_id, sede.tz) : null;
  const hayConteos = !!conteos && (conteos.pendientes.length > 0 || conteos.ayerSinConteo);
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

  const novs = novedades ?? [];
  const nombreTurno = (r: { template?: unknown }) => {
    const t = r.template as { name: string } | { name: string }[] | null | undefined;
    return (Array.isArray(t) ? t[0]?.name : t?.name) ?? "Turno";
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] pb-12">
      <PageHeader
        back={`/hoy${date === todayInTz(sede.tz) ? "" : `/${date}`}`}
        title={view.template.name}
        sub={`${fechaLarga(date)} · ${view.shift.opened_at ? `${view.opener?.full_name ? `${view.opener.full_name} abrió` : "abrió"} ${formatTime(view.shift.opened_at, sede.tz)}` : "sin abrir"}`}
        actions={
          <nav aria-label="Cambiar de día" className="flex items-center gap-2">
            <IconButton label="Día anterior" size="sm" href={`/hoy/${prevDate}/turnos`}>
              <ChevronLeft size={20} aria-hidden />
            </IconButton>
            <IconButton label="Día siguiente" size="sm" href={`/hoy/${nextDate}/turnos`}>
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          </nav>
        }
      />

      <div className="px-4 sm:px-7 flex flex-col gap-5">
        {(shiftRows ?? []).length > 1 ? (
          <nav aria-label="Turnos del día" className="ui-scroll-x flex gap-2">
            {(shiftRows ?? []).map((r) => (
              <Link
                key={r.id}
                href={`/hoy/${date}/turnos?turno=${r.id}`}
                aria-current={r.id === shiftId ? "page" : undefined}
                className={cn(
                  "shrink-0 inline-flex items-center h-11 px-4 rounded-full text-[15px] font-semibold no-underline",
                  r.id === shiftId ? "bg-strong text-on-strong" : "bg-surface border border-line text-text",
                )}
              >
                {nombreTurno(r)}
                {r.status === "open" ? <span aria-label="en curso" className="ml-2 size-2 rounded-full bg-ok" /> : null}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="flex flex-col gap-5 min-w-0">
            {/* estado + revisión */}
            <Card tight aria-label="Estado del turno">
              <div className="flex flex-wrap items-center gap-3">
                <Pill tone={view.shift.status === "open" ? "ok" : review.reviewedAt ? "ok" : "brand"}>
                  {view.shift.status === "open" ? "En curso" : review.reviewedAt ? "Revisado" : "Cerrado · por revisar"}
                </Pill>
                <span className="ui-num text-[15px] font-semibold">
                  {done}/{total} tareas
                </span>
                <ProgressBar value={total ? done / total : 0} label={`${done} de ${total} tareas`} className="flex-1 min-w-[120px]" />
              </div>
              <div className="flex flex-wrap gap-2">
                {view.shift.status !== "closed" ? (
                  <Button href={`/turno?turno=${shiftId}`} variant="ghost" size="sm" icon={<ClipboardList size={18} aria-hidden />}>
                    Llenar turno
                  </Button>
                ) : (
                  <ReviewButton shiftId={shiftId} status={review.status} reviewedAt={review.reviewedAt} reviewedBy={review.reviewedBy} />
                )}
              </div>
            </Card>

            {/* inmediatas */}
            <section id="asignar" aria-labelledby="inmediatas" className="flex flex-col gap-3 scroll-mt-4">
              <h2 id="inmediatas" className="ui-h2 m-0">
                Tareas inmediatas
              </h2>
              {view.shift.status !== "closed" ? <AsignarTareaForm shiftInstanceId={shiftId} roster={roster} /> : null}
              {adHoc.length === 0 ? (
                <p className="ui-sub m-0">Sin tareas inmediatas en este turno.</p>
              ) : (
                <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
                  {adHoc.map((t) => {
                    const isDone = t.status === "done";
                    return (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-3 border-b border-line last:border-b-0">
                        <Hecho done={isDone} />
                        <div className="flex-1 min-w-0">
                          <p className="ui-title m-0">{t.title}</p>
                          <p className="ui-sub m-0 text-[13px]">
                            {t.assigned_to ? (t.assignee_name ?? "Asignada") : "Para todos"}
                            {isDone && t.completed_at ? ` · ✓ ${formatTime(t.completed_at, sede.tz)}` : " · pendiente"}
                          </p>
                        </div>
                        {t.due_time ? <Pill>{t.due_time.slice(0, 5)}</Pill> : <Pill tone="late">Inmediata</Pill>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* tareas de la plantilla */}
            <section aria-labelledby="tareas" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="tareas" className="ui-h2 m-0">
                  Tareas
                </h2>
                <span className="ui-sub ui-num">
                  {done}/{total}
                </span>
              </div>
              <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
                {view.tasks.map((task) => {
                  const c = completionsByTask[task.id];
                  const isDone = !!c;
                  const due = task.due_time?.slice(0, 5);
                  const late = isDone ? lateMin(task.due_time, c.completed_at) : 0;
                  return (
                    <li key={task.id} className="flex items-start gap-3 px-4 py-3 border-b border-line last:border-b-0">
                      {due ? <span className="ui-num text-muted text-[14px] w-11 shrink-0 pt-0.5">{due}</span> : <span className="w-11 shrink-0" />}
                      <div className={cn("flex-1 min-w-0", !isDone && "opacity-80")}>
                        <p className="m-0 text-[16px] font-semibold leading-snug">{task.title}</p>
                        <p className="ui-sub m-0 text-[13px]">
                          {isDone
                            ? `✓ ${formatTime(c.completed_at, sede.tz)} · ${c.who}${c.note ? ` · «${c.note}»` : ""}`
                            : `${puestoOf(task) ? `${puestoOf(task)} · ` : ""}pendiente`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isDone && late > 0 ? <Pill tone="late">+{late} min</Pill> : null}
                        {task.requires_photo && c?.photo_url ? (
                          <a href={c.photo_url} target="_blank" rel="noreferrer" className="relative block size-12 rounded-btn overflow-hidden border border-line">
                            <Image src={c.photo_url} alt={task.title} fill sizes="48px" unoptimized className="object-cover" />
                          </a>
                        ) : task.requires_photo && !isDone ? (
                          <Pill tone="late">Foto</Pill>
                        ) : null}
                        <Hecho done={isDone} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* evidencia */}
            <section aria-labelledby="fotos" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="fotos" className="ui-h2 m-0">
                  Fotos
                </h2>
                <span className="ui-sub">{photos.length}</span>
              </div>
              {photos.length === 0 ? (
                <p className="ui-sub m-0">Sin fotos todavía.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {photos.map((p) => {
                    const tt = view.tasks.find((x) => x.id === p.template_task_id);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const who = ((p as any).profiles?.full_name as string | undefined) ?? "—";
                    return (
                      <figure key={p.id} className="m-0 rounded-card overflow-hidden border border-line bg-surface">
                        <a href={p.photo_url ?? "#"} target="_blank" rel="noreferrer" className="relative block w-full aspect-[4/3] bg-surface-2">
                          {p.photo_url ? <Image src={p.photo_url} alt={tt?.title ?? "Foto de evidencia"} fill sizes="(min-width: 1024px) 220px, 50vw" unoptimized className="object-cover" /> : null}
                        </a>
                        <figcaption className="px-3 py-2">
                          <p className="m-0 text-[13px] font-semibold truncate">{tt?.title ?? "Tarea"}</p>
                          <p className="m-0 text-[12.5px] text-muted ui-num">
                            {formatTime(p.completed_at, sede.tz)} · {who}
                          </p>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-5 min-w-0">
            {/* novedades */}
            <Card aria-labelledby="novedades">
              <h2 id="novedades" className="ui-title m-0">
                Novedades · {novs.length}
              </h2>
              {novs.length === 0 ? (
                <p className="ui-sub m-0">Sin novedades reportadas.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col">
                  {novs.map((n) => (
                    <li key={n.id} className="py-2.5 border-b border-line last:border-b-0">
                      <p className="m-0 text-[15px] leading-snug whitespace-pre-wrap">{n.body}</p>
                      <p className="m-0 mt-0.5 text-[13px] text-muted ui-num">
                        {formatTime(n.submitted_at, sede.tz)}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {` · ${(n as any).profiles?.full_name ?? "—"}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {cierre || hasCajaTask ? <CajaCard cierre={cierre} window={cajaWindow} hasCajaTask={hasCajaTask} compact /> : null}
            {conteos && hayConteos ? <ConteosCard panel={conteos} tz={sede.tz} compact /> : null}
            {faltantes.length > 0 ? <FaltantesCard items={faltantes} tz={sede.tz} compact /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hecho({ done }: { done: boolean }) {
  return (
    <span
      aria-label={done ? "Hecha" : "Pendiente"}
      className={cn(
        "size-7 shrink-0 rounded-full flex items-center justify-center",
        done ? "bg-ok text-white" : "border-2 border-line bg-surface",
      )}
    >
      {done ? <Check size={16} strokeWidth={3} aria-hidden /> : null}
    </span>
  );
}

function addDays(yyyyMMdd: string, delta: number): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function EmptyDetail({ date, sedeName }: { date: string; sedeName: string }) {
  return (
    <div className="mx-auto w-full max-w-[880px] pb-12">
      <PageHeader back="/hoy" title="Turnos" sub={`${fechaLarga(date)} · ${sedeName}`} />
      <div className="px-4 sm:px-7">
        <EmptyState
          title="No hay turnos registrados ese día"
          action={
            <Button href="/hoy" variant="ghost" size="sm">
              Volver a hoy
            </Button>
          }
        />
      </div>
    </div>
  );
}
