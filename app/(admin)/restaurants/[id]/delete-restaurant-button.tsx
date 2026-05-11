"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRestaurant } from "./actions";

interface ImpactCounts {
  templates: number;
  shifts: number;
  completions: number;
  novedades: number;
  members: number;
}

interface Props {
  restaurantId: string;
  restaurantName: string;
  impact: ImpactCounts;
}

/**
 * Two-stage destructive flow for deleting a restaurant.
 *
 * Stage 1: red ghost button "Eliminar restaurante".
 * Stage 2: confirmation panel with the cascade impact summary + a typed
 *          name match input. The "Eliminar definitivamente" button stays
 *          disabled until the typed value === restaurantName exactly.
 *
 * Typed-name confirmation is intentional — every other destructive action
 * in the app uses a one-click "are you sure?", but a restaurant delete
 * wipes out templates, shifts, completions, novedades, members, and
 * photos. The friction is the feature.
 */
export function DeleteRestaurantButton({
  restaurantId,
  restaurantName,
  impact,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === restaurantName;

  function onConfirm() {
    if (!matches) return;
    setError(null);
    const fd = new FormData();
    fd.set("restaurant_id", restaurantId);
    fd.set("confirm_name", typed.trim());
    startTransition(async () => {
      const r = await deleteRestaurant(null, fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo eliminar.");
        return;
      }
      router.push("/restaurants");
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
          Eliminar restaurante
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
      style={{
        border: "1.5px solid var(--red)",
        background: "var(--paper-lt)",
        padding: 16,
        maxWidth: 420,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--red)",
          marginBottom: 8,
        }}
      >
        Acción permanente
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.4, margin: 0 }}>
        Vas a eliminar <strong>{restaurantName}</strong> y{" "}
        <em>todos sus datos</em>. Esta acción no se puede deshacer.
      </p>

      <ul
        className="text-muted"
        style={{
          marginTop: 10,
          padding: 0,
          listStyle: "none",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <Bullet count={impact.templates} singular="plantilla" plural="plantillas" />
        <Bullet count={impact.shifts} singular="turno" plural="turnos" />
        <Bullet
          count={impact.completions}
          singular="tarea completada"
          plural="tareas completadas"
        />
        <Bullet count={impact.novedades} singular="novedad" plural="novedades" />
        <Bullet
          count={impact.members}
          singular="staff con acceso a esta sede"
          plural="staff con acceso a esta sede"
        />
        <li>· las fotos de evidencia subidas a este restaurante</li>
      </ul>

      <p
        className="text-muted"
        style={{ fontSize: 11, marginTop: 12, lineHeight: 1.4 }}
      >
        Para continuar, escribe exactamente el nombre del restaurante:
      </p>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 600,
          marginTop: 4,
        }}
      >
        {restaurantName}
      </div>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={pending}
        autoFocus
        className="block w-full bg-transparent outline-none"
        style={{
          borderBottom: `1.5px solid ${matches ? "var(--red)" : "var(--ink)"}`,
          padding: "6px 0",
          marginTop: 6,
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
        aria-label="Nombre del restaurante para confirmar"
      />

      {error ? (
        <p
          role="alert"
          style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2" style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          disabled={pending}
          className="cmd-btn ghost sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!matches || pending}
          className="cmd-btn red sm"
          style={{ flex: 1 }}
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      </div>
    </div>
  );
}

function Bullet({
  count,
  singular,
  plural,
}: {
  count: number;
  singular: string;
  plural: string;
}) {
  if (count === 0) return null;
  return (
    <li>
      · {count} {count === 1 ? singular : plural}
    </li>
  );
}
