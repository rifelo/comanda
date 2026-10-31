"use client";

import * as React from "react";
import { Folio, PhotoPlaceholder, Stamp } from "@/components/comanda/primitives";
import { getShiftDetail } from "../_actions";

type Row = {
  id: string;
  date: string;
  dateLabel: string;
  template_id: string;
  template_name: string;
  status: "open" | "closed";
  done: number;
  novedades: number;
  opener: string;
};

type Task = {
  id: string;
  title: string;
  due_time: string | null;
  requires_photo: boolean;
  completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
  photo_url: string | null;
  note: string | null;
};

type Novedad = {
  id: string;
  body: string;
  submitted_at: string;
  submitter: string | null;
};

type Detail = { tasks: Task[]; novedades: Novedad[] };

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function estadoLabel(r: Row): "cerrado" | "incompleto" | "en curso" {
  if (r.status === "closed") return "cerrado";
  if (r.status === "open" && r.done === 0) return "incompleto";
  return "en curso";
}

function estadoColor(e: ReturnType<typeof estadoLabel>): string {
  return e === "cerrado" ? "var(--green)" : e === "incompleto" ? "var(--amber)" : "var(--ink)";
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "—"
  );
}

/** Mobile Historial — tappable list that pushes a full-screen detail screen.
 *  Same data + getShiftDetail as the desktop two-column view. */
