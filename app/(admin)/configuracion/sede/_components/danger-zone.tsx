"use client";

import * as React from "react";
import { rootUrl } from "@/lib/tenant";
import { deleteTenant } from "../_danger-actions";

/**
 * Permanent tenant deletion. Two-step (reveal → typed confirmation) so it can't
 * be triggered accidentally. The admin must type `confirmTarget` (the org's
 * subdomain) to enable the button.
 */
export function DangerZone({ confirmTarget }: { confirmTarget: string }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // On success the session is gone — hard-navigate to the apex login.
  React.useEffect(() => {
    if (done) window.location.assign(rootUrl("/login"));
  }, [done]);

  const canDelete = text.trim() === confirmTarget && !pending && !done;

  function del() {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTenant(text);
      if ("error" in r && r.error) setError(r.error);
      else setDone(true);
    });
  }

  return (
    <div
      style={{
        marginTop: 40,
        border: "1px solid var(--red)",
        borderRadius: 2,
        padding: 18,
        background: "var(--paper-lt)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--red)",
          fontWeight: 700,
        }}
      >
        Zona de peligro
      </div>
      <p
        className="text-muted"
        style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}
      >
        Eliminar el restaurante borra de forma permanente todos los turnos,
        tareas, productos, inventario y miembros del equipo, y libera el
        subdominio. Esta acción no se puede deshacer.
      </p>

      {!open ? (
        <button
          type="button"
          className="cmd-btn sm"
          onClick={() => setOpen(true)}
          style={{ marginTop: 12, borderColor: "var(--red)", color: "var(--red)" }}
        >
          Eliminar restaurante…
        </button>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
            Escribe <strong style={{ color: "var(--ink)" }}>{confirmTarget}</strong>{" "}
            para confirmar.
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={confirmTarget}
              style={{
                fontSize: 14,
                border: "1px solid var(--ink)",
                background: "var(--paper)",
                padding: "9px 11px",
                color: "var(--ink)",
                outline: "none",
                borderRadius: 2,
                width: 220,
              }}
            />
            <button
              type="button"
              className="cmd-btn red sm"
              onClick={del}
              disabled={!canDelete}
            >
              {pending || done ? "Eliminando…" : "Eliminar para siempre"}
            </button>
            <button
              type="button"
              className="cmd-btn ghost sm"
              onClick={() => {
                setOpen(false);
                setText("");
                setError(null);
              }}
              disabled={pending || done}
            >
              Cancelar
            </button>
          </div>
          {error ? (
            <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
