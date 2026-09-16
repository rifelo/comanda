"use client";

import Link from "next/link";
import * as React from "react";
import { createPuesto, createShift, deleteShift, updateShift } from "../_actions";
import { Chip } from "@/app/(admin)/_components/chip";
import type { Puesto } from "@/lib/types";

/**
 * Wraps the deleteShift action so its return type satisfies the React
 * `<form action>` contract (`(formData) => void | Promise<void>`). On
 * success the action redirects; on error we surface the message via an
 * alert until we add an in-form error slot for delete failures.
 */
async function deleteShiftAction(formData: FormData): Promise<void> {
  const r = await deleteShift(formData);
  if (r && "error" in r && r.error) {
    // The success path redirects so this only runs on hard failure.
    if (typeof window !== "undefined") {
      window.alert(r.error);
    }
  }
}

type ShiftTaskDraft = {
  /** Stable client id (used for keys + drag). For persisted rows this equals
   *  the DB id; for new rows it's a `new-…` token. */
  key: string;
  /** Set only for persisted rows; sent to `updateShift`. */
  persistedId?: string;
  title: string;
  instructions: string;
  due_time: string;
  requires_photo: boolean;
  /** puestos.id; null = compartida (todos). */
  puesto_id: string | null;
};

/** A puesto enabled on this turno, in order, with its soft handoff gate. */
type TplPuestoDraft = {
  puesto_id: string;
  /** Draft key (persisted id or `new-…`) of the gating task; null = sin espera. */
  waits_for_key: string | null;
};

export type ShiftFormInitial = {
  id: string;
  name: string;
  inicio: string;
  fin: string;
  dias: boolean[];
  tasks: {
    id: string;
    title: string;
    instructions: string | null;
    due_time: string | null;
    requires_photo: boolean;
    puesto_id: string | null;
  }[];
  puestos: { puesto_id: string; position: number; waits_for_task_id: string | null }[];
};

/** Puesto color token → theme variable (indigo rides on the stamp colour). */
export const PUESTO_COLORS: Record<string, string> = {
  ink: "var(--ink)",
  red: "var(--red)",
  green: "var(--green)",
  amber: "var(--amber)",
  indigo: "var(--stamp)",
};
export function puestoColor(token: string | undefined): string {
  return PUESTO_COLORS[token ?? "ink"] ?? "var(--ink)";
}

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

