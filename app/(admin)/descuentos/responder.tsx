"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import { resolverDescuento } from "./actions";

/** Aprobar / Rechazar, with an optional note back to the register. */
export function Responder({ id }: { id: string }) {
  const router = useRouter();
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState<"si" | "no" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const go = async (aprobar: boolean) => {
    setBusy(aprobar ? "si" : "no");
    setError(null);
    const r = await resolverDescuento({ id, aprobar, respuesta: nota }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
    setBusy(null);
    if (!r.ok) setError(r.error);
    else router.refresh();
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nota (opcional)" maxLength={200} value={nota} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNota(e.target.value)} placeholder="Ej.: solo por hoy" />
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void go(true)} loading={busy === "si"} disabled={!!busy}>Aprobar descuento</Button>
        <Button type="button" variant="ghost" onClick={() => void go(false)} loading={busy === "no"} disabled={!!busy}>Rechazar</Button>
      </div>
      {error ? <span role="alert" className="text-late font-semibold">{error}</span> : null}
    </div>
  );
}
