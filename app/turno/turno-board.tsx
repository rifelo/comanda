"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CmdCheck, CmdProgress, Wordmark } from "@/components/comanda/primitives";
import { FotoBadge } from "@/components/comanda/task-bits";
import { PhotoCapture } from "@/components/photo-capture";
import { puestoColor } from "@/lib/turno/colors";
import { assignedFor, groupTasksByPuesto, puestoState, turnoProgress, ALL_KEY, type PuestoGroup, type PuestoStatus } from "@/lib/turno/state";
import type { TurnoBoardData, TurnoShift, TurnoPerson } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";
import { closeTurnoAs, completeTaskAs, uncompleteTaskAs, uploadTurnoPhoto } from "./actions";

/**
 * Tablet-first (landscape ≥ 1024, degrades to portrait 768). Left rail =
 * today's turnos; main pane = the puesto deck of the selected turno, or the
 * checklist of the selected puesto for the person who tapped their name.
 * Server data arrives as props; after every write we `router.refresh()`,
 * and a 15 s poll keeps two tablets in step.
 */

const STATUS_UI: Record<PuestoStatus, { label: string; color: string }> = {
  esperando: { label: "Esperando", color: "var(--amber)" },
  en_curso: { label: "En curso", color: "var(--green)" },
  listo: { label: "Listo", color: "var(--ink)" },
  por_iniciar: { label: "Por iniciar", color: "var(--muted)" },
  sin_tareas: { label: "Sin tareas", color: "var(--muted)" },
};
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dateLabel(yyyyMMdd: string, todayIdx: number): string {
  const [, m, d] = yyyyMMdd.split("-").map(Number);
  return `${DIAS[todayIdx]} ${d} · ${MESES[m - 1]}`;
}
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}
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