let seq = 0;
function newDraft(puesto_id: string | null = null): ShiftTaskDraft {
  return {
    key: `new-${Date.now()}-${++seq}`,
    title: "",
    instructions: "",
    due_time: "",
    requires_photo: false,
    puesto_id,
  };
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ─── 12-hour AM/PM time entry ────────────────────────────────────────────────
// The field is entered/displayed in 12-hour AM/PM form, but `due_time` stays
// canonical 24-hour "HH:MM" (what the DB `time` column and the server's
// /^\d{2}:\d{2}$/ validator expect) — so only the UI is 12-hour.

type Meridiem = "AM" | "PM";

/** Format while typing: digits only, colon inserted before the last two so the
 *  minutes are unambiguous. "2"→"2", "230"→"2:30", "1230"→"12:30". */
function format12Typing(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, d.length - 2)}:${d.slice(d.length - 2)}`;
}

/** Parse a typed 12-hour string → clamped {h12 (1-12), m (0-59)}, or null when
 *  empty. Last two digits are minutes; the rest is the hour. */
function parse12(text: string): { h12: number; m: number } | null {
  const d = text.replace(/\D/g, "");
  if (!d) return null;
  const [hStr, mStr] = d.length <= 2 ? [d, "0"] : [d.slice(0, d.length - 2), d.slice(d.length - 2)];
  let h12 = Number(hStr) || 12; // "0.." → 12
  h12 = Math.min(12, Math.max(1, h12));
  const m = Math.min(59, Number(mStr));
  return { h12, m };
}

/** Canonical 12-hour display, e.g. {9,5} → "9:05". */
function display12(p: { h12: number; m: number }): string {
  return `${p.h12}:${String(p.m).padStart(2, "0")}`;
}

/** 12-hour + meridiem → canonical 24-hour "HH:MM". */
function to24h(h12: number, m: number, mer: Meridiem): string {
  const h = (h12 % 12) + (mer === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Canonical 24-hour "HH:MM" → {12-hour text, meridiem} for first paint. */
function from24h(v: string): { text: string; mer: Meridiem } {
  const d = v.replace(/\D/g, "");
  if (d.length < 3) return { text: "", mer: "AM" };
  const h = Number(d.slice(0, 2));
  const m = Number(d.slice(2, 4));
  const h12 = h % 12 || 12;
  return { text: display12({ h12, m }), mer: h >= 12 ? "PM" : "AM" };
}

/** Compact 12-hour time entry: numeric h:mm field + an AM/PM toggle. Emits the
 *  canonical 24-hour value (or "" when cleared) via `onChange`. */
function TimeInput12({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Seed once from the incoming 24h value; thereafter we own the display.
  const init = React.useMemo(() => from24h(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = React.useState(init.text);
  const [mer, setMer] = React.useState<Meridiem>(init.mer);

  function emit(t: string, m: Meridiem) {
    const p = parse12(t);
    onChange(p ? to24h(p.h12, p.m, m) : "");
  }

  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      <input
        value={text}
        onChange={(e) => {
          const t = format12Typing(e.target.value);
          setText(t);
          emit(t, mer);
        }}
        onBlur={() => {
          const p = parse12(text);
          const t = p ? display12(p) : "";
          setText(t);
          emit(t, mer);
        }}
        inputMode="numeric"
        maxLength={5}
        placeholder="h:mm"
        style={{
          fontSize: 12,
          height: 28,
          boxSizing: "border-box",
          border: "1px solid var(--rule)",
          padding: "0 6px",
          background: "var(--paper)",
          width: 60,
          textAlign: "center",
          outline: "none",
          color: "var(--ink)",
        }}
      />
      <button
        type="button"
        onClick={() => {
          const m2: Meridiem = mer === "AM" ? "PM" : "AM";
          setMer(m2);
          emit(text, m2);
        }}
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          height: 28,
          minHeight: 0,
          boxSizing: "border-box",
          border: "1px solid var(--rule)",
          padding: "0 7px",
          background: "var(--paper-lt)",
          cursor: "pointer",
          color: "var(--ink)",
          lineHeight: 1,
        }}
      >
        {mer}
      </button>
    </div>
  );
}

export function ShiftForm({
  initial,
  puestoOptions,
}: {
  initial?: ShiftFormInitial;
  /** Puestos of the active sede (grows in place when one is created inline). */
  puestoOptions: Puesto[];
}) {
  const editing = !!initial;
  const [options, setOptions] = React.useState<Puesto[]>(puestoOptions);
  const [tplPuestos, setTplPuestos] = React.useState<TplPuestoDraft[]>(() =>
    [...(initial?.puestos ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ puesto_id: p.puesto_id, waits_for_key: p.waits_for_task_id })),
  );
  const [newPuestoName, setNewPuestoName] = React.useState<string | null>(null);
  const [puestoBusy, setPuestoBusy] = React.useState(false);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [inicio, setInicio] = React.useState(initial?.inicio ?? "14:30");
  const [fin, setFin] = React.useState(initial?.fin ?? "18:30");
  const [dias, setDias] = React.useState<boolean[]>(
    initial?.dias ?? [true, true, true, true, true, false, false],
  );
  const [tasks, setTasks] = React.useState<ShiftTaskDraft[]>(() =>
    (initial?.tasks ?? []).map((t) => ({
      key: t.id,
      persistedId: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      due_time: (t.due_time ?? "").slice(0, 5),
      requires_photo: t.requires_photo,
      puesto_id: t.puesto_id ?? null,
    })),
  );
  const [draggedIdx, setDraggedIdx] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<"detalles" | "tareas">("detalles");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const diasCount = dias.filter(Boolean).length;
  const fotoCount = tasks.filter((t) => t.requires_photo).length;
  const valid = name.trim().length > 0 && diasCount > 0;

  // duration "Hh MMm" (wraps midnight).
  let durMin = toMin(fin) - toMin(inicio);
  if (durMin <= 0) durMin += 1440;
  const dur = `${Math.floor(durMin / 60)}h ${String(durMin % 60).padStart(2, "0")}m`;

  function setTask(i: number, patch: Partial<ShiftTaskDraft>) {
    setTasks((p) => p.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addTask(puesto_id: string | null = null) {
    setTasks((p) => [...p, newDraft(puesto_id)]);
  }
  const puestoById = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const activePuestos = tplPuestos
    .map((tp) => puestoById.get(tp.puesto_id))
    .filter((p): p is Puesto => !!p);
  const activeIds = new Set(tplPuestos.map((tp) => tp.puesto_id));

  function togglePuesto(id: string) {
    setTplPuestos((prev) => {
      if (prev.some((tp) => tp.puesto_id === id)) {
        // Removing a puesto: its tasks become compartidas; gates pointing at
        // its tasks are cleared.
        const dropped = new Set(tasks.filter((t) => t.puesto_id === id).map((t) => t.key));
        setTasks((ts) => ts.map((t) => (t.puesto_id === id ? { ...t, puesto_id: null } : t)));
        return prev
          .filter((tp) => tp.puesto_id !== id)
          .map((tp) => (tp.waits_for_key && dropped.has(tp.waits_for_key) ? { ...tp, waits_for_key: null } : tp));
      }
      return [...prev, { puesto_id: id, waits_for_key: null }];
    });
  }
  function setGate(puesto_id: string, key: string | null) {
    setTplPuestos((prev) => prev.map((tp) => (tp.puesto_id === puesto_id ? { ...tp, waits_for_key: key } : tp)));
  }
  async function submitNewPuesto() {
    const name = (newPuestoName ?? "").trim();
    if (!name || puestoBusy) return;
    setPuestoBusy(true);
    const palette = ["red", "green", "indigo", "amber", "ink"] as const;
    const r = await createPuesto({ name, color: palette[options.length % palette.length] });
    setPuestoBusy(false);
    if ("error" in r) {
      setError(r.error ?? "No se pudo crear el puesto.");
      return;
    }
    setOptions((o) => [...o, r.puesto]);
    setTplPuestos((prev) => [...prev, { puesto_id: r.puesto.id, waits_for_key: null }]);
    setNewPuestoName(null);
  }
  function delTask(i: number) {
    setTasks((p) => p.filter((_, j) => j !== i));
  }

  function onDragStart(i: number) {
    return () => setDraggedIdx(i);
  }
  function onDragOver(i: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedIdx === null || draggedIdx === i) return;
      if ((tasks[draggedIdx]?.puesto_id ?? null) !== (tasks[i]?.puesto_id ?? null)) return;
      const next = tasks.slice();
      const [m] = next.splice(draggedIdx, 1);
      next.splice(i, 0, m);
      setDraggedIdx(i);
      setTasks(next);
    };
  }

  function onSave() {
    if (!valid) return;
    setError(null);
    const payloadTasks = tasks
      .filter((t) => t.title.trim().length > 0)
      .map((t) => ({
        id: t.persistedId,
        key: t.key,
        title: t.title.trim(),
        instructions: t.instructions.trim() || null,
        due_time: t.due_time.trim() ? t.due_time : null,
        requires_photo: t.requires_photo,
        puesto_id: t.puesto_id,
      }));
    const payloadPuestos = tplPuestos.map((tp, i) => ({
      puesto_id: tp.puesto_id,
      position: i,
      waits_for_task_key: tp.waits_for_key,
    }));

    startTransition(async () => {
      // Both actions redirect on success — the `await` will never resolve
      // when redirect() is hit, which is fine. Only an error result lands
      // back here.
      const result = editing
        ? await updateShift({
            id: initial!.id,
            name: name.trim(),
            inicio,
            fin,
            dias,
            tasks: payloadTasks,
            puestos: payloadPuestos,
          })
        : await createShift({
            name: name.trim(),
            inicio,
            fin,
            dias,
            tasks: payloadTasks,
            puestos: payloadPuestos,
          });
      if (result && "error" in result) setError(result.error);
    });
  }

  function renderCard(t: ShiftTaskDraft, i: number) {
    return (

              <div
                key={t.key}
                onDragOver={onDragOver(i)}
                onDragEnd={() => setDraggedIdx(null)}
                style={{
                  padding: "12px",
                  background: draggedIdx === i ? "var(--paper-lt)" : "var(--paper-lt)",
                  border: `1px solid ${draggedIdx === i ? "var(--ink)" : "var(--rule-soft)"}`,
                  borderRadius: 3,
                  marginBottom: 8,
                }}
              >
                {/* row 1 — drag handle · time · number · delete */}
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span
                    draggable
                    onDragStart={onDragStart(i)}
                    className="text-muted select-none"
                    aria-label="Reordenar"
                    title="Arrastra para reordenar"
                    style={{ fontSize: 15, lineHeight: 1, cursor: "grab", flexShrink: 0 }}
                  >
                    ⠿
                  </span>
                  <TimeInput12
                    value={t.due_time}
                    onChange={(v) => setTask(i, { due_time: v })}
                  />
                  <span
                    className="cmd-num text-muted"
                    style={{ fontSize: 10, letterSpacing: "0.1em", marginLeft: "auto" }}
                  >
                    #{i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => delTask(i)}
                    className="text-muted"
                    aria-label="Eliminar tarea"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 18,
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                {activePuestos.length > 0 && (
                  <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 10 }}>
                    <Chip active={t.puesto_id === null} onClick={() => setTask(i, { puesto_id: null })}>Todos</Chip>
                    {activePuestos.map((p) => (
                      <Chip key={p.id} active={t.puesto_id === p.id} onClick={() => setTask(i, { puesto_id: p.id })}>{p.name}</Chip>
                    ))}
                  </div>
                )}

                {/* row 2 — full-width title */}
                <input
                  value={t.title}
                  onChange={(e) => setTask(i, { title: e.target.value })}
                  placeholder="Título de la tarea"
                  className="w-full"
                  style={{
                    marginTop: 10,
                    boxSizing: "border-box",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "1px solid var(--rule)",
                    borderRadius: 3,
                    background: "var(--paper)",
                    padding: "9px 11px",
                    outline: "none",
                    color: "var(--ink)",
                  }}
                />

                {/* row 3 — multi-line instructions (wraps + resizes so long text is visible) */}
                <textarea
                  value={t.instructions}
                  onChange={(e) => setTask(i, { instructions: e.target.value })}
                  placeholder="Instrucciones (opcional) — describe el paso a paso"
                  rows={2}
                  className="w-full"
                  style={{
                    marginTop: 8,
                    boxSizing: "border-box",
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: "var(--ink-2)",
                    border: "1px solid var(--rule)",
                    borderRadius: 3,
                    background: "var(--paper)",
                    padding: "8px 11px",
                    outline: "none",
                    resize: "vertical",
                    minHeight: 64,
                  }}
                />

                {/* row 4 — photo toggle */}
                <label
                  className="flex items-center"
                  style={{ marginTop: 10, gap: 8, fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={t.requires_photo}
                    onChange={(e) => setTask(i, { requires_photo: e.target.checked })}
                    style={{ accentColor: "var(--red)", width: 16, height: 16 }}
                  />
                  REQUIERE FOTO DE EVIDENCIA
                </label>
              </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    border: "1px solid var(--ink)",
    background: "var(--paper)",
    padding: "11px 13px",
    color: "var(--ink)",
    width: "100%",
    outline: "none",
    borderRadius: 2,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {/* page header */}
      <div
        className="px-4 md:px-8"
        style={{
          paddingTop: 16,
          paddingBottom: 16,
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <Link
          href="/turnos/resumen"
          className="cmd-link"
          style={{ fontSize: 11, padding: 0, marginBottom: 8, display: "inline-block" }}
        >
          ‹ Volver a turnos
        </Link>
        <div className="flex flex-wrap justify-between items-end" style={{ gap: 12 }}>
          <div>
            <div
              className="text-muted"
              style={{ fontSize: 10, letterSpacing: "0.16em" }}
            >
              {editing ? "EDITAR TURNO" : "DEFINICIÓN"}
            </div>
            <h1
              className="font-slab"
              style={{ fontSize: 30, margin: "4px 0 0" }}
            >
              {editing ? `Editar turno ${initial?.name ?? ""}` : "Nuevo turno"}
            </h1>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <Link
              href="/turnos/resumen"
              className="cmd-btn ghost sm"
              style={{ textDecoration: "none" }}
            >
              Cancelar
            </Link>
            <button
              type="button"
              className="cmd-btn red sm"
              disabled={!valid || pending}
              onClick={onSave}
              style={{
                opacity: valid && !pending ? 1 : 0.4,
                cursor: valid && !pending ? "pointer" : "not-allowed",
              }}
            >
              {pending
                ? "Guardando…"
                : editing
                  ? "Guardar cambios"
                  : "Crear turno"}
            </button>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div
        className="flex px-4 md:px-8"
        style={{
          borderBottom: "1px dashed var(--rule)",
          gap: 0,
        }}
      >
        {[
          { id: "detalles" as const, n: "01", label: "Detalles del turno" },
          { id: "tareas" as const, n: "02", label: "Tareas del turno" },
        ].map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className="flex items-baseline"
              style={{
                gap: 8,
                background: "transparent",
                border: "none",
                borderBottom: on
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
                padding: "12px 16px",
                marginBottom: -1,
                cursor: "pointer",
                color: on ? "var(--ink)" : "var(--muted)",
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                letterSpacing: "0.04em",
                minHeight: 0,
              }}
            >
              <span
                className="cmd-num font-slab"
                style={{
                  fontSize: 14,
                  color: on ? "var(--red)" : "var(--muted)",
                }}
              >
                {tb.n}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {tb.label}
              </span>
              {tb.id === "tareas" ? (
                <span
                  className="cmd-num text-muted"
                  style={{ fontSize: 10, fontWeight: 400 }}
                >
                  · {tasks.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div className="px-4 md:px-8" style={{ flex: 1, paddingTop: 28, paddingBottom: 28, maxWidth: 860 }}>
        {error ? (
          <div
            style={{
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "10px 14px",
              marginBottom: 18,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        {tab === "detalles" ? (
          <div>
            <div style={{ maxWidth: 560 }}>
              <label style={labelStyle}>Nombre del turno</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Tarde, Madrugada, Brunch…"
                style={inputStyle}
              />
            </div>

            <div style={{ marginTop: 22, maxWidth: 560 }}>
              <label style={labelStyle}>Horario</label>
              <div
                className="grid"
                style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}
              >
                <div>
                  <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                    Inicia
                  </div>
                  <input
                    type="time"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                    Termina
                  </div>
                  <input
                    type="time"
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                className="flex items-baseline"
                style={{ marginTop: 10, gap: 8 }}
              >
                <span
                  className="text-muted"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Duración
                </span>
                <span
                  className="cmd-num font-slab"
                  style={{ fontSize: 18, lineHeight: 1 }}
                >
                  {dur}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 22, maxWidth: 560 }}>
              <label style={labelStyle}>
                Días de operación · {diasCount}/7
              </label>
              <div className="flex" style={{ gap: 8 }}>
                {DIAS_SEMANA.map((d, i) => {
                  const on = dias[i];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setDias((p) => p.map((v, j) => (j === i ? !v : v)))
                      }
                      style={{
                        flex: 1,
                        padding: "13px 0",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        borderRadius: 2,
                        minHeight: 0,
                        border: `1px solid ${on ? "var(--ink)" : "var(--rule-soft)"}`,
                        background: on ? "var(--ink)" : "transparent",
                        color: on ? "var(--paper-lt)" : "var(--muted)",
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {editing ? (
              <div
                className="flex justify-between items-center"
                style={{
                  marginTop: 22,
                  paddingTop: 22,
                  borderTop: "1px dashed var(--rule)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Eliminar turno
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    Se quita de la definición de la sede. No afecta turnos
                    pasados.
                  </div>
                </div>
                <form action={deleteShiftAction}>
                  <input type="hidden" name="id" value={initial?.id ?? ""} />
                  <button
                    type="submit"
                    className="cmd-btn ghost sm"
                    style={{
                      borderColor: "var(--red)",
                      color: "var(--red)",
                    }}
                  >
                    Eliminar
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <div
              className="flex items-baseline justify-between"
              style={{ marginBottom: 6 }}
            >
              <span
                className="text-muted"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Checklist del turno
              </span>
              <span
                className="cmd-num text-muted"
                style={{ fontSize: 11 }}
              >
                {tasks.length} tareas · {fotoCount} con foto
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 16 }}>
              Lo que el empleado debe completar durante este turno. Marca{" "}
              <strong>FOTO</strong> cuando se requiere evidencia.
            </div>

            {/* puestos of this turno */}
            <div style={{ border: "1px solid var(--rule)", borderRadius: 3, padding: "12px 14px", marginBottom: 16, background: "var(--paper-lt)" }}>
              <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
                <span className="text-muted" style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                  Puestos del turno
                </span>
                <span className="cmd-num text-muted" style={{ fontSize: 11 }}>
                  {activePuestos.length ? `${activePuestos.length} puestos` : "sin puestos · una sola lista"}
                </span>
              </div>
              <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
                {options.map((p) => (
                  <Chip key={p.id} active={activeIds.has(p.id)} onClick={() => togglePuesto(p.id)}>
                    <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 7, background: puestoColor(p.color), marginRight: 6, verticalAlign: "middle" }} />
                    {p.name}
                  </Chip>
                ))}
                {newPuestoName === null ? (
                  <Chip onClick={() => setNewPuestoName("")}>+ puesto</Chip>
                ) : (
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <input
                      autoFocus
                      value={newPuestoName}
                      onChange={(e) => setNewPuestoName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void submitNewPuesto(); }
                        if (e.key === "Escape") setNewPuestoName(null);
                      }}
                      placeholder="Nombre del puesto"
                      aria-label="Nombre del puesto"
                      style={{ fontSize: 12, border: "1px solid var(--ink)", background: "var(--paper)", padding: "5px 8px", borderRadius: 2, color: "var(--ink)", outline: "none", width: 150 }}
                    />
                    <button type="button" onClick={() => void submitNewPuesto()} disabled={puestoBusy} className="cmd-btn sm">Crear</button>
                    <button type="button" onClick={() => setNewPuestoName(null)} className="cmd-btn ghost sm">×</button>
                  </span>
                )}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                Cada puesto lo hace una persona distinta (Apertura, Barista, Aseo…). Sin puestos, el turno es una sola lista.
              </div>

              {activePuestos.length >= 2 && (
                <div style={{ marginTop: 12, borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>
                  <div className="text-muted" style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
                    Entrega entre puestos
                  </div>
                  {tplPuestos.map((tp) => {
                    const me = puestoById.get(tp.puesto_id);
                    if (!me) return null;
                    const candidates = tasks.filter((t) => t.puesto_id && t.puesto_id !== tp.puesto_id && t.title.trim());
                    return (
                      <label key={tp.puesto_id} className="flex flex-wrap items-center" style={{ gap: 8, fontSize: 12, marginBottom: 6 }}>
                        <span style={{ minWidth: 90, fontWeight: 600 }}>{me.name}</span>
                        <span className="text-muted">arranca cuando se complete</span>
                        <select
                          value={tp.waits_for_key ?? ""}
                          onChange={(e) => setGate(tp.puesto_id, e.target.value || null)}
                          aria-label={`${me.name} espera a`}
                          style={{ fontSize: 12, border: "1px solid var(--rule)", background: "var(--paper)", padding: "5px 8px", borderRadius: 2, color: "var(--ink)", maxWidth: 320 }}
                        >
                          <option value="">— sin espera —</option>
                          {candidates.map((t) => (
                            <option key={t.key} value={t.key}>
                              {puestoById.get(t.puesto_id!)?.name} · {t.title.trim()}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {tasks.length === 0 ? (
              <div
                style={{
                  border: "1px dashed var(--rule)",
                  padding: 24,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                Aún no hay tareas. Agrega la primera para armar el checklist del
                turno.
              </div>
            ) : null}

            {activePuestos.length === 0 ? (
              <>
                {tasks.map((t, i) => renderCard(t, i))}
                <button type="button" onClick={() => addTask()} className="cmd-btn ghost" style={{ marginTop: 10 }}>
                  + agregar tarea
                </button>
              </>
            ) : (
              <>
                {[{ id: null as string | null, name: "Compartidas · todos", color: "ink" }, ...activePuestos].map((sec) => {
                  const rows = tasks
                    .map((t, i) => ({ t, i }))
                    .filter(({ t }) => (sec.id === null ? !t.puesto_id || !activeIds.has(t.puesto_id) : t.puesto_id === sec.id));
                  return (
                    <div key={sec.id ?? "shared"} style={{ marginBottom: 18 }}>
                      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 10, background: puestoColor(sec.color) }} />
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{sec.name}</span>
                        <span className="cmd-num text-muted" style={{ fontSize: 11 }}>· {rows.length}</span>
                      </div>
                      {rows.map(({ t, i }) => renderCard(t, i))}
                      <button
                        type="button"
                        onClick={() => addTask(sec.id)}
                        className="cmd-btn ghost sm"
                        style={{ marginTop: 4 }}
                      >
                        {sec.id === null ? "+ agregar tarea" : `+ tarea · ${sec.name}`}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
