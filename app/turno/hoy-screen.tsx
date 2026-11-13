"use client";

import { VINCULOS, esVinculo } from "@/lib/turno/vinculo-info";
import * as React from "react";
import Link from "next/link";
import { Button, Card, EmptyState, LinkCard, Money, Pill, ProgressBar, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ahora, faltanLabel, hhmm, horaApertura, listaTareas, type ItemTarea } from "@/lib/turno/hoy";
import { turnoProgress } from "@/lib/turno/state";
import type { TurnoBoardData, TurnoShift } from "@/lib/turno/server";
import type { HoyExtras } from "@/lib/turno/reads";
import { EquipoShell, type EquipoActor, type NovedadCtx } from "./_components/equipo";
import { TareaRow, useAutoRefresh, useTareas } from "./_components/tareas";

const INVENTARIO_RE = /insumo|faltante|inventario|se est[aá] acabando/i;

export function novedadCtx(shift: TurnoShift | null, tz: string): NovedadCtx | null {
  return shift ? { shiftId: shift.instance.id, turnoName: `${shift.template.name} · ${hhmm(shift.template.inicio)} – ${hhmm(shift.template.fin)}`, tz, items: shift.novedades } : null;
}

export function turnoSub(shift: TurnoShift | null, sede: string): string {
  return shift ? `${shift.template.name} · ${hhmm(shift.template.inicio)} – ${hhmm(shift.template.fin)}` : sede;
}