export function TurnoBoard({ data, mode }: { data: TurnoBoardData; mode: "device" | "user" }) {
  const router = useRouter();
  const [shiftId, setShiftId] = React.useState<string | null>(() => {
    const open = data.turnos.find((t) => t.instance.status === "open") ?? data.turnos[0];
    return open?.instance.id ?? null;
  });
  const [puestoKey, setPuestoKey] = React.useState<string | null>(null);
  const [personByKey, setPersonByKey] = React.useState<Record<string, string>>({});
  const [startedAnyway, setStartedAnyway] = React.useState<string[]>([]);
  const [picker, setPicker] = React.useState<{ key: string; title: string } | null>(null);
  const [photoFor, setPhotoFor] = React.useState<TemplateTask | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState("--:--");

  // Per-tablet memory of who is working which puesto (survives refreshes).
  React.useEffect(() => {
    // Read after mount (sessionStorage is client-only); deferred to a
    // microtask so the effect body itself doesn't set state.
    const load = () => {
      setPersonByKey(readSession("turno:people", {}));
      setStartedAnyway(readSession("turno:started", []));
    };
    queueMicrotask(load);
  }, []);
  React.useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  // Keep in step with the other tablet / the admin.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [router]);

  const shift = data.turnos.find((t) => t.instance.id === shiftId) ?? null;
  const rosterById = React.useMemo(() => new Map(data.roster.map((p) => [p.id, p])), [data.roster]);

  const keyOf = (s: TurnoShift, k: string) => `${s.instance.id}:${k}`;
  function personFor(s: TurnoShift, group: PuestoGroup): TurnoPerson | null {
    const chosen = personByKey[keyOf(s, group.key)];
    const id = chosen ?? assignedFor(data.assignments, s.template.id, data.todayIdx, group.key === ALL_KEY ? null : group.key);
    return id ? rosterById.get(id) ?? null : null;
  }
  function setPerson(key: string, personId: string) {
    setPersonByKey((prev) => {
      const next = { ...prev, [key]: personId };
      writeSession("turno:people", next);
      return next;
    });
  }
  function startAnyway(key: string) {
    setStartedAnyway((prev) => {
      const next = prev.includes(key) ? prev : [...prev, key];
      writeSession("turno:started", next);
      return next;
    });
  }

  async function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(label);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error);
    router.refresh();
  }

  function openPuesto(s: TurnoShift, group: PuestoGroup) {
    const key = keyOf(s, group.key);
    if (!personFor(s, group)) {
      setPicker({ key, title: group.puesto?.name ?? s.template.name });
      return;
    }
    setPuestoKey(group.key);
  }

  const group = shift ? groupTasksByPuesto(shift.tasks, shift.puestos) : null;
  const selectedGroup = group && puestoKey ? group.groups.find((g) => g.key === puestoKey) ?? null : null;

  return (
    <div className="cmd-paper" style={{ height: "100dvh", display: "grid", gridTemplateRows: "56px 1fr", fontFamily: "var(--font-mono)", color: "var(--ink)", overflow: "hidden" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)" }}>
        <Wordmark size={22} />
        <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
          {data.sede.name} · {dateLabel(data.date, data.todayIdx)}
        </span>
        <span className="cmd-num" style={{ marginLeft: "auto", fontSize: 18, fontWeight: 700 }}>{clock}</span>
        <Link href="/pos" style={linkChip}>POS →</Link>
        {mode === "user" && <Link href="/" style={linkChip}>← Panel</Link>}
      </div>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 0 }}>
        {/* rail (landscape) */}
        <aside className="hidden lg:flex" style={{ width: 300, flexShrink: 0, flexDirection: "column", borderRight: "1.5px solid var(--ink)", background: "var(--paper-lt)", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px 6px", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)" }}>Turnos de hoy</div>
          {data.turnos.length === 0 && <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>Ningún turno opera hoy.</div>}
          {data.turnos.map((t) => (
            <RailItem key={t.instance.id} t={t} active={t.instance.id === shiftId} onClick={() => { setShiftId(t.instance.id); setPuestoKey(null); }} />
          ))}
        </aside>
        {/* strip (portrait) */}
        <div className="flex lg:hidden" style={{ gap: 8, padding: "10px 12px", overflowX: "auto", borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
          {data.turnos.map((t) => (
            <RailItem key={t.instance.id} t={t} compact active={t.instance.id === shiftId} onClick={() => { setShiftId(t.instance.id); setPuestoKey(null); }} />
          ))}
        </div>

        {/* main */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px 96px", position: "relative" }}>
          {error && <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", border: "1.5px solid var(--red)", color: "var(--red)", fontSize: 12, borderRadius: 4 }}>{error}</div>}
          {!shift && <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Ningún turno opera hoy en {data.sede.name}.</div>}
          {shift && group && !selectedGroup && (
            <PuestoDeck
              shift={shift}
              group={group}
              personFor={(g) => personFor(shift, g)}
              started={(g) => startedAnyway.includes(keyOf(shift, g.key))}
              onOpen={(g) => openPuesto(shift, g)}
              onPick={(g) => setPicker({ key: keyOf(shift, g.key), title: g.puesto?.name ?? shift.template.name })}
              onClose={() => {
                const who = data.roster.find((p) => Object.values(personByKey).includes(p.id)) ?? data.roster[0];
                if (!who) return;
                const prog = turnoProgress(shift.tasks, shift.completions);
                if (!prog.allDone && !window.confirm(`Faltan ${prog.total - prog.done} tareas. ¿Cerrar el turno igual?`)) return;
                void run("close", () => closeTurnoAs({ shift_instance_id: shift.instance.id, person_id: who.id }));
              }}
              busy={busy === "close"}
            />
          )}
          {shift && group && selectedGroup && (
            <PuestoChecklist
              shift={shift}
              group={selectedGroup}
              shared={group.shared}
              person={personFor(shift, selectedGroup)}
              started={startedAnyway.includes(keyOf(shift, selectedGroup.key))}
              rosterById={rosterById}
              busy={busy}
              onBack={() => setPuestoKey(null)}
              onChangePerson={() => setPicker({ key: keyOf(shift, selectedGroup.key), title: selectedGroup.puesto?.name ?? shift.template.name })}
              onStartAnyway={() => startAnyway(keyOf(shift, selectedGroup.key))}
              onToggle={(task) => {
                const person = personFor(shift, selectedGroup);
                if (!person) return;
                const done = !!shift.completions[task.id];
                if (!done && task.requires_photo) {
                  setPhotoFor(task);
                  return;
                }
                void run(task.id, () =>
                  done
                    ? uncompleteTaskAs({ shift_instance_id: shift.instance.id, template_task_id: task.id, person_id: person.id })
                    : completeTaskAs({ shift_instance_id: shift.instance.id, template_task_id: task.id, person_id: person.id }),
                );
              }}
            />
          )}
        </main>
      </div>

      {picker && (
        <PersonPicker
          title={picker.title}
          roster={data.roster}
          current={personByKey[picker.key] ?? null}
          onPick={(id) => {
            setPerson(picker.key, id);
            const k = picker.key.split(":")[1];
            setPicker(null);
            setPuestoKey(k);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {photoFor && shift && selectedGroup && (
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
            const person = personFor(shift, selectedGroup);
            const task = photoFor;
            setPhotoFor(null);
            if (!person) return;
            void run(task.id, () => completeTaskAs({ shift_instance_id: shift.instance.id, template_task_id: task.id, person_id: person.id, photo_url: url }));
          }}
          onClose={() => setPhotoFor(null)}
        />
      )}
    </div>
  );
}

const linkChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink-2)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none" };

function RailItem({ t, active, compact, onClick }: { t: TurnoShift; active: boolean; compact?: boolean; onClick: () => void }) {
  const prog = turnoProgress(t.tasks, t.completions);
  const closed = t.instance.status === "closed";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        textAlign: "left", cursor: "pointer", fontFamily: "var(--font-mono)", color: active ? "var(--paper-lt)" : "var(--ink)",
        background: active ? "var(--ink)" : "transparent", border: compact ? "1.5px solid var(--rule)" : "none", borderBottom: compact ? undefined : "1px solid var(--rule-soft)",
        padding: compact ? "8px 12px" : "12px 16px", minWidth: compact ? 180 : undefined, borderRadius: compact ? 6 : 0, flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="font-slab" style={{ fontSize: compact ? 15 : 18, lineHeight: 1.1 }}>{t.template.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 8.5, letterSpacing: ".12em", textTransform: "uppercase", border: `1px solid ${closed ? "var(--muted)" : active ? "var(--paper-lt)" : "var(--green)"}`, color: closed ? "var(--muted)" : active ? "var(--paper-lt)" : "var(--green)", padding: "2px 5px", borderRadius: 2 }}>
          {closed ? "cerrado" : "abierto"}
        </span>
      </div>
      <div className="cmd-num" style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>{t.template.inicio} – {t.template.fin} · {prog.done}/{prog.total}</div>
      {!compact && <div style={{ marginTop: 6 }}><CmdProgress done={prog.done} total={prog.total} color={active ? "var(--paper-lt)" : "var(--ink)"} /></div>}
    </button>
  );
}

function PuestoDeck({ shift, group, personFor, started, onOpen, onPick, onClose, busy }: {
  shift: TurnoShift;
  group: { groups: PuestoGroup[]; shared: TemplateTask[] };
  personFor: (g: PuestoGroup) => TurnoPerson | null;
  started: (g: PuestoGroup) => boolean;
  onOpen: (g: PuestoGroup) => void;
  onPick: (g: PuestoGroup) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const prog = turnoProgress(shift.tasks, shift.completions);
  const closed = shift.instance.status === "closed";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="font-slab" style={{ fontSize: 28 }}>{shift.template.name}<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{shift.template.inicio} – {shift.template.fin}</span>
        <span className="cmd-num" style={{ marginLeft: "auto", fontSize: 12 }}>{prog.done}/{prog.total} tareas · {prog.pct}%</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {group.groups.map((g) => {
          const st = puestoState({ tasks: g.tasks, completions: shift.completions, waitsForTaskId: g.waitsForTaskId, allTasks: shift.tasks, startedAnyway: started(g) });
          const ui = STATUS_UI[st.status];
          const person = personFor(g);
          const color = puestoColor(g.puesto?.color ?? "ink");
          return (
            <div key={g.key} role="group" aria-label={`Puesto ${g.puesto?.name ?? shift.template.name}`} style={{ minHeight: 168, border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", boxShadow: `inset 5px 0 0 ${color}`, padding: "14px 16px 14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="font-slab" style={{ fontSize: 22, lineHeight: 1 }}>{g.puesto?.name ?? "Checklist"}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: ui.color, border: `1px solid ${ui.color}`, padding: "3px 7px", borderRadius: 3 }}>{ui.label}</span>
              </div>
              {person ? (
                <button type="button" onClick={() => onPick(g)} style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", color: "var(--ink)", textAlign: "left" }}>
                  <Avatar initials={person.initials} size={40} />
                  <span>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{person.name}</span>
                    <span style={{ display: "block", fontSize: 10, color: "var(--muted)" }}>cambiar persona</span>
                  </span>
                </button>
              ) : (
                <button type="button" onClick={() => onPick(g)} style={{ height: 40, border: "1.5px solid var(--red)", color: "var(--red)", background: "transparent", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
                  Elegir persona
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}><CmdProgress done={st.done} total={st.total} color={color} /></div>
                <span className="cmd-num" style={{ fontSize: 12 }}>{st.done}/{st.total}</span>
              </div>
              {st.gate && (
                <div style={{ fontSize: 11, color: st.gate.done ? "var(--muted)" : "var(--amber)" }}>
                  {st.gate.done ? "✓ " : "espera: "}{st.gate.title}
                </div>
              )}
              <button type="button" onClick={() => onOpen(g)} className="cmd-btn" style={{ marginTop: "auto", height: 44, fontSize: 12 }} disabled={closed}>
                {st.status === "listo" ? "Ver lista" : "Abrir lista →"}
              </button>
            </div>
          );
        })}
      </div>
      {group.shared.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)" }}>
          {group.shared.length} tarea{group.shared.length === 1 ? "" : "s"} compartida{group.shared.length === 1 ? "" : "s"} aparecen al final de cada lista.
        </div>
      )}
      <div style={{ position: "sticky", bottom: 0, marginTop: 24, paddingTop: 12, background: "linear-gradient(transparent, var(--paper) 30%)" }}>
        <button type="button" onClick={onClose} disabled={closed || busy} className={prog.allDone ? "cmd-btn red" : "cmd-btn ghost"} style={{ width: "100%", height: 60, fontSize: 14 }}>
          {closed ? "Turno cerrado" : busy ? "Cerrando…" : prog.allDone ? "Cerrar turno · entregar →" : `Cerrar turno · faltan ${prog.total - prog.done}`}
        </button>
      </div>
    </div>
  );
}

function PuestoChecklist({ shift, group, shared, person, started, rosterById, busy, onBack, onChangePerson, onStartAnyway, onToggle }: {
  shift: TurnoShift;
  group: PuestoGroup;
  shared: TemplateTask[];
  person: TurnoPerson | null;
  started: boolean;
  rosterById: Map<string, TurnoPerson>;
  busy: string | null;
  onBack: () => void;
  onChangePerson: () => void;
  onStartAnyway: () => void;
  onToggle: (t: TemplateTask) => void;
}) {
  const st = puestoState({ tasks: group.tasks, completions: shift.completions, waitsForTaskId: group.waitsForTaskId, allTasks: shift.tasks, startedAnyway: started });
  const gateWho = st.gate && !st.gate.done ? (() => {
    const gateTask = shift.tasks.find((t) => t.id === st.gate!.taskId);
    const owner = shift.puestos.find((p) => p.puesto_id === gateTask?.puesto_id)?.puesto.name;
    return owner ?? null;
  })() : null;
  // group by hour bucket like the staff board
  const buckets = new Map<string, TemplateTask[]>();
  for (const t of group.tasks) {
    const k = t.due_time ? hhmm(t.due_time) : "Sin hora";
    buckets.set(k, [...(buckets.get(k) ?? []), t]);
  }
  const keys = [...buckets.keys()].sort((a, b) => (a === "Sin hora" ? 1 : b === "Sin hora" ? -1 : a.localeCompare(b)));
  const closed = shift.instance.status === "closed";
  const color = puestoColor(group.puesto?.color ?? "ink");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={{ ...linkChip, cursor: "pointer", background: "transparent", fontFamily: "var(--font-mono)" }}>← Puestos</button>
        <span className="font-slab" style={{ fontSize: 22 }}>
          {person?.name ?? "—"} <span style={{ color: "var(--muted)" }}>·</span> <span style={{ color }}>{group.puesto?.name ?? shift.template.name}</span>
        </span>
        <button type="button" onClick={onChangePerson} className="cmd-btn ghost sm" style={{ marginLeft: "auto" }}>Cambiar de persona</button>
      </div>

      {st.status === "esperando" && st.gate && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 56, padding: "10px 14px", marginBottom: 14, border: "1.5px solid var(--amber)", background: "color-mix(in srgb, var(--amber) 12%, transparent)", borderRadius: 6 }}>
          <span style={{ fontSize: 13 }}>
            <strong>Esperando{gateWho ? ` a ${gateWho}` : ""}:</strong> {st.gate.title}
          </span>
          <button type="button" onClick={onStartAnyway} className="cmd-btn sm" style={{ marginLeft: "auto" }}>Iniciar de todos modos</button>
        </div>
      )}

      {keys.map((k) => (
        <section key={k} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", padding: "8px 0 4px" }}>{k}</div>
          {buckets.get(k)!.map((t) => (
            <TaskRow key={t.id} t={t} shift={shift} rosterById={rosterById} busy={busy === t.id} disabled={closed || !person} onToggle={() => onToggle(t)} />
          ))}
        </section>
      ))}
      {group.key !== ALL_KEY && shared.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", padding: "8px 0 4px", borderTop: "1px dashed var(--rule)" }}>Compartidas · todos</div>
          {shared.map((t) => (
            <TaskRow key={t.id} t={t} shift={shift} rosterById={rosterById} busy={busy === t.id} disabled={closed || !person} onToggle={() => onToggle(t)} />
          ))}
        </section>
      )}
      {group.tasks.length === 0 && shared.length === 0 && <div style={{ padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Este puesto no tiene tareas.</div>}
    </div>
  );
}

