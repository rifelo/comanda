"use client";

import * as React from "react";
import type { RosterMember } from "@/lib/types";
import {
  createMemberWithPassword,
  inviteMember,
  removeMember,
  setMemberPassword,
  updateMember,
} from "../_actions";

type AccessMode = "password" | "invite";

export function EquipoClient({
  initialRoster,
}: {
  initialRoster: RosterMember[];
}) {
  const [roster, setRoster] = React.useState(initialRoster);
  const [adding, setAdding] = React.useState(false);
  const [mode, setMode] = React.useState<AccessMode>("password");
  const [draft, setDraft] = React.useState({ name: "", email: "", phone: "", password: "" });
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  // Inline "nueva contraseña" editor for one row at a time.
  const [pw, setPw] = React.useState<{ id: string; value: string; saved: boolean } | null>(null);

  const canAdd =
    draft.name.trim().length > 0 &&
    draft.email.trim().length > 0 &&
    (mode === "invite" || draft.password.length >= 8);

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
    if (!canAdd) return;
    setError(null);
    startTransition(async () => {
      const base = {
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || undefined,
      };
      const r =
        mode === "password"
          ? await createMemberWithPassword({ ...base, password: draft.password })
          : await inviteMember(base);
      if ("error" in r && r.error) setError(r.error);
      else if ("member" in r && r.member) {
        const added = r.member;
        setRoster((prev) =>
          [...prev.filter((x) => x.id !== added.id), added].sort((a, b) => a.name.localeCompare(b.name, "es")),
        );
        setDraft({ name: "", email: "", phone: "", password: "" });
        setAdding(false);
      }
    });
  }

  function savePassword() {
    if (!pw || pw.value.length < 8) return;
    const { id, value } = pw;
    setError(null);
    startTransition(async () => {
      const r = await setMemberPassword({ id, password: value });
      if ("error" in r && r.error) setError(r.error);
      else {
        setPw({ id, value: "", saved: true });
        window.setTimeout(() => setPw((cur) => (cur?.id === id && cur.saved ? null : cur)), 2500);
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
          {adding ? "✕ Cerrar" : "+ Agregar persona"}
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
          <div className="flex items-center" style={{ gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Agregar persona · cómo entra
            </div>
            <div className="flex" style={{ gap: 6 }} role="radiogroup" aria-label="Cómo entra">
              {(
                [
                  ["password", "Con contraseña"],
                  ["invite", "Invitación por correo"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${mode === value ? "var(--ink)" : "var(--rule)"}`,
                    background: mode === value ? "var(--ink)" : "transparent",
                    color: mode === value ? "var(--paper-lt)" : "var(--muted)",
                    cursor: "pointer",
                    minHeight: 0,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="grid items-end"
            style={{
              gridTemplateColumns: mode === "password" ? "1.3fr 1.5fr 1.2fr .9fr auto" : "1.4fr 1.6fr 1fr auto",
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
            {mode === "password" ? (
              <div>
                <div className="text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                  Contraseña <span style={{ opacity: 0.7 }}>(mín. 8)</span>
                </div>
                <input
                  type="text"
                  value={draft.password}
                  onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="la que le vas a entregar"
                  className="cmd-num"
                  style={formInput}
                />
              </div>
            ) : null}
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
              disabled={pending || !canAdd}
              style={{ height: 38 }}
            >
              {pending ? "…" : mode === "password" ? "Crear acceso" : "Invitar"}
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.5 }}>
            {mode === "password"
              ? "La persona entra en la tablet del turno con su correo y esta contraseña. Entrégasela en persona; puedes cambiarla cuando quieras desde la lista."
              : "Le llega un correo con un enlace para activar la cuenta; luego entra con Google usando ese mismo correo."}
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
            gridTemplateColumns: "2fr 1.8fr 1.1fr .9fr .9fr 96px",
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
          <React.Fragment key={p.id}>
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: "2fr 1.8fr 1.1fr .9fr .9fr 96px",
              padding: "12px 16px",
              borderBottom:
                i < roster.length - 1 && pw?.id !== p.id ? "1px solid var(--rule-soft)" : "none",
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
              readOnly={!p.isMember}
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
              {p.isMember ? (
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
              ) : (
                // Owners aren't sede members — nothing to toggle.
                <span className="text-muted" style={{ fontSize: 12 }}>
                  —
                </span>
              )}
            </div>
            <div className="flex items-center justify-end" style={{ gap: 6 }}>
              <button
                type="button"
                onClick={() => setPw(pw?.id === p.id ? null : { id: p.id, value: "", saved: false })}
                title="Asignar o cambiar la contraseña"
                aria-pressed={pw?.id === p.id}
                className="text-muted"
                style={{
                  background: pw?.id === p.id ? "var(--ink)" : "transparent",
                  color: pw?.id === p.id ? "var(--paper-lt)" : undefined,
                  border: "1px solid var(--rule)",
                  borderRadius: 2,
                  cursor: "pointer",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "4px 7px",
                  minHeight: 0,
                }}
              >
                clave
              </button>
              {p.isMember ? (
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
                    minHeight: 0,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
          {pw?.id === p.id ? (
            <div
              className="flex items-center"
              style={{
                gap: 10,
                padding: "8px 16px 12px 56px",
                borderBottom: i < roster.length - 1 ? "1px solid var(--rule-soft)" : "none",
                background: "var(--paper-lt)",
              }}
            >
              <span className="text-muted" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Nueva contraseña
              </span>
              <input
                autoFocus
                type="text"
                value={pw.value}
                onChange={(e) => setPw({ id: p.id, value: e.target.value, saved: false })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePassword();
                  if (e.key === "Escape") setPw(null);
                }}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="mín. 8 caracteres"
                className="cmd-num"
                style={{ ...formInput, maxWidth: 260, padding: "7px 10px" }}
              />
              <button
                type="button"
                className="cmd-btn sm"
                onClick={savePassword}
                disabled={pending || pw.value.length < 8}
              >
                {pending ? "…" : "Guardar"}
              </button>
              <button type="button" className="cmd-btn ghost sm" onClick={() => setPw(null)}>
                Cancelar
              </button>
              {pw.saved ? (
                <span style={{ fontSize: 11, color: "var(--green)" }}>✓ Contraseña actualizada</span>
              ) : null}
            </div>
          ) : null}
          </React.Fragment>
        ))}
        {roster.length === 0 ? (
          <div
            className="text-muted"
            style={{ padding: 28, textAlign: "center", fontSize: 12 }}
          >
            Sin personas. Agrega la primera con &ldquo;+ Agregar
            persona&rdquo;.
          </div>
        ) : null}
      </div>
      <div
        className="text-muted"
        style={{ fontSize: 10, marginTop: 12, letterSpacing: "0.04em" }}
      >
        Las personas activas aparecen al asignar turnos en{" "}
        <strong>Turnos · Asignación</strong>. El equipo entra en la tablet del
        turno con correo + contraseña (o con Google usando el mismo correo).
      </div>
    </div>
  );
}
