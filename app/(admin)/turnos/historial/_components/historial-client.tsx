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

/** "2026-05-31T18:04:00Z" → "18:04" (local). Falsy/invalid → null. */
function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function estadoLabel(r: Row): "cerrado" | "incompleto" | "en curso" {
  if (r.status === "closed") return "cerrado";
  if (r.status === "open" && r.done === 0) return "incompleto";
  return "en curso";
}

function estadoColor(e: ReturnType<typeof estadoLabel>): string {
  return e === "cerrado"
    ? "var(--green)"
    : e === "incompleto"
      ? "var(--amber)"
      : "var(--ink)";
}

export function HistorialClient({
  rows,
  initialTasks,
}: {
  rows: Row[];
  initialTasks: Task[];
}) {
  const [sel, setSel] = React.useState(0);
  const cur = rows[sel] ?? null;

  // Per-shift detail cache (keyed by shift id) so re-selecting a row doesn't
  // refetch. Seeded with row 0's template tasks as a first-paint fallback —
  // those carry NO completion data (page.tsx can't join it cheaply for the
  // list), so we still fetch the real detail for row 0 on mount to replace it.
  const firstId = rows[0]?.id;
  const [details, setDetails] = React.useState<Record<string, Detail>>(() =>
    firstId ? { [firstId]: { tasks: initialTasks, novedades: [] } } : {},
  );
  const [pending, startTransition] = React.useTransition();

  // Track which ids have had a *real* fetch resolve, so we don't treat the
  // completion-less first-paint fallback as authoritative.
  const loadedRef = React.useRef<Set<string>>(new Set());

  const load = React.useCallback((id: string) => {
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    startTransition(async () => {
      const d = await getShiftDetail(id);
      setDetails((prev) => ({ ...prev, [id]: d }));
    });
  }, []);

  // Fetch the initially-selected shift's real detail on mount.
  React.useEffect(() => {
    if (cur) load(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (i: number) => {
    setSel(i);
    const r = rows[i];
    if (r) load(r.id);
  };

  // Empty repo (no shifts): just render the empty list.
  if (rows.length === 0) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Sin turnos registrados todavía.
        </p>
      </div>
    );
  }

  const estado = estadoLabel(cur);
  const detail = details[cur.id] as Detail | undefined;
  const tasks = detail?.tasks ?? [];
  const novedades = detail?.novedades ?? [];
  const isLoading = pending && !detail;
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const photos = tasks.filter((t) => t.photo_url);

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: "1fr 1.1fr", gap: 0 }}
    >
      {/* list */}
      <div style={{ borderRight: "1px dashed var(--rule)" }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "1.4fr .8fr .8fr .6fr",
            padding: "10px 24px 10px 32px",
            background: "var(--ink)",
            color: "var(--paper-lt)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span>Fecha · turno</span>
          <span>Personal</span>
          <span style={{ textAlign: "right" }}>Avance</span>
          <span style={{ textAlign: "right" }}>Estado</span>
        </div>
        {rows.map((p, i) => {
          const active = i === sel;
          const e = estadoLabel(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => select(i)}
              className="grid items-center"
              style={{
                gridTemplateColumns: "1.4fr .8fr .8fr .6fr",
                padding: "14px 24px 14px 32px",
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                borderBottom: "1px solid var(--rule-soft)",
                borderLeft: `3px solid ${active ? "var(--red)" : "transparent"}`,
                background: active ? "var(--paper-lt)" : "transparent",
                color: "var(--ink)",
                minHeight: 0,
              }}
            >
              <span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.dateLabel}</span>
                <span
                  className="text-muted"
                  style={{
                    fontSize: 10,
                    display: "block",
                    textTransform: "capitalize",
                  }}
                >
                  Turno {p.template_name} · DR-{p.id.slice(0, 4).toUpperCase()}
                </span>
              </span>
              <span style={{ fontSize: 12 }}>{p.opener}</span>
              <span
                className="cmd-num"
                style={{ textAlign: "right", fontSize: 12 }}
              >
                {p.done}/{details[p.id]?.tasks.length || "—"}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  color: estadoColor(e),
                  textTransform: "uppercase",
                }}
              >
                {e}
              </span>
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div style={{ padding: "20px 32px" }}>
        <div className="flex justify-between items-start">
          <div>
            <div
              className="text-muted"
              style={{ fontSize: 10, letterSpacing: "0.14em" }}
            >
              {cur.dateLabel} · TURNO {cur.template_name.toUpperCase()} · DR-
              {cur.id.slice(0, 4).toUpperCase()}
            </div>
            <div className="font-slab" style={{ fontSize: 22, marginTop: 4 }}>
              {cur.opener}
            </div>
          </div>
          <Stamp rotate={-5} size={9} color={estadoColor(estado)}>
            {estado}
          </Stamp>
        </div>

        <div
          className="flex"
          style={{
            gap: 24,
            marginTop: 14,
            paddingBottom: 16,
            borderBottom: "1px dashed var(--rule)",
          }}
        >
          {[
            { l: "Tareas", v: isLoading ? "—" : `${done}/${total}` },
            { l: "Fotos", v: isLoading ? "—" : photos.length },
            { l: "Novedades", v: cur.novedades },
          ].map((s) => (
            <div key={s.l}>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {s.l}
              </div>
              <div
                className="cmd-num font-slab"
                style={{ fontSize: 22, marginTop: 2 }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: "16px 0 10px",
          }}
        >
          Tareas del turno · {isLoading ? "cargando…" : `${done}/${total}`}
        </div>
        <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
          {isLoading ? (
            <div
              className="text-muted"
              style={{ padding: 16, fontSize: 11, textAlign: "center" }}
            >
              Cargando…
            </div>
          ) : tasks.length === 0 ? (
            <div
              className="text-muted"
              style={{ padding: 16, fontSize: 11, textAlign: "center" }}
            >
              Sin checklist registrado para este turno.
            </div>
          ) : (
            tasks.map((t, i) => {
              const completed = t.completed;
              const doneAt = timeLabel(t.completed_at);
              return (
                <div
                  key={t.id}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: "22px 44px 1fr auto",
                    gap: 10,
                    padding: "8px 12px",
                    borderBottom:
                      i < tasks.length - 1
                        ? "1px solid var(--rule-soft)"
                        : "none",
                    opacity: completed ? 1 : 0.6,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `1.5px solid ${completed ? "var(--green)" : "var(--rule)"}`,
                      background: completed ? "var(--green)" : "transparent",
                      color: "var(--paper-lt)",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {completed ? "✓" : ""}
                  </span>
                  <span className="cmd-num text-muted" style={{ fontSize: 10 }}>
                    {t.due_time ?? "—"}
                  </span>
                  <span>
                    <span style={{ fontSize: 12 }}>{t.title}</span>
                    {completed && (doneAt || t.completed_by_name) ? (
                      <span
                        className="text-muted"
                        style={{
                          fontSize: 9,
                          display: "block",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {[doneAt, t.completed_by_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {t.requires_photo ? (
                    <span
                      className="inline-flex items-center"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        gap: 4,
                        color: t.photo_url ? "var(--green)" : "var(--muted)",
                      }}
                    >
                      📷 {t.photo_url ? "verificada" : "sin foto"}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div
          className="text-muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: "16px 0 10px",
          }}
        >
          Evidencia fotográfica
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}
        >
          {photos.length > 0
            ? photos.map((t) => (
                <a
                  key={t.id}
                  href={t.photo_url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  style={{ border: "1px solid var(--rule)" }}
                  title={t.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.photo_url ?? ""}
                    alt={t.title}
                    style={{
                      width: "100%",
                      height: 78,
                      objectFit: "cover",
                    }}
                  />
                </a>
              ))
            : [0, 1, 2].map((i) => (
                <div key={i} style={{ border: "1px solid var(--rule)" }}>
                  <PhotoPlaceholder w="100%" h={78} label="sin foto" />
                </div>
              ))}
        </div>

        {cur.novedades > 0 ? (
          <>
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                margin: "18px 0 10px",
              }}
            >
              Novedades · {cur.novedades}
            </div>
            {isLoading ? (
              <div
                className="text-muted"
                style={{
                  border: "1px solid var(--rule)",
                  padding: 10,
                  background: "var(--paper-lt)",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                Cargando…
              </div>
            ) : (
              <div className="flex" style={{ flexDirection: "column", gap: 8 }}>
                {novedades.map((n, i) => (
                  <div
                    key={n.id}
                    style={{
                      border: "1px solid var(--rule)",
                      padding: 10,
                      background: "var(--paper-lt)",
                    }}
                  >
                    <div
                      className="flex justify-between"
                      style={{ marginBottom: 4 }}
                    >
                      <Folio n={`N-${String(i + 1).padStart(2, "0")}`} />
                      <span
                        className="cmd-num text-muted"
                        style={{ fontSize: 10 }}
                      >
                        {[timeLabel(n.submitted_at), n.submitter]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: "var(--ink-2)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
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