function TaskRow({ t, shift, rosterById, busy, disabled, onToggle }: { t: TemplateTask; shift: TurnoShift; rosterById: Map<string, TurnoPerson>; busy: boolean; disabled: boolean; onToggle: () => void }) {
  const c = shift.completions[t.id];
  const done = !!c;
  const who = c ? c.completed_by_name ?? rosterById.get(c.completed_by)?.name ?? null : null;
  const at = c ? new Date(c.completed_at) : null;
  const atLabel = at ? `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}` : "";
  const act = () => { if (!disabled && !busy) onToggle(); };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={act}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
      aria-disabled={disabled || busy}
      aria-pressed={done}
      aria-label={t.title}
      style={{ width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "56px 40px 1fr auto", alignItems: "center", gap: 10, minHeight: 64, padding: "10px 12px", marginBottom: 6, border: `1.5px solid ${done ? "var(--rule)" : "var(--ink)"}`, borderRadius: 6, background: done ? "var(--paper)" : "var(--paper-lt)", color: "var(--ink)", fontFamily: "var(--font-mono)", cursor: disabled ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
    >
      <span className="cmd-num" style={{ fontSize: 12, color: "var(--muted)" }}>{hhmm(t.due_time)}</span>
      <CmdCheck checked={done} size={32} mode="check" disabled={disabled} onClick={(e) => { e.stopPropagation(); act(); }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 17, fontWeight: 600, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{t.title}</span>
        {t.instructions && <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>{t.instructions}</span>}
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, fontSize: 11, color: "var(--muted)" }}>
        {t.requires_photo && <FotoBadge done={done && !!c?.photo_url} />}
        {done && <span>✓ {atLabel}{who ? ` · ${who}` : ""}</span>}
      </span>
    </div>
  );
}

