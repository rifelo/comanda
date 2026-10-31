"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { AppShell, Banner, Button, Chip, Chips, Sheet, TextArea, TopBar, toast } from "@/components/ui";
import { EQUIPO_TABS, type NavItem } from "@/lib/nav/items";
import { TIPOS_NOVEDAD, cuerpoNovedad, type TipoNovedad } from "@/lib/turno/hoy";
import { signOut, signOutLocal } from "@/app/login/actions";
import { submitNovedadAs } from "../actions";
import { horaDe } from "./time";

export type EquipoActor = { name: string; role: "admin" | "staff"; viaDevice: boolean };

export type NovedadCtx = {
  shiftId: string;
  turnoName: string;
  tz: string;
  items: Array<{ id: string; body: string; submitted_at: string; submitted_by_name: string | null }>;
};

/**
 * Frame of every tabbed /turno screen (PLAN §2.2): header (logo · title ·
 * sub · actions · Novedad · avatar → profile · clock), content, bottom tabs
 * with the late-task badge on «Tareas». The flows (/turno/abrir, /cerrar)
 * don't use it.
 */
export function EquipoShell({
  title,
  sub,
  actor,
  tz,
  serverNow,
  atrasadas = 0,
  actions,
  novedad,
  novedadAbierta,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actor: EquipoActor;
  tz: string;
  serverNow: number;
  atrasadas?: number;
  actions?: React.ReactNode;
  /** The turno a «Novedad» is written on; the button hides without one. */
  novedad?: NovedadCtx | null;
  /** `?novedad=1` (old /shift/[id]/novedades links) opens the sheet on arrival. */
  novedadAbierta?: boolean;
  children: React.ReactNode;
}) {
  const [novOpen, setNovOpen] = React.useState(!!novedadAbierta && !!novedad);
  const nav: NavItem[] = React.useMemo(() => EQUIPO_TABS.map((t) => (t.id === "tareas" && atrasadas > 0 ? { ...t, badge: atrasadas } : t)), [atrasadas]);
  const profile = { name: actor.name || "—", role: actor.role };
  const actionsForSheet = {
    switchPerson: signOutLocal,
    // A personal phone ends the session everywhere; the shop tablet only drops this person.
    signOut: actor.viaDevice ? signOutLocal : signOut,
  };
  return (
    <>
      <AppShell
        variant="equipo"
        nav={nav}
        profile={profile}
        actions={actionsForSheet}
        header={(profileButton) => (
          <TopBar
            title={title}
            sub={sub}
            logoHref="/turno"
            clock={{ tz, serverNow }}
            actions={
              <>
                {actions}
                {novedad ? (
                  <Button variant="ghost" size="sm" onClick={() => setNovOpen(true)} icon={<MessageSquarePlus size={20} aria-hidden />} aria-label="Nueva novedad">
                    <span className="hidden sm:inline">Novedad</span>
                  </Button>
                ) : null}
              </>
            }
            whoSlot={profileButton}
          />
        )}
      >
        {children}
      </AppShell>
      {novedad ? <NovedadSheet open={novOpen} onClose={() => setNovOpen(false)} ctx={novedad} /> : null}
    </>
  );
}

/** «Nueva novedad» (reference board 3): type chips, what happened, Guardar; this turno's log below. */
export function NovedadSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: NovedadCtx }) {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<TipoNovedad | null>(null);
  const [texto, setTexto] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const body = cuerpoNovedad(tipo, texto);
  const listo = texto.trim().length >= 3;

  async function guardar() {
    if (!listo || busy) return;
    setBusy(true);
    setError(null);
    const r = await submitNovedadAs({ shift_instance_id: ctx.shiftId, body }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }));
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTexto("");
    setTipo(null);
    toast("Novedad guardada", "ok");
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva novedad"
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={() => void guardar()} loading={busy} disabled={!listo}>
            Guardar
          </Button>
        </>
      }
    >
      <p className="ui-sub m-0">{ctx.turnoName}</p>
      <Chips label="Tipo">
        {TIPOS_NOVEDAD.map((t) => (
          <Chip key={t} pressed={tipo === t} onClick={() => setTipo(tipo === t ? null : t)}>
            {t}
          </Chip>
        ))}
      </Chips>
      <TextArea label="¿Qué pasó?" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1900} placeholder="Qué pasó, qué falta, qué se dañó…" />
      {/* TODO(P1): «Foto» needs a photo column on `novedades` (no migrations in this phase). */}
      {error ? <Banner tone="late">{error}</Banner> : null}
      {ctx.items.length ? (
        <div className="flex flex-col gap-2">
          <span className="ui-label">En este turno · {ctx.items.length}</span>
          <ul className="m-0 p-0 list-none flex flex-col">
            {ctx.items.map((n) => (
              <li key={n.id} className="py-3 border-b border-line last:border-b-0">
                <p className="m-0 text-base leading-snug whitespace-pre-wrap">{n.body}</p>
                <p className="m-0 mt-1 ui-sub">
                  {(n.submitted_by_name ?? "—").split(" ")[0]} · {horaDe(n.submitted_at, ctx.tz)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}
