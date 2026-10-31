"use client";

import * as React from "react";
import { KeyRound, UserPlus } from "lucide-react";
import type { RosterMember } from "@/lib/types";
import { Avatar, Banner, Button, Field, Pill, Segmented, Sheet, toast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ACCESO, PASSWORD_MIN, sugerirContrasena, type Acceso } from "../_lib/acceso";
import { createMemberWithPassword, inviteMember, removeMember, setMemberPassword, updateMember } from "../_actions";

export type Persona = RosterMember & { acceso: Acceso };
type Modo = "password" | "invite";

/**
 * Personas: one row per person (avatar, name, role, how they sign in).
 * Tapping a row opens a sheet to edit the name / phone, set or reset the
 * password, deactivate or remove. «Nueva persona» creates the account with a
 * password (default — what the shared tablet needs) or invites a Google one.
 */
export function EquipoClient({ initial, meId, sedeName }: { initial: Persona[]; meId: string; sedeName: string }) {
  const [people, setPeople] = React.useState(initial);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const open = people.find((p) => p.id === openId) ?? null;

  const activos = people.filter((p) => p.active);
  const inactivos = people.filter((p) => !p.active);
  const sinTablet = activos.filter((p) => !ACCESO[p.acceso].tablet);

  const patch = (id: string, p: Partial<Persona>) => setPeople((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="ui-sub m-0 flex-1 min-w-[200px]">
          {activos.length} {activos.length === 1 ? "persona activa" : "personas activas"}
          {inactivos.length ? ` · ${inactivos.length} inactiva${inactivos.length === 1 ? "" : "s"}` : ""}
        </p>
        <Button onClick={() => setAdding(true)} icon={<UserPlus size={20} aria-hidden />} size="sm">
          Nueva persona
        </Button>
      </div>

      {sinTablet.length ? (
        <Banner tone="brand">
          {sinTablet.length === 1
            ? `${sinTablet[0].name} no tiene contraseña: en la tablet de ${sedeName} no puede entrar con su ficha. Tócala y ponle una.`
            : `${sinTablet.length} personas no tienen contraseña: en la tablet de ${sedeName} no pueden entrar con su ficha. Tócalas y ponles una.`}
        </Banner>
      ) : null}

      <Lista titulo="Activas" people={activos} meId={meId} onOpen={setOpenId} />
      {inactivos.length ? <Lista titulo="Inactivas" people={inactivos} meId={meId} onOpen={setOpenId} muted /> : null}

      <p className="ui-sub m-0 text-[13px] leading-relaxed">
        En la tablet y la caja cada persona toca su ficha y escribe su contraseña. En su teléfono entra con su correo y contraseña,
        o con Google si usa el mismo correo. La contraseña se entrega en persona; puedes cambiarla cuando quieras.
      </p>

      <NuevaPersona
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(m, acceso) => {
          setPeople((prev) => [...prev.filter((x) => x.id !== m.id), { ...m, acceso }].sort((a, b) => a.name.localeCompare(b.name, "es")));
          setAdding(false);
          toast(`${m.name} quedó en el equipo`, "ok");
        }}
      />

      <PersonaSheet
        persona={open}
        meId={meId}
        onClose={() => setOpenId(null)}
        onPatch={patch}
        onRemoved={(id) => {
          setPeople((prev) => prev.filter((x) => x.id !== id));
          setOpenId(null);
        }}
      />
    </div>
  );
}

