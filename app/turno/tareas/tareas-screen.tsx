"use client";

import * as React from "react";
import { Button, Card, EmptyState, Segmented } from "@/components/ui";
import { listaTareas } from "@/lib/turno/hoy";
import { turnoProgress } from "@/lib/turno/state";
import type { TurnoBoardData } from "@/lib/turno/server";
import { EquipoShell, type EquipoActor } from "../_components/equipo";
import { TareaRow, useAutoRefresh, useTareas } from "../_components/tareas";
import { novedadCtx, TurnoSwitch } from "../hoy-screen";

const INVENTARIO_RE = /insumo|faltante|inventario|se est[aá] acabando/i;

export function TareasScreen({
  data,
  shiftId,
  now,
  serverNow,
  actor,
  ver: verInicial,
}: {
  data: TurnoBoardData;
  shiftId: string | null;
  now: string;
  serverNow: number;
  actor: EquipoActor;
  ver: "pendientes" | "hechas";
}) {
  useAutoRefresh();
  const [ver, setVer] = React.useState(verInicial);
  const shift = data.turnos.find((t) => t.instance.id === shiftId) ?? null;
  const { toggle, busyId, camera } = useTareas(shift, data.sede.id);
  const lista = React.useMemo(
    () =>
      shift
        ? listaTareas({ tasks: shift.tasks, done: (t) => !!shift.completions[t.id], adHoc: shift.adHoc, now, inicio: shift.template.inicio, fin: shift.template.fin })
        : { pendientes: [], hechas: [], atrasadas: 0 },
    [shift, now],
  );
  const prog = shift ? turnoProgress(shift.tasks, shift.completions) : null;
  const items = ver === "hechas" ? lista.hechas : lista.pendientes;
  const segmented = (
    <Segmented
      label="Filtrar"
      value={ver}
      onChange={setVer}
      options={[
        { value: "pendientes", label: "Pendientes", count: lista.pendientes.length },
        { value: "hechas", label: "Hechas", count: lista.hechas.length },
      ]}
    />
  );

  return (
    <EquipoShell
      title="Tareas"
      sub={shift ? `${shift.template.name} · ${prog?.done ?? 0} de ${prog?.total ?? 0} hechas` : data.sede.name}
      actor={actor}
      tz={data.sede.tz}
      serverNow={serverNow}
      atrasadas={lista.atrasadas}
      actions={<div className="hidden lg:block">{segmented}</div>}
      novedad={novedadCtx(shift, data.sede.tz)}
    >
      <div className="p-4 sm:p-7 flex flex-col gap-4">
        <TurnoSwitch turnos={data.turnos} currentId={shiftId} base="/turno/tareas" />
        <div className="lg:hidden">{segmented}</div>
        {!shift ? (
          <Card>
            <EmptyState title={`Hoy no hay turnos en ${data.sede.name}`} />
          </Card>
        ) : (
          <Card className="!gap-0 !py-2 !px-4 sm:!px-6" aria-label={ver === "hechas" ? "Tareas hechas" : "Tareas pendientes"}>
            {items.length ? (
              items.map((it) => (
                <TareaRow
                  key={it.id}
                  item={it}
                  shift={shift}
                  tz={data.sede.tz}
                  onToggle={toggle}
                  busy={busyId === it.id}
                  extra={
                    it.estado === "atrasada" && INVENTARIO_RE.test(it.task.title) ? (
                      <Button href="/turno/inventario" size="sm" className="hidden sm:inline-flex">
                        Abrir inventario
                      </Button>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <EmptyState
                title={ver === "hechas" ? "Todavía nada hecho" : "No queda nada pendiente"}
                text={ver === "hechas" ? "Lo que marques aparece aquí, con quién y a qué hora." : "Buen trabajo. Si sale algo, regístralo como novedad."}
              />
            )}
          </Card>
        )}
      </div>
      {camera}
    </EquipoShell>
  );
}
