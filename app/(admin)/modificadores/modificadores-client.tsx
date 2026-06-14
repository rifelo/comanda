"use client";

/**
 * Modificadores — customization groups + options. Real CRUD: create/delete a
 * group, toggle "required", add/remove options, and toggle an option's
 * availability. Each option carries a price delta.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { fmtCOP } from "@/lib/mock/productos";
import { summarizeGroup, type ModGroup, type ModGroupType } from "@/lib/modificadores";
import { SectionCrumb } from "../_components/shared";
import {
  createGroup,
  deleteGroup,
  setGroupRequired,
  addOption,
  setOptionAvailable,
  removeOption,
} from "./actions";

function deltaLabel(delta: number): string {
  if (delta === 0) return "—";
  return `${delta > 0 ? "+" : "−"}$${fmtCOP(Math.abs(delta))}`;
}

function OptionRow({ option, onError }: { option: ModGroup["options"][number]; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const toggle = () =>
    start(async () => {
      const r = await setOptionAvailable({ option_id: option.id, available: !option.available });
      if (r?.error) onError(r.error);
      else router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await removeOption({ option_id: option.id });
      if (r?.error) onError(r.error);
      else router.refresh();
    });
  return (
    <div className="flex justify-between" style={{ alignItems: "center", padding: "7px 14px", borderBottom: "1px dashed var(--rule-soft)", opacity: pending ? 0.5 : 1 }}>
      <div className="flex" style={{ alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={`Disponibilidad ${option.name}`}
          aria-pressed={option.available}
          style={{ width: 34, height: 18, borderRadius: 9, border: "1px solid var(--ink)", background: option.available ? "var(--green)" : "var(--paper)", position: "relative", cursor: "pointer", padding: 0, minHeight: 0 }}
        >
          <span style={{ position: "absolute", top: 1, left: option.available ? 17 : 1, width: 14, height: 14, borderRadius: "50%", background: "var(--paper-lt)", border: "1px solid var(--ink)", transition: "left .1s" }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 500, color: option.available ? "var(--ink)" : "var(--muted)" }}>{option.name}</span>
      </div>
      <div className="flex" style={{ alignItems: "center", gap: 12 }}>
        <span className="cmd-num" style={{ fontSize: 12, color: option.price_delta_cop > 0 ? "var(--ink)" : "var(--muted)" }}>{deltaLabel(option.price_delta_cop)}</span>
        <button type="button" onClick={remove} disabled={pending} aria-label={`Quitar ${option.name}`} className="text-muted" style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer", padding: 0, minHeight: 0 }}>✕</button>
      </div>
    </div>
  );
}

function AddOptionRow({ groupId, onError }: { groupId: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [delta, setDelta] = React.useState("");
  const add = () => {
    if (!name.trim()) return onError("Nombre de la opción requerido.");
    onError(null);
    start(async () => {
      const r = await addOption({ group_id: groupId, name, price_delta_cop: Number(delta) || 0 });
      if (r?.error) onError(r.error);
      else { setName(""); setDelta(""); router.refresh(); }
    });
  };
  const inp: React.CSSProperties = { border: "1px solid var(--rule)", padding: "5px 8px", fontSize: 12, color: "var(--ink)", background: "var(--paper)", minHeight: 0 };
  return (
    <div className="flex" style={{ gap: 8, padding: "10px 14px", alignItems: "center", background: "var(--paper)" }}>
      <input aria-label={`Nueva opción ${groupId}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva opción…" style={{ ...inp, flex: 1 }} />
      <input aria-label={`Delta opción ${groupId}`} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+$0" style={{ ...inp, width: 90, textAlign: "right" }} />
      <button type="button" className="cmd-btn ghost sm" disabled={pending} onClick={add}>{pending ? "…" : "Agregar"}</button>
    </div>
  );
}

function GroupCard({ group, onError }: { group: ModGroup; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(true);
  const s = summarizeGroup(group.options);

  const toggleReq = () =>
    start(async () => {
      const r = await setGroupRequired({ group_id: group.id, required: !group.required });
      if (r?.error) onError(r.error);
      else router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await deleteGroup({ group_id: group.id });
      if (r?.error) onError(r.error);
      else router.refresh();
    });

  return (
    <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)", marginBottom: 14 }}>
      <div className="bg-paper flex justify-between" style={{ alignItems: "center", padding: "12px 14px", borderBottom: open ? "1.5px solid var(--ink)" : "none" }}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex" style={{ alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: 0, textAlign: "left" }}>
          <span className="text-muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>
          <span>
            <span className="font-slab" style={{ fontSize: 16 }}>{group.name}</span>
            <span className="text-muted" style={{ fontSize: 10, marginLeft: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {group.type === "single" ? "elige uno" : "elige varios"} · {s.available}/{s.total} activas
            </span>
          </span>
        </button>
        <div className="flex" style={{ alignItems: "center", gap: 10 }}>
          <label className="flex" style={{ alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer" }}>
            <input type="checkbox" checked={group.required} disabled={pending} onChange={toggleReq} aria-label={`Obligatorio ${group.name}`} />
            Obligatorio
          </label>
          <button type="button" onClick={remove} disabled={pending} className="cmd-btn ghost sm" style={{ color: "var(--red)", borderColor: "var(--red)" }}>Eliminar</button>
        </div>
      </div>
      {open ? (
        <div>
          {group.options.length === 0 ? (
            <div className="text-muted" style={{ padding: 14, fontSize: 12, textAlign: "center" }}>Sin opciones todavía.</div>
          ) : (
            group.options.map((o) => <OptionRow key={o.id} option={o} onError={onError} />)
          )}
          <AddOptionRow groupId={group.id} onError={onError} />
        </div>
      ) : null}
    </div>
  );
}

function NuevoGrupo({ onError }: { onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ModGroupType>("single");
  const create = () => {
    if (!name.trim()) return onError("Nombre del grupo requerido.");
    onError(null);
    start(async () => {
      const r = await createGroup({ name, type, required: false });
      if (r?.error) onError(r.error);
      else { setName(""); router.refresh(); }
    });
  };
  const inp: React.CSSProperties = { border: "1.5px solid var(--ink)", padding: "8px 10px", fontSize: 12, color: "var(--ink)", background: "var(--paper)", minHeight: 0 };
  return (
    <div className="cmd-paper-lt flex" style={{ gap: 8, alignItems: "center", border: "1px dashed var(--rule)", padding: 12, marginBottom: 18 }}>
      <input aria-label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo grupo (ej. Punto de la carne)" style={{ ...inp, flex: 1 }} />
      <select aria-label="Tipo del grupo" value={type} onChange={(e) => setType(e.target.value as ModGroupType)} style={{ ...inp, appearance: "none", cursor: "pointer" }}>
        <option value="single">Elige uno</option>
        <option value="multiple">Elige varios</option>
      </select>
      <button type="button" className="cmd-btn sm" disabled={pending} onClick={create}>{pending ? "…" : "+ Crear grupo"}</button>
    </div>
  );
}

export function ModificadoresClient({ groups }: { groups: ModGroup[] }) {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <SectionCrumb section="modificadores" />
      <div style={{ padding: "20px 28px" }}>
        <NuevoGrupo onError={setError} />
        {error ? (
          <div role="alert" style={{ border: "1px solid var(--red)", color: "var(--red)", padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>{error}</div>
        ) : null}
        {groups.length === 0 ? (
          <div className="text-muted" style={{ padding: 30, fontSize: 13, textAlign: "center" }}>
            Aún no hay grupos de modificadores. Crea el primero arriba.
          </div>
        ) : (
          groups.map((g) => <GroupCard key={g.id} group={g} onError={setError} />)
        )}
      </div>
    </div>
  );
}