function Lista({ titulo, people, meId, onOpen, muted }: { titulo: string; people: Persona[]; meId: string; onOpen: (id: string) => void; muted?: boolean }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h2 className="ui-label m-0">{titulo}</h2>
      <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
        {people.map((p) => {
          const a = ACCESO[p.acceso];
          return (
            <li key={p.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                data-testid="persona-row"
                className={cn(
                  "w-full min-h-[76px] flex items-center gap-3.5 px-4 sm:px-5 py-3 text-left bg-transparent border-0 cursor-pointer hover:bg-surface-2 text-text",
                  muted && "opacity-60",
                )}
              >
                <Avatar name={p.name} initials={p.initials} />
                <span className="flex-1 min-w-0">
                  <span className="ui-title block truncate">
                    {p.name}
                    {p.id === meId ? <span className="text-muted font-normal"> · tú</span> : null}
                  </span>
                  <span className="ui-sub block truncate">{p.email || "sin correo"}</span>
                </span>
                <span className="hidden sm:flex items-center gap-2 shrink-0">
                  {p.role === "admin" ? <Pill>Dueño</Pill> : null}
                  <Pill tone={a.tablet ? "neutral" : "late"}>{a.label}</Pill>
                </span>
                <span className="sm:hidden shrink-0">
                  {a.tablet ? (p.role === "admin" ? <Pill>Dueño</Pill> : null) : <Pill tone="late">Sin contraseña</Pill>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NuevaPersona({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (m: RosterMember, acceso: Acceso) => void }) {
  const [modo, setModo] = React.useState<Modo>("password");
  const [draft, setDraft] = React.useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const ok = draft.name.trim() && /\S+@\S+\.\S+/.test(draft.email.trim()) && (modo === "invite" || draft.password.length >= PASSWORD_MIN);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || pending) return;
    setError(null);
    start(async () => {
      const base = { name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() || undefined };
      const r = modo === "password" ? await createMemberWithPassword({ ...base, password: draft.password }) : await inviteMember(base);
      if ("error" in r && r.error) return setError(r.error);
      if ("member" in r && r.member) {
        onCreated(r.member, modo === "password" ? "password" : "google");
        setDraft({ name: "", email: "", phone: "", password: "" });
      }
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva persona"
      footer={
        <Button type="submit" form="nueva-persona" block loading={pending} disabled={!ok}>
          {modo === "password" ? "Crear cuenta" : "Enviar invitación"}
        </Button>
      }
    >
      <form id="nueva-persona" onSubmit={submit} className="flex flex-col gap-4">
        <Segmented<Modo>
          label="Cómo entra"
          block
          value={modo}
          onChange={setModo}
          options={[
            { value: "password", label: "Con contraseña" },
            { value: "invite", label: "Con Google" },
          ]}
        />
        <Field label="Nombre" autoComplete="off" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} required />
        <Field
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          maxLength={160}
          required
        />
        <Field label="Teléfono (opcional)" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} maxLength={60} />
        {modo === "password" ? (
          <PasswordField value={draft.password} onChange={(v) => setDraft({ ...draft, password: v })} />
        ) : (
          <p className="ui-sub m-0">
            Se crea la cuenta y la persona entra con Google usando ese correo. Para que pueda usar la tablet con su ficha, ponle una contraseña
            después.
          </p>
        )}
        {error ? (
          <p role="alert" className="m-0 text-late font-semibold">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

function PasswordField({ value, onChange, label = "Contraseña" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        type="text"
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={72}
        hint={`Mínimo ${PASSWORD_MIN} caracteres. Dísela en persona.`}
        error={value && value.length < PASSWORD_MIN ? `Faltan ${PASSWORD_MIN - value.length} caracteres.` : undefined}
      />
      <Button type="button" variant="ghost" size="sm" icon={<KeyRound size={18} aria-hidden />} onClick={() => onChange(sugerirContrasena())}>
        Sugerir una
      </Button>
    </div>
  );
}

function PersonaSheet({
  persona,
  meId,
  onClose,
  onPatch,
  onRemoved,
}: {
  persona: Persona | null;
  meId: string;
  onClose: () => void;
  onPatch: (id: string, p: Partial<Persona>) => void;
  onRemoved: (id: string) => void;
}) {
  // Keep the last person while the sheet animates closed.
  const [last, setLast] = React.useState<Persona | null>(persona);
  if (persona && persona !== last) setLast(persona);
  const p = persona ?? last;
  return (
    <Sheet open={!!persona} onClose={onClose} title={p?.name ?? "Persona"}>
      {p ? <PersonaForm key={p.id} p={p} meId={meId} onPatch={onPatch} onRemoved={onRemoved} /> : null}
    </Sheet>
  );
}

function PersonaForm({
  p,
  meId,
  onPatch,
  onRemoved,
}: {
  p: Persona;
  meId: string;
  onPatch: (id: string, p: Partial<Persona>) => void;
  onRemoved: (id: string) => void;
}) {
  const [name, setName] = React.useState(p.name);
  const [phone, setPhone] = React.useState(p.phone ?? "");
  const [pw, setPw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const a = ACCESO[p.acceso];
  const datosCambiaron = name.trim() !== p.name || (p.isMember && phone.trim() !== (p.phone ?? ""));

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | { ok: true }>, done: () => void) => {
    setError(null);
    start(async () => {
      const r = (await fn()) as { error?: string };
      if (r.error) setError(r.error);
      else done();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} initials={p.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="ui-sub m-0 truncate">{p.email || "sin correo"}</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {p.role === "admin" ? <Pill>Dueño</Pill> : <Pill>Equipo</Pill>}
            <Pill tone={a.tablet ? "ok" : "late"}>{a.label}</Pill>
            {!p.active ? <Pill tone="late">Inactiva</Pill> : null}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-label="Contraseña">
        <h3 className="ui-title m-0">{a.tablet ? "Restablecer contraseña" : "Ponerle contraseña"}</h3>
        <p className="ui-sub m-0">{a.hint}</p>
        <PasswordField label="Nueva contraseña" value={pw} onChange={setPw} />
        <Button
          type="button"
          variant="strong"
          block
          loading={pending}
          disabled={pw.length < PASSWORD_MIN}
          onClick={() =>
            run(
              () => setMemberPassword({ id: p.id, password: pw }),
              () => {
                onPatch(p.id, { acceso: p.acceso === "google" || p.acceso === "ambos" ? "ambos" : "password" });
                setPw("");
                toast(`Contraseña de ${p.name} guardada`, "ok");
              },
            )
          }
        >
          Guardar contraseña
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-5" aria-label="Datos">
        <h3 className="ui-title m-0">Datos</h3>
        <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        {p.isMember ? <Field label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={60} /> : null}
        <Button
          type="button"
          variant="ghost"
          block
          disabled={!datosCambiaron || !name.trim() || pending}
          onClick={() =>
            run(
              () => updateMember({ id: p.id, name: name.trim(), ...(p.isMember ? { phone: phone.trim() || null } : {}) }),
              () => {
                onPatch(p.id, { name: name.trim(), phone: phone.trim() || null });
                toast("Datos guardados", "ok");
              },
            )
          }
        >
          Guardar datos
        </Button>
      </section>

      {p.isMember && p.id !== meId ? (
        <section className="flex flex-col gap-3 border-t border-line pt-5" aria-label="Estado">
          <h3 className="ui-title m-0">{p.active ? "Desactivar" : "Activar"}</h3>
          <p className="ui-sub m-0">
            {p.active
              ? "Deja de aparecer en la tablet, en el horario y en el POS. Su historial se conserva."
              : "Vuelve a aparecer en la tablet, el horario y el POS."}
          </p>
          <Button
            type="button"
            variant="ghost"
            block
            disabled={pending}
            onClick={() => run(() => updateMember({ id: p.id, active: !p.active }), () => onPatch(p.id, { active: !p.active }))}
          >
            {p.active ? "Desactivar" : "Activar"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            block
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`¿Quitar a ${p.name} de la sede? Su cuenta sigue existiendo.`)) return;
              const fd = new FormData();
              fd.set("id", p.id);
              run(() => removeMember(fd), () => {
                onRemoved(p.id);
                toast(`${p.name} ya no está en la sede`);
              });
            }}
          >
            Quitar de la sede
          </Button>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-late font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
