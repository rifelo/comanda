"use client";

import * as React from "react";
import type { TurnoShift } from "@/lib/turno/server";
import { formatTime } from "@/lib/utils";

/**
 * Shift notes for the selected turno: the handoff log. Right-side sheet on
 * a landscape tablet, full screen in portrait. Newest first.
 */
export function NovedadesSheet({ shift, tz, busy, error, onClose, onSubmit }: {
  shift: TurnoShift;
  tz: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const text = body.trim();
    if (text.length < 3 || busy) return;
    if (await onSubmit(text)) setBody("");
  }

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,14,8,.35)" }}>
      <div
        role="dialog"
        aria-label={`Novedades · ${shift.template.name}`}
        className="w-full lg:w-[520px]"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", background: "var(--paper-lt)", borderLeft: "1.5px solid var(--ink)", fontFamily: "var(--font-mono)", color: "var(--ink)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1.5px solid var(--ink)" }}>
          <span className="font-slab" style={{ fontSize: 22 }}>Novedades<span style={{ color: "var(--red)" }}>.</span></span>
          <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{shift.template.name}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ marginLeft: "auto", width: 40, height: 40, border: "1.5px solid var(--rule)", borderRadius: 3, background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--ink)" }}>×</button>
        </div>

        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--rule)" }}>
          <label htmlFor="turno-novedad" style={{ display: "block", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Registrar novedad
          </label>
          <textarea
            id="turno-novedad"
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit(); }}
            rows={4}
            maxLength={2000}
            placeholder="Qué pasó, qué falta, qué se dañó, qué queda pendiente…"
            className="cmd-lined"
            style={{ width: "100%", minHeight: 120, padding: "10px 12px", border: "1.5px solid var(--ink)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1.5, resize: "vertical", outline: "none" }}
          />
          {error && <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</p>}
          <button type="button" onClick={() => void submit()} disabled={busy || body.trim().length < 3} className="cmd-btn red" style={{ width: "100%", height: 52, marginTop: 10, fontSize: 13 }}>
            {busy ? "Guardando…" : "Registrar novedad"}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px 24px" }}>
          {shift.novedades.length === 0 && <div style={{ padding: "24px 0", fontSize: 12.5, color: "var(--muted)" }}>Sin novedades en este turno.</div>}
          {shift.novedades.map((n) => (
            <article key={n.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--rule-soft)" }}>
              <div className="cmd-num" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 4 }}>
                {formatTime(n.submitted_at, tz)}{n.submitted_by_name ? ` · ${n.submitted_by_name}` : ""}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.body}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
