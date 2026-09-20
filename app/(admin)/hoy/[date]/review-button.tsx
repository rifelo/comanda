"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Stamp } from "@/components/comanda/primitives";
import { reviewShift } from "./_actions";

/**
 * "Marcar revisado" for a closed turno, or the REVISADO stamp with an undo.
 * The owner reviews after looking at the evidence grid right below.
 */
export function ReviewButton({ shiftId, status, reviewedAt, reviewedBy, compact }: {
  shiftId: string;
  status: "open" | "closed";
  /** Pre-formatted "HH:MM" in the sede tz, or null when not reviewed. */
  reviewedAt: string | null;
  reviewedBy: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function set(reviewed: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await reviewShift({ shift_instance_id: shiftId, reviewed });
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
      router.refresh();
    });
  }

  if (reviewedAt) {
    return (
      <span className="inline-flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <Stamp rotate={-4} size={compact ? 9 : 10} color="var(--green)">
          revisado · {reviewedBy ?? "admin"} · {reviewedAt}
        </Stamp>
        <button type="button" onClick={() => set(false)} disabled={pending} className="cmd-link" style={{ fontSize: 10.5 }}>
          {pending ? "…" : "deshacer"}
        </button>
        {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
      </span>
    );
  }
  const closed = status === "closed";
  return (
    <span className="inline-flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => set(true)}
        disabled={!closed || pending}
        title={closed ? "Revisé la evidencia de este turno" : "Cierra el turno primero"}
        className="cmd-btn red sm"
      >
        {pending ? "Guardando…" : "✓ Marcar revisado"}
      </button>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
    </span>
  );
}
