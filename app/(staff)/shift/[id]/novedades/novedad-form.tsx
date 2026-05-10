"use client";

import { useRef, useState, useTransition } from "react";
import { submitNovedad } from "../actions";

const MAX = 500;

export function NovedadForm({
  shiftInstanceId,
}: {
  shiftInstanceId: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  return (
    <form
      action={(formData) => {
        const body = String(formData.get("body") ?? "").trim();
        if (!body) return;
        setError(null);
        startTransition(async () => {
          const r = await submitNovedad({
            shift_instance_id: shiftInstanceId,
            body,
          });
          if (r?.error) setError(r.error);
          else if (ref.current) {
            ref.current.value = "";
            setCount(0);
          }
        });
      }}
    >
      <textarea
        ref={ref}
        name="body"
        required
        minLength={3}
        maxLength={MAX}
        placeholder="Describe la novedad (ej: 'Nevera Coca-Cola hace ruido al encender')"
        onChange={(e) => setCount(e.target.value.length)}
        className="cmd-lined block w-full outline-none resize-none"
        style={{
          minHeight: 132,
          border: "1.5px solid var(--ink)",
          padding: "12px",
          fontSize: 13,
          color: "var(--ink)",
          lineHeight: "24px",
          fontFamily: "inherit",
        }}
      />

      <div
        className="flex items-center justify-between mt-2.5 text-muted"
        style={{ fontSize: 10, letterSpacing: "0.1em" }}
      >
        <span>📎 Adjuntar foto</span>
        <span className="cmd-num">
          {count} / {MAX}
        </span>
      </div>

      {error ? (
        <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</p>
      ) : null}

      <button
        type="submit"
        className="cmd-btn red w-full mt-3.5"
        style={{ padding: "13px" }}
        disabled={pending}
      >
        {pending ? "Enviando…" : "Enviar al admin →"}
      </button>
    </form>
  );
}
