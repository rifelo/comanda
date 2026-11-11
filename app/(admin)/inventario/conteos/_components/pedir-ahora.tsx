"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { pedirConteoAgente } from "../actions";

/** «Pedir hoy» for an item whose verification expired: puts it on today's tablet list. */
export function PedirAhora({ ingredienteId, nombre }: { ingredienteId: string; nombre: string }) {
  const router = useRouter();
  const [estado, setEstado] = React.useState<"listo" | "enviando" | "hecho" | "error">("listo");
  const [error, setError] = React.useState<string | null>(null);
  if (estado === "hecho") return <span style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}>En la lista de hoy</span>;
  return (
    <span className="flex flex-col items-end" style={{ gap: 2 }}>
      <button
        type="button"
        className="cmd-btn ghost sm"
        aria-label={`Pedir hoy el conteo de ${nombre}`}
        disabled={estado === "enviando"}
        onClick={async () => {
          setEstado("enviando");
          const r = await pedirConteoAgente({ ingredienteId, detalle: "Venció sin contarse" });
          if (r.ok) {
            setEstado("hecho");
            router.refresh();
          } else {
            setEstado("error");
            setError(r.error);
          }
        }}
      >
        {estado === "enviando" ? "Pidiendo…" : "Pedir hoy"}
      </button>
      {error ? <span role="alert" style={{ fontSize: 12, color: "var(--late)" }}>{error}</span> : null}
    </span>
  );
}
