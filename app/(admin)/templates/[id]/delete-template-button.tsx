"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [redirecting, setRedirecting] = useState(false);

  // Navigation runs in useEffect — calling router.push (and especially
  // router.push + router.refresh) inside startTransition keeps the
  // transition pending forever on Next 16 + React 19, locking the button
  // on "Eliminando…" even after the action returns ok. See
  // app/(admin)/restaurants/new/new-restaurant-form.tsx for the same fix.
  useEffect(() => {
    if (redirecting) router.push(`/restaurants/${restaurantId}`);
  }, [redirecting, restaurantId, router]);

  const willSoftDelete = shiftCount > 0;
  const explainer = willSoftDelete
    ? `Esta plantilla ya tiene ${shiftCount} turno${shiftCount === 1 ? "" : "s"} registrado${shiftCount === 1 ? "" : "s"}. Se desactivará — los turnos y reportes históricos se conservan.`
    : "Esta plantilla no se ha usado todavía. Se eliminará permanentemente junto con sus tareas.";

  const busy = pending || redirecting;

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
      setRedirecting(true);
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
          disabled={busy}
          className="cmd-btn ghost sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="cmd-btn red sm"
        >
          {busy
            ? "Eliminando…"
            : willSoftDelete
              ? "Confirmar · desactivar"
              : "Confirmar · eliminar"}
        </button>
      </div>
    </div>
  );
}
