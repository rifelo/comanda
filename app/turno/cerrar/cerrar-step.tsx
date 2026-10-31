"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check as CheckIcon, MessageSquarePlus } from "lucide-react";
import { Button, Card, EmptyState, Pill, Segmented, buttonClass, toast } from "@/components/ui";
import type { CajaEstado } from "@/lib/caja/estado";
import type { Bloque, ItemTarea } from "@/lib/turno/hoy";
import type { TurnoShift } from "@/lib/turno/server";
import type { TemplateTask } from "@/lib/types";
import { signOutLocal } from "@/app/login/actions";
import { closeTurnoAs } from "../actions";
import { CajaApp } from "../caja/_components/caja-app";
import { plata } from "../caja/_components/model";
import { ConteoScreen } from "../conteo/conteo-screen";
import { NovedadSheet } from "../_components/equipo";
import { TareaRow, useTareas } from "../_components/tareas";
import { horaDe } from "../_components/time";

export interface Resumen {
  turno: string;
  quien: string;
  /** ISO close time (null while open). */
  hora: string | null;
  tareas: { hechas: number; total: number };
  caja: { contado: number; diferencia: number | null } | null;
  base: { monto: number; lista: boolean } | null;
  conteo: "enviado" | "pendiente" | "no-toca";
  novedades: number;
}

const itemDe = (t: TemplateTask, shift: TurnoShift): ItemTarea => ({ kind: "tarea", id: t.id, task: t, estado: shift.completions[t.id] ? "hecha" : "pendiente", tarde: 0 });

/** The receipt rows (entregar step and «Turno entregado»). */
function ResumenRows({ r }: { r: Resumen }) {
  const pend = r.tareas.total - r.tareas.hechas;
  const row = (title: string, value: React.ReactNode, pill?: React.ReactNode) => (
    <div className="flex items-center gap-3 min-h-16 py-2 border-b border-line last:border-b-0">
      <p className="ui-title m-0 flex-1">{title}</p>
      {value != null ? <span className="ui-sub text-[15px] ui-num">{value}</span> : null}
      {pill}
    </div>
  );
  return (
    <div className="flex flex-col">
      {row("Tareas", `${r.tareas.hechas} de ${r.tareas.total}`, pend > 0 ? <Pill tone="brand">{pend} {pend === 1 ? "pendiente" : "pendientes"}</Pill> : <Pill tone="ok">Completas</Pill>)}
      {row(
        "Caja",
        r.caja ? `Contado ${plata(r.caja.contado)}` : null,
        !r.caja ? (
          <Pill tone="late">Sin arqueo</Pill>
        ) : r.caja.diferencia == null ? (
          <Pill>Sin ventas para comparar</Pill>
        ) : r.caja.diferencia === 0 ? (
          <Pill tone="ok">Cuadra</Pill>
        ) : r.caja.diferencia < 0 ? (
          <Pill tone="late">Faltan {plata(-r.caja.diferencia)}</Pill>
        ) : (
          <Pill tone="brand">Sobran {plata(r.caja.diferencia)}</Pill>
        ),
      )}
      {row("Base para mañana", r.base ? plata(r.base.monto) : null, r.base?.lista ? <Pill tone="ok">Lista</Pill> : <Pill tone="brand">Sin confirmar</Pill>)}
      {r.conteo !== "no-toca" ? row("Conteo rápido", null, r.conteo === "enviado" ? <Pill tone="ok">Enviado</Pill> : <Pill tone="brand">Pendiente</Pill>) : null}
      {row("Novedades", String(r.novedades))}
    </div>
  );
}

