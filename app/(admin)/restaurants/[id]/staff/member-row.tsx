"use client";

import { useState, useTransition } from "react";
import { removeStaffMember } from "./actions";

export function MemberRow({
  restaurantId,
  userId,
  fullName,
  role,
}: {
  restaurantId: string;
  userId: string;
  fullName: string;
  role: "admin" | "staff";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRemove() {
    if (!confirm(`¿Quitar a ${fullName} del equipo?`)) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("restaurant_id", restaurantId);
      fd.set("user_id", userId);
      const r = await removeStaffMember(fd);
      if (!r.ok) setError(r.error ?? "Algo salió mal.");
      // revalidatePath in the action removes this row from the next render.
    });
  }

  return (
    <li
      className="flex items-center justify-between"
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--rule-soft)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 500 }}>{fullName}</div>
        {role === "admin" ? (
          <span
            aria-label="También administrador"
            title="También administrador"
            style={{
              fontSize: 8,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--red)",
              border: "1px solid var(--red)",
              padding: "1px 5px",
              fontWeight: 700,
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            admin
          </span>
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          style={{ color: "var(--red)", fontSize: 11, marginTop: 2 }}
        >
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        className="cmd-link"
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--red)",
          textDecorationColor: "var(--red)",
          minHeight: 0,
          padding: 0,
        }}
      >
        {pending ? "Quitando…" : "× quitar"}
      </button>
    </li>
  );
}
