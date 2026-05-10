"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplate } from "./actions";

interface Props {
  templateId: string;
  restaurantId: string;
  shiftCount: number;
}

/**
 * Inline two-step confirmation for deleting a plantilla.
 *
 * - shiftCount === 0  → hard-delete (template_tasks cascades)
 * - shiftCount > 0    → soft-delete (active=false); historical shifts and
 *                       their reports stay intact, the template just stops
 *                       appearing in operational lists.
 *
 * The destructive copy adapts to whichever case applies, so the user knows
 * what's about to happen before confirming.
 */
export function DeleteTemplateButton({ templateId, restaurantId, shiftCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const willSoftDelete = shiftCount > 0;
  const explainer = willSoftDelete
    ? `Esta plantilla ya tiene ${shiftCount} turno${shiftCount === 1 ? "" : "s"} registrado${shiftCount === 1 ? "" : "s"}. Se desactivará — los turnos y reportes históricos se conservan.`
    : "Esta plantilla no se ha usado todavía. Se eliminará permanentemente junto con sus tareas.";

  function onConfirm() {
    setError(null);
    const fd = new FormData();
    fd.set("template_id", templateId);
    startTransition(async () => {
      const r = await deleteTemplate(null, fd);
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      router.push(`/restaurants/${restaurantId}`);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="cmd-btn ghost sm"
          style={{ color: "var(--red)", borderColor: "var(--red)" }}
        >
          Eliminar plantilla
        </button>
        {error ? (
          <span
            role="alert"
            style={{ color: "var(--red)", fontSize: 11 }}
          >
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-end gap-2"
      style={{ maxWidth: 360 }}
    >
      <p
        className="text-muted text-right"
        style={{ fontSize: 11, lineHeight: 1.4 }}
      >
        {explainer}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="cmd-btn ghost sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="cmd-btn red sm"
        >
          {pending
            ? "Eliminando…"
            : willSoftDelete
              ? "Confirmar · desactivar"
              : "Confirmar · eliminar"}
        </button>
      </div>
    </div>
  );
}