function PersonPicker({ title, roster, current, onPick, onClose }: { title: string; roster: TurnoPerson[]; current: string | null; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div role="dialog" aria-label={`Quién hace ${title}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,14,8,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(720px, 96vw)", maxHeight: "86vh", overflowY: "auto", border: "1.5px solid var(--ink)", borderRadius: 10, background: "var(--paper-lt)", padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span className="font-slab" style={{ fontSize: 22 }}>¿Quién hace <span style={{ color: "var(--red)" }}>{title}</span>?</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ marginLeft: "auto", width: 36, height: 36, border: "1.5px solid var(--rule)", borderRadius: 3, background: "transparent", fontSize: 18, cursor: "pointer", color: "var(--ink)" }}>×</button>
        </div>
        {roster.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin equipo en la sede. Agrégalo en Configuración → Equipo.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {roster.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p.id)} aria-pressed={current === p.id} style={{ height: 88, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", border: `1.5px solid ${current === p.id ? "var(--ink)" : "var(--rule)"}`, borderRadius: 8, background: current === p.id ? "var(--paper)" : "transparent", color: "var(--ink)", fontFamily: "var(--font-mono)", cursor: "pointer", textAlign: "left" }}>
              <Avatar initials={p.initials} size={48} />
              <span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                <span style={{ display: "block", fontSize: 10, color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase" }}>{p.role === "admin" ? "admin" : "equipo"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <span className="inline-flex items-center justify-center" style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper)", fontSize: Math.round(size * 0.32), fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </span>
  );
}