export function CerrarStep({
  paso,
  shift,
  tz,
  restaurantId,
  zonas,
  pendientesAntes,
  conteo,
  estado,
  actor,
  resumen,
  next,
  autoHref,
  finHref,
  tareasHref,
}: {
  paso: string;
  shift: TurnoShift;
  tz: string;
  restaurantId: string;
  zonas: Bloque<TemplateTask>[];
  pendientesAntes: TemplateTask[];
  conteo: { debe: boolean; hecho: boolean; nombre: string; props: React.ComponentProps<typeof ConteoScreen> | null };
  estado: CajaEstado | null;
  actor: { name: string; isAdmin: boolean };
  resumen: Resumen;
  next: { href: string; label: string } | null;
  autoHref: string;
  finHref: string;
  tareasHref: string;
}) {
  const router = useRouter();
  const { toggle, busyId, camera } = useTareas(shift, restaurantId);
  const segs = React.useMemo(
    () => [
      ...(pendientesAntes.length ? [{ key: "antes", titulo: "Pendientes", tasks: pendientesAntes }] : []),
      ...zonas,
    ],
    [zonas, pendientesAntes],
  );
  const firstOpen = segs.find((s) => s.tasks.some((t) => !shift.completions[t.id]))?.key ?? segs[0]?.key ?? "";
  const [seg, setSeg] = React.useState(firstOpen);
  const [novOpen, setNovOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (paso === "tareas") {
    const cur = segs.find((s) => s.key === seg) ?? segs[0] ?? null;
    const total = zonas.reduce((n, z) => n + z.tasks.length, 0);
    const hechas = zonas.reduce((n, z) => n + z.tasks.filter((t) => !!shift.completions[t.id]).length, 0);
    return (
      <Card className="flex-1 !gap-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pb-2">
          <h2 className="ui-h1 m-0 flex-1 min-w-[200px]">Tareas de cierre</h2>
          {segs.length > 1 ? (
            <Segmented
              label="Bloque"
              value={cur?.key ?? ""}
              onChange={setSeg}
              options={segs.map((s) => {
                const left = s.tasks.filter((t) => !shift.completions[t.id]).length;
                return { value: s.key, label: left === 0 ? `${s.titulo} ✓` : s.key === "antes" ? `${s.titulo} · ${left}` : s.titulo };
              })}
            />
          ) : null}
        </div>
        {cur ? cur.tasks.map((t) => <TareaRow key={t.id} item={itemDe(t, shift)} shift={shift} tz={tz} onToggle={toggle} busy={busyId === t.id} />) : <EmptyState title="Este turno no tiene tareas de cierre" />}
        <div className="flex-1" />
        <div className="flex flex-wrap items-center justify-end gap-3 pt-3.5">
          <span className="ui-sub mr-auto">
            {hechas} de {total} de cierre
          </span>
          {next ? (
            <Button href={next.href} variant={hechas >= total ? "primary" : "ghost"}>
              {next.label}
            </Button>
          ) : null}
        </div>
        {camera}
      </Card>
    );
  }

  if (paso === "conteo") {
    if (conteo.props) {
      return (
        <div className="flex-1 min-h-[560px] rounded-card border border-line overflow-auto bg-bg">
          <ConteoScreen {...conteo.props} siguiente={next ?? undefined} />
        </div>
      );
    }
    return (
      <Card className="flex-1">
        <h2 className="ui-h1 m-0">Conteo rápido</h2>
        <EmptyState
          title={!conteo.debe ? "Hoy el conteo lo hace el turno que cierra el local" : "El conteo de hoy ya se envió"}
          text={!conteo.debe ? "Tu turno no termina de último: sigue con la caja." : "Lo revisa el dueño desde el panel."}
        />
        <div className="flex-1" />
        <div className="flex justify-end">{next ? <Button href={next.href}>{next.label}</Button> : null}</div>
      </Card>
    );
  }

  if ((paso === "arqueo" || paso === "base") && estado) {
    return (
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex-1 min-h-[600px] flex flex-col rounded-card border border-line overflow-hidden bg-bg">
          <CajaApp estado={estado} tz={tz} actor={actor} inicial="arqueo" flow={{ doneHref: autoHref, cancelHref: tareasHref, doneLabel: "Siguiente: entregar" }} />
        </div>
      </div>
    );
  }

  // Entregar
  async function entregar() {
    if (busy) return;
    setBusy(true);
    const r = await closeTurnoAs({ shift_instance_id: shift.instance.id }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
    if (!r.ok) {
      toast(r.error, "late", 4500);
      setBusy(false);
      return;
    }
    router.push(finHref);
  }
  return (
    <Card className="flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="ui-h1 m-0 flex-1">Entregar el turno</h2>
        <Button variant="ghost" size="sm" icon={<MessageSquarePlus size={20} aria-hidden />} onClick={() => setNovOpen(true)}>
          Novedad
        </Button>
      </div>
      <p className="ui-sub m-0">Revisa el recibo. Lo que quedó pendiente o pasó en el turno, déjalo como novedad para quien sigue.</p>
      <ResumenRows r={resumen} />
      {shift.novedades.length ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {shift.novedades.slice(0, 3).map((n) => (
            <li key={n.id} className="rounded-btn bg-surface-2 px-4 py-3">
              <p className="m-0 text-[15px] whitespace-pre-wrap">{n.body}</p>
              <p className="m-0 mt-1 ui-sub">
                {(n.submitted_by_name ?? "—").split(" ")[0]} · {horaDe(n.submitted_at, tz)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex-1" />
      <Button size="lg" block loading={busy} onClick={() => void entregar()} disabled={shift.instance.status === "closed"}>
        {shift.instance.status === "closed" ? "Turno ya entregado" : "Entregar el turno"}
      </Button>
      <NovedadSheet
        open={novOpen}
        onClose={() => setNovOpen(false)}
        ctx={{ shiftId: shift.instance.id, turnoName: shift.template.name, tz, items: shift.novedades }}
      />
    </Card>
  );
}

/** «Turno entregado» (reference board 11): receipt + «Salir de la tablet» (ends this person's session, keeps the pairing). */
export function Entregado({ resumen, tz, viaDevice, hoyHref }: { resumen: Resumen; tz: string; viaDevice: boolean; hoyHref: string }) {
  return (
    <div className="min-h-dvh bg-bg text-text flex items-center justify-center p-4 sm:p-7">
      <Card className="w-full max-w-[680px] !p-6 sm:!p-9 !gap-[18px]" aria-labelledby="entregado">
        <div className="flex items-center gap-4">
          <span className="size-14 shrink-0 rounded-full bg-ok text-on-strong flex items-center justify-center" aria-hidden>
            <CheckIcon size={28} strokeWidth={3} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 id="entregado" className="ui-h1 m-0">
              Turno entregado
            </h1>
            <p className="ui-sub m-0 text-[15px]">
              {resumen.turno} · {resumen.quien}
              {resumen.hora ? ` · ${horaDe(resumen.hora, tz)}` : ""}
            </p>
          </div>
        </div>
        <ResumenRows r={resumen} />
        <form action={signOutLocal}>
          <button type="submit" className={buttonClass({ size: "lg", block: true })}>
            {viaDevice ? "Salir de la tablet" : "Cerrar sesión"}
          </button>
        </form>
        <Link href={hoyHref} className="self-center text-[15px] font-semibold text-muted no-underline min-h-11 inline-flex items-center">
          Volver a Hoy
        </Link>
      </Card>
    </div>
  );
}
