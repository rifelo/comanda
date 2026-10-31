"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductoFicha } from "@/lib/db/recetas";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, toast } from "@/components/ui/feedback";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { toggleGrupoModificador } from "../actions";

/**
 * Which modifier groups the POS asks for when this product is tapped
 * («Base: en agua / en leche»). Groups themselves are edited in /modificadores.
 */
export function ModificadoresTab({ ficha }: { ficha: ProductoFicha }) {
  const router = useRouter();
  const [on, setOn] = React.useState<Record<string, boolean>>(() => Object.fromEntries(ficha.grupos.map((g) => [g.id, g.aplicado])));
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggle(id: string) {
    const next = !on[id];
    setOn((o) => ({ ...o, [id]: next }));
    setBusy(id);
    const r = await toggleGrupoModificador({ producto_id: ficha.producto.id, group_id: id, on: next });
    setBusy(null);
    if (!r.ok) {
      setOn((o) => ({ ...o, [id]: !next }));
      return toast(r.error, "late");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {ficha.grupos.length === 0 ? (
        <EmptyState title="No hay modificadores" text="Crea grupos como «Base: en agua / en leche» y aplícalos aquí." />
      ) : (
        <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
          {ficha.grupos.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3 min-h-[76px] border-b border-line last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="ui-title flex items-center gap-2">
                  {g.name} {g.required ? <Pill>obligatorio</Pill> : null}
                </div>
                <div className="ui-sub truncate">{g.opciones.length ? g.opciones.join(" · ") : "Sin opciones"}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(on[g.id])}
                aria-label={`Aplicar ${g.name}`}
                disabled={busy === g.id}
                onClick={() => toggle(g.id)}
                className={cn("relative h-8 w-14 shrink-0 rounded-full border-0 cursor-pointer transition-colors", on[g.id] ? "bg-ok" : "bg-line")}
              >
                <span aria-hidden className={cn("absolute top-1 size-6 rounded-full bg-surface shadow transition-[left]", on[g.id] ? "left-7" : "left-1")} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link href="/modificadores" className={buttonClass({ variant: "ghost", size: "sm" })}>
        Editar grupos y opciones
      </Link>
    </div>
  );
}
