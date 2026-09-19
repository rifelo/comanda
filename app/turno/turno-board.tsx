"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PhotoCapture } from "@/components/photo-capture";
import { bucketAdHoc, bucketTasks } from "@/lib/turno/blocks";
import { assignedFor, groupTasksByPuesto, turnoProgress, ALL_KEY, type PuestoGroup } from "@/lib/turno/state";
import type { TurnoActor, TurnoBoardData, TurnoShift, TurnoPerson } from "@/lib/turno/server";
import type { AdHocTask, TemplateTask } from "@/lib/types";
import { nowInTz } from "@/lib/utils";
import { closeTurnoAs, completeTaskAs, setAdHocDoneAs, submitNovedadAs, uncompleteTaskAs, uploadTurnoPhoto } from "./actions";
import { initialsOf } from "./_components/avatar";
import { Checklist } from "./_components/checklist";
import { NovedadesSheet } from "./_components/novedades-sheet";
import { PuestoDeck } from "./_components/puesto-deck";
import { BlockNav, RailItem, TopBar, type BlockCounts } from "./_components/shell";

/**
 * Tablet-first (landscape ≥ 1024, degrades to portrait 768). Left rail =
 * today's turnos + a jump list of blocks; main pane = the checklist of the
 * selected turno (or the puesto deck first, when the turno is split into
 * puestos). The signed-in person (`actor`) is who every tick is recorded
 * under. Server data arrives as props; after every write we
 * `router.refresh()`, and a 15 s poll keeps the tablet in step with the
 * admin panel (inmediatas raised from /hoy show up on the next poll).
 */

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. */
  }
}

