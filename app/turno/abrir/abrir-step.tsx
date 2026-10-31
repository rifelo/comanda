"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, EmptyState, toast } from "@/components/ui";
import type { CajaEstado } from "@/lib/caja/estado";
import type { Bloque, ItemTarea } from "@/lib/turno/hoy";
import type { TurnoShift } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";
import { abrirTurnoAs, completeTaskAs } from "../actions";
import { CajaApp } from "../caja/_components/caja-app";
import { TareaRow, useTareas } from "../_components/tareas";

const itemDe = (t: TemplateTask, shift: TurnoShift): ItemTarea => ({ kind: "tarea", id: t.id, task: t, estado: shift.completions[t.id] ? "hecha" : "pendiente", tarde: 0 });

export function AbrirStep({
  paso,
  titulo,
  shift,
  tz,
  restaurantId,
  bloque,
  abrirTask,
  pendientesApertura,
  estado,
  actor,
  next,
  hoyHref,
}: {
  paso: string;
  titulo: string;
  shift: TurnoShift;
  tz: string;
  restaurantId: string;
  bloque: Bloque<TemplateTask> | null;
  abrirTask: TemplateTask | null;
  pendientesApertura: number;
  estado: CajaEstado | null;
  actor: { name: string; isAdmin: boolean };
  next: { href: string; label: string } | null;
  hoyHref: string;
}) {
  const router = useRouter();
  const { toggle, busyId, camera } = useTareas(shift, restaurantId);
  const [busy, setBusy] = React.useState(false);

  if (paso === "base") {
    if (estado?.porValidar) {
      return (
        <div className="flex-1 min-h-[560px] flex flex-col rounded-card border border-line overflow-hidden bg-bg">
          <CajaApp estado={estado} tz={tz} actor={actor} flow={{ doneHref: next?.href ?? hoyHref, cancelHref: next?.href ?? hoyHref, doneLabel: next?.label ?? "Listo" }} />
        </div>
      );
    }
    const prev = estado?.base.cierre ?? null;
    return (
      <Card className="flex-1">
        <h2 className="ui-h1 m-0">Validar la base</h2>
        <EmptyState
          title={prev?.base_validada_at ? "La base ya está validada" : "No hay base por validar"}
          text={prev?.base_validada_at ? `La validó ${prev.base_validada_by_name?.split(" ")[0] ?? "alguien"} antes de abrir.` : "No hay un cierre anterior con base pendiente. Si abriste con otra base, corrígela en Caja."}
        />
        <div className="flex-1" />
        <div className="flex justify-end">{next ? <Button href={next.href}>{next.label}</Button> : null}</div>
      </Card>
    );
  }

  if (bloque) {
    const hechas = bloque.tasks.filter((t) => !!shift.completions[t.id]).length;
    const listo = hechas === bloque.tasks.length;
    return (
      <Card className="flex-1 !gap-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-2">
          <h2 className="ui-h1 m-0 flex-1">{titulo}</h2>
          <span className="ui-sub text-[15px]">
            {hechas} de {bloque.tasks.length}
          </span>
        </div>
        {bloque.tasks.map((t) => (
          <TareaRow key={t.id} item={itemDe(t, shift)} shift={shift} tz={tz} onToggle={toggle} busy={busyId === t.id} />
        ))}
        <div className="flex-1" />
        <div className="flex justify-end pt-3.5">
          {next ? (
            <Button href={next.href} variant={listo ? "primary" : "ghost"}>
              {listo ? next.label : `${next.label} (faltan ${bloque.tasks.length - hechas})`}
            </Button>
          ) : null}
        </div>
        {camera}
      </Card>
    );
  }

  // «Abrir al público»
  const abrirHecha = abrirTask ? !!shift.completions[abrirTask.id] : true;
  const necesitaFoto = !!abrirTask && abrirTask.requires_photo && !abrirHecha;
  async function abrir() {
    if (busy) return;
    setBusy(true);
    try {
      if (abrirTask && !abrirHecha) {
        const r = await completeTaskAs({ shift_instance_id: shift.instance.id, template_task_id: abrirTask.id });
        if (!r.ok) throw new Error(r.error);
      }
      const r = await abrirTurnoAs({ shift_instance_id: shift.instance.id });
      if (!r.ok) throw new Error(r.error);
      toast("Turno abierto. ¡Buen turno!", "ok");
      router.push(hoyHref);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sin conexión. Intenta otra vez.", "late", 4500);
      setBusy(false);
    }
  }
  return (
    <Card className="flex-1">
      <h2 className="ui-h1 m-0">Abrir al público</h2>
      {pendientesApertura > 0 ? (
        <Banner tone="brand">
          Quedan {pendientesApertura} {pendientesApertura === 1 ? "tarea" : "tareas"} de apertura sin marcar. Puedes abrir igual; quedan en Tareas.
        </Banner>
      ) : null}
      {abrirTask ? (
        <div>
          <TareaRow item={itemDe(abrirTask, shift)} shift={shift} tz={tz} onToggle={toggle} busy={busyId === abrirTask.id} />
        </div>
      ) : (
        <p className="ui-sub m-0">Cuando todo esté listo, abre las puertas.</p>
      )}
      <div className="flex-1" />
      <Button size="lg" block onClick={() => void abrir()} loading={busy} disabled={necesitaFoto}>
        {necesitaFoto ? "Toma la foto para abrir" : "Abrir al público"}
      </Button>
      {camera}
    </Card>
  );
}
