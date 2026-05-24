"use client";

/**
 * FavoriteToggle — star button that persists per-user favorites.
 *
 * Mirrors the visuals of `StarFav` in `_components/chip.tsx` but wires the
 * click into the `toggleProductoFavorite` server action with React 19's
 * `useOptimistic` so the star flips instantly and rolls back on error.
 *
 * `useOptimistic` automatically resyncs with the `initial` prop on each
 * server-driven re-render (after `revalidatePath("/catalogo")`), so the
 * star always converges to server truth without extra wiring.
 */
import * as React from "react";
import { toggleProductoFavorite } from "./actions";

export function FavoriteToggle({
  productoId,
  initial,
  size = 16,
}: {
  productoId: string;
  initial: boolean;
  size?: number;
}) {
  const [optimisticOn, setOptimisticOn] = React.useOptimistic(initial);
  const [pending, startTransition] = React.useTransition();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function onClick() {
    if (pending) return;
    const next = !optimisticOn;
    setErrorMsg(null);
    startTransition(async () => {
      setOptimisticOn(next);
      const res = await toggleProductoFavorite(productoId, next);
      if (!res.ok) {
        // optimistic value is discarded automatically when the transition
        // ends without a server-state change; surface the error so the
        // user knows the click didn't stick.
        setErrorMsg(res.error ?? "No se pudo actualizar el favorito.");
      }
    });
  }

  const on = optimisticOn;

  return (
    <button
      type="button"
      aria-label="favorito"
      aria-pressed={on}
      title={errorMsg ?? undefined}
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: pending ? "wait" : "pointer",
        color: on ? "var(--red)" : "var(--rule)",
        lineHeight: 1,
        fontSize: size,
        minHeight: 0,
        // Subtle hint that the click is in flight without hiding the
        // optimistic state.
        opacity: pending ? 0.7 : 1,
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