export function TurnoBoard({ data, actor, serverNow }: { data: TurnoBoardData; actor: TurnoActor; serverNow: string }) {
  const router = useRouter();
  const [shiftId, setShiftId] = React.useState<string | null>(() => {
    const open = data.turnos.find((t) => t.instance.status === "open") ?? data.turnos[0];
    return open?.instance.id ?? null;
  });
  const [puestoKey, setPuestoKey] = React.useState<string | null>(null);
  const [startedAnyway, setStartedAnyway] = React.useState<string[]>([]);
  const [photoFor, setPhotoFor] = React.useState<TemplateTask | null>(null);
  const [panel, setPanel] = React.useState<null | "novedades">(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Wall clock in the sede's tz. Seeded by the server so SSR and the first
  // client render agree; the tick recomputes it on the client afterwards.
  const [now, setNow] = React.useState(serverNow);

  React.useEffect(() => {
    queueMicrotask(() => setStartedAnyway(readSession("turno:started", [])));
  }, []);
  React.useEffect(() => {
    const tick = () => setNow(nowInTz(data.sede.tz));
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [data.sede.tz]);
  // Keep in step with the admin panel.
  React.useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = window.setInterval(poll, 15_000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", poll); };
  }, [router]);

  const shift = data.turnos.find((t) => t.instance.id === shiftId) ?? null;
  const rosterById = React.useMemo(() => new Map(data.roster.map((p) => [p.id, p])), [data.roster]);
  const me: TurnoPerson = rosterById.get(actor.profileId) ?? {
    id: actor.profileId,
    name: actor.fullName || "—",
    initials: initialsOf(actor.fullName),
    role: actor.role,
  };

  const keyOf = (s: TurnoShift, k: string) => `${s.instance.id}:${k}`;
  function assignedTo(s: TurnoShift, group: PuestoGroup): TurnoPerson | null {
    const id = assignedFor(data.assignments, s.template.id, data.todayIdx, group.key === ALL_KEY ? null : group.key);
    return id ? rosterById.get(id) ?? null : null;
  }
  function startAnyway(key: string) {
    setStartedAnyway((prev) => {
      const next = prev.includes(key) ? prev : [...prev, key];
      writeSession("turno:started", next);
      return next;
    });
  }

  async function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<boolean> {
    setBusy(label);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error);
    router.refresh();
    return r.ok;
  }

  const group = shift ? groupTasksByPuesto(shift.tasks, shift.puestos) : null;
  // A turno without puestos has no deck to choose from: open its list directly.
  const flat = !!group && group.groups.length === 1 && group.groups[0].key === ALL_KEY;
  const selectedGroup = group ? (puestoKey ? group.groups.find((g) => g.key === puestoKey) ?? null : flat ? group.groups[0] : null) : null;

  const counts: BlockCounts | null = React.useMemo(() => {
    if (!shift) return null;
    const tasks = selectedGroup ? (selectedGroup.key === ALL_KEY ? selectedGroup.tasks : [...selectedGroup.tasks, ...(group?.shared ?? [])]) : shift.tasks;
    const b = bucketTasks({ tasks, done: (t) => !!shift.completions[t.id], now, inicio: shift.template.inicio, fin: shift.template.fin });
    return { inmediatas: bucketAdHoc(shift.adHoc, now).pendientes.length, atrasadas: b.atrasadas.length, ahora: b.ahora.length, luego: b.luego.length + b.sin_hora.length, hechas: b.hechas.length };
  }, [shift, selectedGroup, group, now]);

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeShift(s: TurnoShift) {
    const prog = turnoProgress(s.tasks, s.completions);
    if (!prog.allDone && !window.confirm(`Faltan ${prog.total - prog.done} tareas. ¿Cerrar el turno igual?`)) return;
    void run("close", () => closeTurnoAs({ shift_instance_id: s.instance.id }));
  }

  function toggle(s: TurnoShift, task: TemplateTask) {
    const done = !!s.completions[task.id];
    if (!done && task.requires_photo) {
      setPhotoFor(task);
      return;
    }
    void run(task.id, () =>
      done
        ? uncompleteTaskAs({ shift_instance_id: s.instance.id, template_task_id: task.id })
        : completeTaskAs({ shift_instance_id: s.instance.id, template_task_id: task.id }),
    );
  }

  function toggleAdHoc(s: TurnoShift, task: AdHocTask, done: boolean) {
    void run(task.id, () => setAdHocDoneAs({ shift_instance_id: s.instance.id, id: task.id, done }));
  }

  return (
    <div className="cmd-paper" style={{ height: "100dvh", display: "grid", gridTemplateRows: "56px 1fr", fontFamily: "var(--font-mono)", color: "var(--ink)", overflow: "hidden" }}>
      <TopBar
        sedeName={data.sede.name}
        date={data.date}
        todayIdx={data.todayIdx}
        now={now}
        me={me}
        actor={actor}
        novedades={shift?.novedades.length ?? 0}
        onNovedades={() => setPanel("novedades")}
      />

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 0 }}>
        {/* rail (landscape) */}
        <aside className="hidden lg:flex" style={{ width: 300, flexShrink: 0, flexDirection: "column", borderRight: "1.5px solid var(--ink)", background: "var(--paper-lt)", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px 6px", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)" }}>Turnos de hoy</div>
          {data.turnos.length === 0 && <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>Ningún turno opera hoy.</div>}
          {data.turnos.map((t) => (
            <React.Fragment key={t.instance.id}>
              <RailItem t={t} active={t.instance.id === shiftId} onClick={() => { setShiftId(t.instance.id); setPuestoKey(null); }} />
              {t.instance.id === shiftId && counts && (flat || selectedGroup) && <BlockNav counts={counts} onJump={jump} />}
            </React.Fragment>
          ))}
        </aside>
        {/* strip (portrait) */}
        <div className="flex lg:hidden" style={{ gap: 8, padding: "10px 12px", overflowX: "auto", borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
          {data.turnos.map((t) => (
            <RailItem key={t.instance.id} t={t} compact active={t.instance.id === shiftId} onClick={() => { setShiftId(t.instance.id); setPuestoKey(null); }} />
          ))}
        </div>

        {/* main */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 24px 96px", position: "relative" }}>
          {counts && (flat || selectedGroup) && (
            <div className="lg:hidden" style={{ margin: "-8px -12px 8px" }}>
              <BlockNav counts={counts} onJump={jump} compact />
            </div>
          )}
          {error && <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", border: "1.5px solid var(--red)", color: "var(--red)", fontSize: 12, borderRadius: 4 }}>{error}</div>}
          {!shift && <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Ningún turno opera hoy en {data.sede.name}.</div>}
          {shift && group && !selectedGroup && (
            <PuestoDeck
              shift={shift}
              group={group}
              assignedTo={(g) => assignedTo(shift, g)}
              started={(g) => startedAnyway.includes(keyOf(shift, g.key))}
              onOpen={(g) => setPuestoKey(g.key)}
              onClose={() => closeShift(shift)}
              busy={busy === "close"}
            />
          )}
          {shift && group && selectedGroup && (
            <Checklist
              shift={shift}
              group={selectedGroup}
              shared={group.shared}
              flat={flat}
              me={me}
              actor={actor}
              now={now}
              tz={data.sede.tz}
              started={startedAnyway.includes(keyOf(shift, selectedGroup.key))}
              busy={busy}
              onBack={() => setPuestoKey(null)}
              onStartAnyway={() => startAnyway(keyOf(shift, selectedGroup.key))}
              onToggle={(task) => toggle(shift, task)}
              onToggleAdHoc={(task, done) => toggleAdHoc(shift, task, done)}
              onClose={() => closeShift(shift)}
            />
          )}
        </main>
      </div>

      {panel === "novedades" && shift && (
        <NovedadesSheet
          shift={shift}
          tz={data.sede.tz}
          busy={busy === "novedad"}
          error={error}
          onClose={() => setPanel(null)}
          onSubmit={(body) => run("novedad", () => submitNovedadAs({ shift_instance_id: shift.instance.id, body }))}
        />
      )}

      {photoFor && shift && (
        <PhotoCapture
          shiftInstanceId={shift.instance.id}
          taskId={photoFor.id}
          taskTitle={photoFor.title}
          restaurantId={data.sede.id}
          upload={async (blob) => {
            const fd = new FormData();
            fd.append("file", blob, "foto.jpg");
            fd.append("shift_instance_id", shift.instance.id);
            fd.append("template_task_id", photoFor.id);
            const r = await uploadTurnoPhoto(fd);
            if (!r.ok) throw new Error(r.error);
            return r.url;
          }}
          onUploaded={(url) => {
            const task = photoFor;
            setPhotoFor(null);
            void run(task.id, () => completeTaskAs({ shift_instance_id: shift.instance.id, template_task_id: task.id, photo_url: url }));
          }}
          onClose={() => setPhotoFor(null)}
        />
      )}
    </div>
  );
}