/** Today's other turnos, one tap away (only when there are several). */
export function TurnoSwitch({ turnos, currentId, base }: { turnos: TurnoShift[]; currentId: string | null; base: string }) {
  if (turnos.length < 2) return null;
  return (
    <nav aria-label="Turnos de hoy" className="ui-scroll-x flex gap-2 -mx-1 px-1">
      {turnos.map((t) => {
        const on = t.instance.id === currentId;
        return (
          <Link
            key={t.instance.id}
            href={`${base}?turno=${t.instance.id}`}
            aria-current={on ? "true" : undefined}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 h-11 min-h-11 px-4 rounded-full text-[15px] font-semibold no-underline whitespace-nowrap border",
              on ? "bg-strong text-on-strong border-strong" : "bg-surface text-text border-line hover:bg-surface-2",
            )}
          >
            {t.template.name}
            <span className={cn("text-[13px] font-normal ui-num", on ? "opacity-80" : "text-muted")}>
              {hhmm(t.template.inicio)}–{hhmm(t.template.fin)}
              {t.instance.status === "closed" ? " · cerrado" : ""}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function HoyScreen({
  data,
  shiftId,
  now,
  serverNow,
  extras,
  actor,
  novedadAbierta,
}: {
  data: TurnoBoardData;
  shiftId: string | null;
  now: string;
  serverNow: number;
  extras: HoyExtras;
  actor: EquipoActor;
  novedadAbierta?: boolean;
}) {
  useAutoRefresh();
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
  const top = ahora(lista.pendientes);
  const closed = shift?.instance.status === "closed";
  const opened = !!shift?.instance.opened_by;
  const apertura = shift ? horaApertura(shift.tasks, shift.template.inicio) : "";
  // Before anyone opened it and still before the doors open (or barely after): offer the guided opening.
  const ofrecerAbrir = !!shift && !closed && !opened;
  const q = shift ? `?turno=${shift.instance.id}` : "";

  const row = (it: ItemTarea) => <TareaRow key={it.id} item={it} shift={shift!} tz={data.sede.tz} onToggle={toggle} busy={busyId === it.id} />;

  return (
    <EquipoShell
      title="Hoy"
      sub={turnoSub(shift, data.sede.name)}
      actor={actor}
      tz={data.sede.tz}
      serverNow={serverNow}
      atrasadas={lista.atrasadas}
      novedad={novedadCtx(shift, data.sede.tz)}
      novedadAbierta={novedadAbierta}
    >
      <div className="p-4 sm:p-7 flex flex-col gap-4 sm:gap-5 min-h-full">
        <TurnoSwitch turnos={data.turnos} currentId={shiftId} base="/turno" />
        {!shift ? (
          <Card>
            <EmptyState title={`Hoy no hay turnos en ${data.sede.name}`} text="Cuando el dueño programe un turno para hoy, aparece aquí con sus tareas." />
          </Card>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 sm:gap-5 md:items-stretch flex-1">
            <Card className="flex-1 min-w-0 !gap-1.5" aria-labelledby="hoy-ahora">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2.5">
                <h2 id="hoy-ahora" className="ui-h1 m-0 flex-1">
                  {closed ? "Turno cerrado" : "Ahora"}
                </h2>
                {prog ? (
                  <>
                    <span className="ui-sub text-[15px]">
                      {prog.done} de {prog.total} tareas
                    </span>
                    <ProgressBar value={prog.total ? prog.done / prog.total : 0} label={`${prog.pct} por ciento`} className="w-full sm:w-40" />
                  </>
                ) : null}
              </div>

              {ofrecerAbrir ? (
                <LinkCard
                  href={`/turno/abrir${q}`}
                  title="Abrir el turno"
                  sub={`${apertura ? `Abres al público a las ${apertura} · ${faltanLabel(now, apertura).toLowerCase()}` : "Base, encendido y tareas de apertura"}`}
                  className="bg-brand-soft border-transparent mb-2"
                />
              ) : null}

              {top.destacada ? (
                <div className={cn("rounded-[14px] px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4", top.destacada.estado === "atrasada" ? "bg-late-soft" : "bg-brand-soft")}>
                  <div className="flex-1 min-w-0">
                    {top.destacada.estado === "atrasada" ? (
                      <Pill tone="late">
                        Atrasada{top.destacada.task.due_time ? ` · ${hhmm(top.destacada.task.due_time)}` : ""}
                      </Pill>
                    ) : (
                      <Pill tone="brand">Inmediata</Pill>
                    )}
                    <p className="ui-title text-[20px] mt-2 mb-0">{top.destacada.task.title}</p>
                    {top.destacada.task.instructions ? <p className="ui-desc-full mt-1 mb-0">{top.destacada.task.instructions}</p> : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {INVENTARIO_RE.test(top.destacada.task.title) ? (
                      <Button href="/turno/inventario" size="sm">
                        Abrir inventario
                      </Button>
                    ) : null}
                    <TareaActions item={top.destacada} shift={shift} onToggle={toggle} busy={busyId === top.destacada.id} />
                  </div>
                </div>
              ) : null}

              {top.siguientes.length ? (
                <div className="mt-1.5">{top.siguientes.map(row)}</div>
              ) : !top.destacada ? (
                <EmptyState
                  title={closed ? "Este turno ya se entregó" : prog && prog.total > 0 && prog.done === prog.total ? "Todo hecho" : "Nada pendiente por ahora"}
                  text={closed ? `Lo cerró ${shift.closed_by_name?.split(" ")[0] ?? "—"}.` : "Las tareas aparecen aquí a medida que se acerca su hora."}
                />
              ) : null}

              <div className="flex-1" />
              <Link href={`/turno/tareas${q}`} className="text-[15px] font-semibold no-underline text-text pt-2 self-start min-h-11 inline-flex items-center">
                Ver todas las tareas →
              </Link>
            </Card>

            <div className="w-full md:w-[320px] lg:w-[380px] shrink-0 flex flex-col gap-4 sm:gap-5">
              <Card aria-labelledby="hoy-caja">
                <span id="hoy-caja" className="ui-label">
                  Debería haber en caja
                </span>
                <Money value={extras.caja.esperado} className="text-[40px] sm:text-[48px] font-bold leading-none tracking-[-0.02em]" />
                {extras.caja.porValidar ? <Pill tone="brand">Falta validar la base</Pill> : null}
                <div className="grid grid-cols-2 gap-2.5">
                  <Link href="/turno/caja?mov=entrada" className={buttonClass({ variant: "ghost" })}>
                    + Entrada
                  </Link>
                  <Link href="/turno/caja?mov=salida" className={buttonClass({ variant: "ghost" })}>
                    − Salida
                  </Link>
                </div>
              </Card>

              <LinkCard
                href="/turno/inventario"
                title={extras.acabando.n ? `${extras.acabando.n} ${extras.acabando.n === 1 ? "se está acabando" : "se están acabando"}` : "Nada se está acabando"}
                sub={extras.acabando.n ? extras.acabando.nombres.slice(0, 4).join(", ") : "Avisa aquí si algo falta"}
                tone="neutral"
              />

              {closed ? (
                <LinkCard href={`/turno/cerrar${q}&paso=fin`} title="Turno entregado" sub={`${shift.template.name} · lo cerró ${shift.closed_by_name?.split(" ")[0] ?? "—"}`} tone="ok" />
              ) : (
                <LinkCard href={`/turno/cerrar${q}`} title={`Cierre a las ${hhmm(shift.template.fin)}`} sub="Tareas, conteo, arqueo y entrega" />
              )}
            </div>
          </div>
        )}
      </div>
      {camera}
    </EquipoShell>
  );
}

/** The check of a highlighted item (outside a Row). */
function TareaActions({ item, shift, onToggle, busy }: { item: ItemTarea; shift: TurnoShift; onToggle: (i: ItemTarea) => void; busy: boolean }) {
  const photo = item.kind === "tarea" && item.task.requires_photo;
  return (
    <Button
      variant="strong"
      size="sm"
      loading={busy}
      disabled={shift.instance.status === "closed"}
      onClick={() => onToggle(item)}
    >
      {item.kind === "tarea" && esVinculo(item.task.vinculo) ? VINCULOS[item.task.vinculo].boton : photo ? "Tomar foto" : "Hecha"}
    </Button>
  );
}
