"use client";

import * as React from "react";
import type { RosterMember } from "@/lib/types";
import { inviteMember, removeMember, updateMember } from "../_actions";

export function EquipoClient({
  initialRoster,
}: {
  initialRoster: RosterMember[];
}) {
  const [roster, setRoster] = React.useState(initialRoster);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", email: "", phone: "" });
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const activos = roster.filter((p) => p.active).length;

  const cellInput: React.CSSProperties = {
    fontSize: 13,
    border: "none",
    background: "transparent",
    outline: "none",
    color: "var(--ink)",
    width: "100%",
    padding: 0,
  };
  const formInput: React.CSSProperties = {
    fontSize: 13,
    border: "1px solid var(--ink)",
    background: "var(--paper)",
    padding: "9px 11px",
    color: "var(--ink)",
    outline: "none",
    borderRadius: 2,
    width: "100%",
  };

  function patchLocal(id: string, p: Partial<RosterMember>) {
    setRoster((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  function commitNameOrPhone(id: string, field: "name" | "phone", value: string) {
    startTransition(async () => {
      const r = await updateMember(
        field === "name"
          ? { id, name: value }
          : { id, phone: value.length > 0 ? value : null },
      );
      if ("error" in r && r.error) setError(r.error);
    });
  }

  function commitActive(id: string, active: boolean) {
    patchLocal(id, { active });
    startTransition(async () => {
      const r = await updateMember({ id, active });
      if ("error" in r && r.error) {
        setError(r.error);
        // roll back
        patchLocal(id, { active: !active });
      }
    });
  }

  function remove(id: string) {
    const prev = roster;
    setRoster((p) => p.filter((x) => x.id !== id));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const r = await removeMember(fd);
      if ("error" in r && r.error) {
        setError(r.error);
        setRoster(prev);
      }
    });
  }

  function add() {
    if (!draft.name.trim() || !draft.email.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await inviteMember({
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || undefined,
      });
      if ("error" in r && r.error) setError(r.error);
      else {
        setDraft({ name: "", email: "", phone: "" });
        setAdding(false);
      }
    });
  }

  return (
    <div>
      <div
        className="flex justify-between items-center"
        style={{ marginBottom: 14 }}
      >
        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {roster.length} {roster.length === 1 ? "persona" : "personas"} ·{" "}
          {activos} activas
        </div>
        <button
          type="button"
          className="cmd-btn sm"
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? "✕ Cerrar" : "+ Invitar persona"}
        </button>
      </div>

      {adding ? (
        <div
          className="cmd-noise"
          style={{
            border: "1.5px solid var(--ink)",
            background: "var(--paper-lt)",
            padding: 18,
            marginBottom: 18,
            boxShadow: "2px 2px 0 rgba(0,0,0,.06)",
          }}
        >
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Invitar persona
          </div>
          <div
            className="grid items-end"
            style={{
              gridTemplateColumns: "1.4fr 1.6fr 1fr auto",
              gap: 12,
            }}
          >
            <div>
              <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                Nombre completo
              </div>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="ej. Andrea Gómez"
                style={formInput}
              />
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                Email
              </div>
              <input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="persona@correo.com"
                style={formInput}
              />
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                Teléfono
              </div>
              <input
                value={draft.phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, phone: e.target.value }))
                }
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="opcional"
                style={formInput}
              />
            </div>
            <button
              type="button"
              className="cmd-btn red sm"
              onClick={add}
              disabled={pending || !draft.name.trim() || !draft.email.trim()}
              style={{ height: 38 }}
            >
              {pending ? "…" : "Invitar"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            border: "1px solid var(--amber)",
            color: "var(--amber)",
            padding: "8px 12px",
            marginBottom: 14,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ border: "1px solid var(--rule)" }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "2fr 1.8fr 1.1fr .9fr .9fr 40px",
            padding: "10px 16px",
            background: "var(--ink)",
            color: "var(--paper-lt)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span>Persona</span>
          <span>Email</span>
          <span>Teléfono</span>
          <span style={{ textAlign: "center" }}>Rol</span>
          <span style={{ textAlign: "center" }}>Activo</span>
          <span></span>
        </div>
        {roster.map((p, i) => (
          <div
            key={p.id}
            className="grid items-center"
            style={{
              gridTemplateColumns: "2fr 1.8fr 1.1fr .9fr .9fr 40px",
              padding: "12px 16px",
              borderBottom:
                i < roster.length - 1 ? "1px solid var(--rule-soft)" : "none",
              background: p.active ? "var(--paper-lt)" : "transparent",
              opacity: p.active ? 1 : 0.55,
            }}
          >
            <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
              <span
                className="inline-flex items-center justify-center flex-shrink-0"
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
                {p.initials}
              </span>
              <input
                value={p.name}
                onChange={(e) => patchLocal(p.id, { name: e.target.value })}
                onBlur={(e) => commitNameOrPhone(p.id, "name", e.target.value)}
                style={{ ...cellInput, fontWeight: 500 }}
              />
            </div>
            <input
              type="email"
              value={p.email}
              readOnly
              placeholder="—"
              style={{ ...cellInput, color: "var(--ink-2)", fontSize: 12 }}
            />
            <input
              value={p.phone ?? ""}
              onChange={(e) => patchLocal(p.id, { phone: e.target.value })}
              onBlur={(e) => commitNameOrPhone(p.id, "phone", e.target.value)}
              placeholder="—"
              className="cmd-num text-muted"
              style={{ ...cellInput, fontSize: 12 }}
            />
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 2,
                  border: `1px solid ${p.role === "admin" ? "var(--ink)" : "var(--rule)"}`,
                  background:
                    p.role === "admin" ? "var(--ink)" : "transparent",
                  color:
                    p.role === "admin" ? "var(--paper-lt)" : "var(--muted)",
                }}
              >
                {p.role === "admin" ? "Dueño" : "Staff"}
              </span>
            </div>
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={() => commitActive(p.id, !p.active)}
                title={p.active ? "Activo" : "Inactivo"}
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 10,
                  border: `1px solid ${p.active ? "var(--green)" : "var(--rule)"}`,
                  background: p.active
                    ? "rgba(31,138,91,.15)"
                    : "transparent",
                  position: "relative",
                  cursor: "pointer",
                  padding: 0,
                  minHeight: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: p.active ? 16 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: p.active ? "var(--green)" : "var(--muted)",
                    transition: "left .12s",
                  }}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={() => remove(p.id)}
              title="Eliminar"
              className="text-muted"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                justifySelf: "center",
                minHeight: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        {roster.length === 0 ? (
          <div
            className="text-muted"
            style={{ padding: 28, textAlign: "center", fontSize: 12 }}
          >
            Sin personas. Invita a la primera con &ldquo;+ Invitar
            persona&rdquo;.
          </div>
        ) : null}
      </div>
      <div
        className="text-muted"
        style={{ fontSize: 10, marginTop: 12, letterSpacing: "0.04em" }}
      >
        Las personas activas aparecen al asignar turnos en{" "}
        <strong>Turnos · Asignación</strong>.
      </div>
    </div>
  );
}
