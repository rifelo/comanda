"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button, Pill } from "@/components/ui";
import { reviewShift } from "./_actions";

/**
 * «Marcar revisado» for a closed turno, or the «Revisado» pill with an undo.
 * The owner reviews after looking at the tasks and photos on this page.
 */
export function ReviewButton({
  shiftId,
  status,
  reviewedAt,
  reviewedBy,
}: {
  shiftId: string;
  status: "open" | "closed";
  /** Pre-formatted "HH:MM" in the sede tz, or null when not reviewed. */
  reviewedAt: string | null;
  reviewedBy: string | null;
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
      <span className="inline-flex flex-wrap items-center gap-2">
        <Pill tone="ok">
          ✓ Revisado · {reviewedBy ?? "dueño"} · {reviewedAt}
        </Pill>
        <Button type="button" variant="ghost" size="sm" onClick={() => set(false)} loading={pending}>
          Deshacer
        </Button>
        {error ? <span className="text-late text-[14px]">{error}</span> : null}
      </span>
    );
  }
  const closed = status === "closed";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => set(true)}
        disabled={!closed}
        loading={pending}
        title={closed ? "Revisé la evidencia de este turno" : "Cierra el turno primero"}
        icon={<Check size={18} aria-hidden />}
      >
        Marcar revisado
      </Button>
      {error ? <span className="text-late text-[14px]">{error}</span> : null}
    </span>
  );
}
