"use client";

/**
 * ★ — per-user favorite (what the POS shows first in «Favoritos»).
 * `useOptimistic` flips the star at once and converges to the server value
 * after `revalidatePath("/productos")`.
 */
import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/feedback";
import { toggleProductoFavorite } from "../actions";

export function FavoriteToggle({ productoId, initial, name }: { productoId: string; initial: boolean; name: string }) {
  const [on, setOn] = React.useOptimistic(initial);
  const [pending, startTransition] = React.useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !on;
    startTransition(async () => {
      setOn(next);
      const res = await toggleProductoFavorite(productoId, next);
      if (!res.ok) toast(res.error ?? "No se pudo actualizar el favorito.", "late");
    });
  }

  return (
    <button
      type="button"
      aria-label={on ? `Quitar ${name} de favoritos` : `Marcar ${name} como favorito`}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "size-11 min-h-11 shrink-0 rounded-btn flex items-center justify-center bg-transparent border-0 cursor-pointer hover:bg-surface-2",
        pending && "opacity-70",
      )}
    >
      <Star size={22} aria-hidden className={on ? "text-brand fill-[var(--brand)]" : "text-muted"} />
    </button>
  );
}