export function HistorialMobile({
  rows,
  initialTasks,
}: {
  rows: Row[];
  initialTasks: Task[];
}) {
  const [sel, setSel] = React.useState<number | null>(null);
  const firstId = rows[0]?.id;
  const [details, setDetails] = React.useState<Record<string, Detail>>(() =>
    firstId ? { [firstId]: { tasks: initialTasks, novedades: [] } } : {},
  );
  const [pending, startTransition] = React.useTransition();
  const loadedRef = React.useRef<Set<string>>(new Set());

  const load = React.useCallback((id: string) => {
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    startTransition(async () => {
      const d = await getShiftDetail(id);
      setDetails((prev) => ({ ...prev, [id]: d }));
    });
  }, []);

  const open = (i: number) => {
    setSel(i);
    const r = rows[i];
    if (r) load(r.id);
  };

  if (rows.length === 0) {
    return (
      <div style={{ padding: "20px 14px" }}>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Sin turnos registrados todavía.
        </p>
      </div>
    );
  }

  // ── detail (pushed screen) ────────────────────────────────────
  if (sel != null && rows[sel]) {
    const cur = rows[sel];
    const detail = details[cur.id];
    const isLoading = pending && !detail;
    const tasks = detail?.tasks ?? [];
    const novedades = detail?.novedades ?? [];
    const total = tasks.length;
    const done = tasks.filter((t) => t.completed).length;
    const photos = tasks.filter((t) => t.photo_url);
    const estado = estadoLabel(cur);

    return (
      <div
        className="bg-paper flex flex-col"
        style={{ position: "fixed", inset: 0, zIndex: 40, color: "var(--ink)" }}
      >
        <div style={{ padding: "calc(env(safe-area-inset-top) + 14px) 16px 14px", borderBottom: "1.5px solid var(--ink)", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setSel(null)}
            className="cmd-link"
            style={{ background: "none", border: "none", fontSize: 11, padding: 0, marginBottom: 8, cursor: "pointer" }}
          >
            ‹ Historial
          </button>
          <div className="flex justify-between items-start">
            <div>
              <div className="text-muted" style={{ fontSize: 9.5, letterSpacing: "0.14em" }}>
                {cur.dateLabel} · TURNO {cur.template_name.toUpperCase()} · DR-{cur.id.slice(0, 4).toUpperCase()}
              </div>
              <div className="font-slab" style={{ fontSize: 22, marginTop: 4 }}>
                {cur.opener}
              </div>
            </div>
            <Stamp rotate={-5} size={9} color={estadoColor(estado)}>
              {estado}
            </Stamp>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>
          <div className="flex" style={{ gap: 26, paddingBottom: 16, borderBottom: "1px dashed var(--rule)" }}>
            {[
              { l: "Tareas", v: isLoading ? "—" : `${done}/${total}` },
              { l: "Fotos", v: isLoading ? "—" : photos.length },
              { l: "Novedades", v: cur.novedades },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {s.l}
                </div>
                <div className="cmd-num font-slab" style={{ fontSize: 24, marginTop: 2 }}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          <SectionLabel right={isLoading ? "cargando…" : `${done}/${total}`}>Tareas del turno</SectionLabel>
          <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
            {isLoading ? (
              <div className="text-muted" style={{ padding: 16, fontSize: 11, textAlign: "center" }}>Cargando…</div>
            ) : tasks.length === 0 ? (
              <div className="text-muted" style={{ padding: 16, fontSize: 11, textAlign: "center" }}>
                Sin checklist registrado para este turno.
              </div>
            ) : (
              tasks.map((t, i) => {
                const doneAt = timeLabel(t.completed_at);
                return (
                  <div
                    key={t.id}
                    className="flex items-center"
                    style={{
                      gap: 10,
                      padding: "9px 12px",
                      borderBottom: i < tasks.length - 1 ? "1px solid var(--rule-soft)" : "none",
                      opacity: t.completed ? 1 : 0.55,
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: 17,
                        height: 17,
                        minWidth: 17,
                        borderRadius: "50%",
                        border: `1.5px solid ${t.completed ? "var(--green)" : "var(--rule)"}`,
                        background: t.completed ? "var(--green)" : "transparent",
                        color: "var(--paper-lt)",
                        fontSize: 10,
                      }}
                    >
                      {t.completed ? "✓" : ""}
                    </span>
                    <span className="cmd-num text-muted" style={{ fontSize: 10, width: 38 }}>
                      {t.due_time ?? "—"}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5 }}>{t.title}</span>
                      {t.completed && (doneAt || t.completed_by_name) ? (
                        <span className="text-muted" style={{ fontSize: 9, display: "block", letterSpacing: "0.04em" }}>
                          {[doneAt, t.completed_by_name].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    {t.requires_photo ? (
                      <span style={{ fontSize: 12, color: t.photo_url ? "var(--green)" : "var(--muted)" }}>📷</span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <SectionLabel>Evidencia fotográfica</SectionLabel>
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {photos.length > 0
              ? photos.map((t) => (
                  <a
                    key={t.id}
                    href={t.photo_url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    style={{ border: "1px solid var(--ink)" }}
                    title={t.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.photo_url ?? ""} alt={t.title} style={{ width: "100%", height: 84, objectFit: "cover" }} />
                  </a>
                ))
              : [0, 1].map((i) => (
                  <div key={i} style={{ border: "1px solid var(--rule)" }}>
                    <PhotoPlaceholder w="100%" h={84} label="sin foto" />
                  </div>
                ))}
          </div>

          {cur.novedades > 0 ? (
            <>
              <SectionLabel right={cur.novedades}>Novedades</SectionLabel>
              {isLoading ? (
                <div
                  className="text-muted"
                  style={{ border: "1px solid var(--rule)", padding: 10, background: "var(--paper-lt)", fontSize: 11, textAlign: "center" }}
                >
                  Cargando…
                </div>
              ) : (
                <div className="flex" style={{ flexDirection: "column", gap: 8 }}>
                  {novedades.map((n, i) => (
                    <div key={n.id} style={{ border: "1px solid var(--rule)", padding: 11, background: "var(--paper-lt)" }}>
                      <div className="flex justify-between" style={{ marginBottom: 5 }}>
                        <Folio n={`N-${String(i + 1).padStart(2, "0")}`} />
                        <span className="cmd-num text-muted" style={{ fontSize: 10 }}>
                          {[timeLabel(n.submitted_at), n.submitter].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                        {n.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // ── list ──────────────────────────────────────────────────────
  return (
    <div style={{ padding: "4px 0 24px" }}>
      <div style={{ padding: "0 14px" }}>
        <SectionLabel right={`${rows.length} turnos`}>Turnos pasados</SectionLabel>
      </div>
      <div style={{ padding: "0 14px" }}>
        {rows.map((p, i) => {
          const e = estadoLabel(p);
          const totalLabel = details[p.id]?.tasks.length ?? "—";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => open(i)}
              className="flex items-center"
              style={{
                width: "100%",
                textAlign: "left",
                gap: 12,
                padding: "14px 14px",
                marginBottom: 8,
                border: "1px solid var(--rule-soft)",
                borderLeft: `3px solid ${estadoColor(e)}`,
                borderRadius: 3,
                background: "var(--paper-lt)",
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper)", fontSize: 12, fontWeight: 700 }}
              >
                {initials(p.opener)}
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {p.dateLabel} · <span style={{ textTransform: "capitalize" }}>{p.template_name}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                  {p.opener} · DR-{p.id.slice(0, 4).toUpperCase()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="cmd-num" style={{ fontSize: 14, fontWeight: 700 }}>
                  {p.done}/{totalLabel}
                </div>
                <div style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: estadoColor(e) }}>
                  {e}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8, padding: "16px 0 8px" }}>
      <span
        className="text-muted"
        style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}
      >
        {children}
      </span>
      <span className="flex-1" style={{ borderTop: "1px dashed var(--rule)", marginTop: 1 }} />
      {right != null ? <span className="text-muted" style={{ fontSize: 10 }}>{right}</span> : null}
    </div>
  );
}
