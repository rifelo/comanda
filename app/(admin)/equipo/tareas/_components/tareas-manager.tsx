"use client";

import * as React from "react";
import type { RosterMember, Task } from "@/lib/types";
import { CmdSectionLabel, Stamp } from "@/components/comanda/primitives";
import { TareaRow } from "./tarea-row";
import { TareaForm } from "./tarea-form";

type StatusFilter = "pending" | "done" | "all";
type FormState = { task: Task | null } | null;

/** Admin task console: stats + status/assignee/search filters + grouped list,
 *  with a slide-in drawer (desktop) / bottom-sheet (phone) create-edit form. */
export function TareasManager({
  tasks,
  roster,
  today,
  restaurantId,
  sedeName,
}: {
  tasks: Task[];
  roster: RosterMember[];
  today: string;
  restaurantId: string;
  sedeName: string;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("pending");
  const [assignee, setAssignee] = React.useState<string>("all"); // all | none | <id>
  const [form, setForm] = React.useState<FormState>(null);

  // headline metrics from the full (unfiltered) set
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const overdueCount = tasks.filter(
    (t) => t.status === "pending" && t.scheduled_date && t.scheduled_date < today,
  ).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (assignee === "none" && t.assigned_to !== null) return false;
    if (assignee !== "all" && assignee !== "none" && t.assigned_to !== assignee)
      return false;
    if (
      q &&
      !t.title.toLowerCase().includes(q) &&
      !(t.details ?? "").toLowerCase().includes(q)
    )
      return false;
    return true;
  });

  const fPending = filtered.filter((t) => t.status === "pending");
  const fDone = filtered.filter((t) => t.status === "done");
  const hoy = fPending.filter((t) => t.scheduled_date && t.scheduled_date <= today);
  const proximas = fPending.filter((t) => t.scheduled_date && t.scheduled_date > today);
  const sinFecha = fPending.filter((t) => !t.scheduled_date);

  const groups: { label: string; items: Task[] }[] = [];
  if (status !== "done") {
    groups.push(
      { label: "Hoy y vencidas", items: hoy },
      { label: "Próximas", items: proximas },
      { label: "Sin fecha", items: sinFecha },
    );
  }
  if (status !== "pending") groups.push({ label: "Completadas", items: fDone });
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <div className="relative">
      {/* desktop create action (phone uses the FAB) */}
      <div className="hidden lg:flex justify-end" style={{ padding: "18px 16px 0" }}>
        <button type="button" className="cmd-btn red" onClick={() => setForm({ task: null })}>
          + Nueva tarea
        </button>
      </div>

      {/* stats */}
      <div className="flex" style={{ gap: 10, padding: "14px 16px 0" }}>
        <Stat label="Pendientes" value={pendingCount} />
        <Stat label="Vencidas" value={overdueCount} tone="red" />
        <Stat label="Completadas" value={doneCount} tone="green" />
      </div>

      {/* filters */}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 10, padding: "14px 16px", borderBottom: "1px dashed var(--rule)" }}
      >
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "pending", label: "Pendientes" },
            { value: "done", label: "Completadas" },
            { value: "all", label: "Todas" },
          ]}
        />
        <Select value={assignee} onChange={setAssignee}>
          <option value="all">Todos los asignados</option>
          <option value="none">Sin asignar</option>
          {roster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
          <span
            className="text-muted"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}
          >
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarea…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontSize: 12,
              color: "var(--ink)",
              background: "var(--paper-lt)",
              border: "1.5px solid var(--rule)",
              borderRadius: 3,
              padding: "10px 12px 10px 30px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* list */}
      <div className="cmd-paper pb-28 lg:pb-6">
        {visibleGroups.length === 0 ? (
          <div className="text-center" style={{ padding: "48px 24px", color: "var(--muted)" }}>
            <Stamp rotate={-5} size={13}>
              Sin resultados
            </Stamp>
            <div style={{ fontSize: 12, marginTop: 14 }}>
              Ninguna tarea coincide con los filtros.
            </div>
          </div>
        ) : (
          visibleGroups.map((g) => (
            <section key={g.label}>
              <CmdSectionLabel>
                {g.label} · {g.items.length}
              </CmdSectionLabel>
              {g.items.map((t) => (
                <TareaRow key={t.id} task={t} today={today} onEdit={(task) => setForm({ task })} />
              ))}
            </section>
          ))
        )}
      </div>

      {/* phone FAB */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30" style={{ padding: "0 16px 24px" }}>
        <button
          type="button"
          className="cmd-btn red w-full"
          style={{ padding: 15, fontSize: 13, boxShadow: "0 6px 18px rgba(31,26,20,0.22)" }}
          onClick={() => setForm({ task: null })}
        >
          + Nueva tarea
        </button>
      </div>

      {/* create / edit form — drawer (desktop) + bottom-sheet (phone) */}
      {form ? (
        <>
          <div
            onClick={() => setForm(null)}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(20,16,10,0.35)" }}
          />
          {/* desktop drawer */}
          <div
            className="hidden lg:block fixed top-0 right-0 bottom-0 z-50"
            style={{
              width: 440,
              borderLeft: "1.5px solid var(--ink)",
              boxShadow: "-12px 0 36px rgba(20,16,10,0.18)",
            }}
          >
            <TareaForm
              task={form.task}
              restaurantId={restaurantId}
              roster={roster}
              sedeName={sedeName}
              onClose={() => setForm(null)}
            />
          </div>
          {/* phone bottom-sheet */}
          <div
            className="lg:hidden fixed inset-x-0 bottom-0 z-50 overflow-hidden"
            style={{
              height: "92%",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              border: "1.5px solid var(--ink)",
              borderBottom: "none",
              boxShadow: "0 -10px 30px rgba(20,16,10,0.25)",
            }}
          >
            <TareaForm
              task={form.task}
              restaurantId={restaurantId}
              roster={roster}
              sedeName={sedeName}
              onClose={() => setForm(null)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "green";
}) {
  const color =
    tone === "red" ? "var(--red)" : tone === "green" ? "var(--green)" : "var(--ink)";
  return (
    <div
      style={{
        flex: 1,
        border: "1px solid var(--rule)",
        background: "var(--paper-lt)",
        padding: "12px 14px",
        borderRadius: 3,
      }}
    >
      <div className="cmd-num font-slab" style={{ fontSize: 34, lineHeight: 1, color }}>
        {value}
      </div>
      <div
        className="text-muted"
        style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 6 }}
      >
        {label}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="inline-flex overflow-hidden"
      style={{ border: "1.5px solid var(--ink)", borderRadius: 3 }}
    >
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "9px 13px",
              cursor: "pointer",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper-lt)" : "var(--ink)",
              borderRight: i === options.length - 1 ? "none" : "1px solid var(--rule)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 12,
        color: "var(--ink)",
        background: "var(--paper-lt)",
        border: "1.5px solid var(--ink)",
        borderRadius: 3,
        padding: "9px 28px 9px 11px",
        cursor: "pointer",
        appearance: "none",
        backgroundImage:
          "linear-gradient(45deg, transparent 50%, var(--ink) 50%), linear-gradient(135deg, var(--ink) 50%, transparent 50%)",
        backgroundPosition: "right 13px center, right 8px center",
        backgroundSize: "5px 5px, 5px 5px",
        backgroundRepeat: "no-repeat",
      }}
    >
      {children}
    </select>
  );
}
