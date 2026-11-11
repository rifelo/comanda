"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DIAS_CORTOS } from "@/lib/compras/compras";
import { whatsappLegible } from "@/lib/compras/proveedores";
import type { ProveedorFicha } from "@/lib/compras/proveedores-db";
import { archivarProveedor, guardarProveedor } from "../actions";

const field: React.CSSProperties = { width: "100%", minHeight: 44, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontSize: 15, outline: "none" };
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 6 };

/**
 * A supplier's data: name, WhatsApp (where orders are sent), the fixed days
 * it takes orders and how many days it takes to deliver. With no `proveedor`
 * it creates one and opens its page.
 */
export function ProveedorForm({ proveedor, onDone }: { proveedor?: ProveedorFicha; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState(proveedor?.name ?? "");
  const [whatsapp, setWhatsapp] = React.useState(proveedor?.whatsapp ? whatsappLegible(proveedor.whatsapp)! : "");
  const [dias, setDias] = React.useState<number[]>(proveedor?.dias_pedido_idx ?? []);
  const [entrega, setEntrega] = React.useState(String(proveedor?.entrega_dias ?? 1));
  const [notas, setNotas] = React.useState(proveedor?.notas ?? "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (d: number) => {
    setDias((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)));
    setMsg(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await guardarProveedor({ id: proveedor?.id, name, whatsapp, dias, entregaDias: Number(entrega) || 0, notas });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    if (!proveedor) {
      // Not inside startTransition: in Next 16 that leaves the transition pending forever.
      router.push(`/inventario/proveedores/${r.id}`);
      return;
    }
    setMsg({ ok: true, text: "Guardado" });
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col" style={{ gap: 14 }}>
      <label>
        <div style={lbl}>Nombre</div>
        <input value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} placeholder="Ej. Lácteos La Pradera" maxLength={80} required style={field} autoFocus={!proveedor} />
      </label>
      <label>
        <div style={lbl}>WhatsApp</div>
        <input value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setMsg(null); }} placeholder="300 123 4567" inputMode="tel" maxLength={24} style={field} />
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>A este número se envían los pedidos desde «Pedidos».</div>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={lbl}>Días de pedido</legend>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {DIAS_CORTOS.map((d, i) => (
            <button key={d} type="button" aria-pressed={dias.includes(i)} onClick={() => toggle(i)} className={dias.includes(i) ? "cmd-btn sm" : "cmd-btn ghost sm"} style={{ minWidth: 48, minHeight: 40, textTransform: "capitalize" }}>
              {d}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          {dias.length ? "«Pedidos» lo pone primero esos días." : "Sin días marcados = se le puede pedir cualquier día."}
          {proveedor?.dias_pedido && !proveedor.dias_pedido_idx.length ? ` Antes estaba anotado: «${proveedor.dias_pedido}».` : ""}
        </div>
      </fieldset>
      <label style={{ maxWidth: 220 }}>
        <div style={lbl}>Entrega en</div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <input value={entrega} onChange={(e) => { setEntrega(e.target.value.replace(/\D/g, "").slice(0, 2)); setMsg(null); }} inputMode="numeric" style={{ ...field, width: 72, textAlign: "right" }} aria-label="Días que tarda en entregar" />
          <span style={{ fontSize: 14 }}>{entrega === "0" ? "días (el mismo día)" : entrega === "1" ? "día" : "días"}</span>
        </div>
      </label>
      <label>
        <div style={lbl}>Notas</div>
        <textarea value={notas} onChange={(e) => { setNotas(e.target.value); setMsg(null); }} placeholder="Contacto, pedido mínimo, cómo se le paga…" maxLength={300} rows={3} style={{ ...field, padding: "10px 12px", minHeight: 80, resize: "vertical", fontFamily: "inherit" }} />
      </label>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <button type="submit" className="cmd-btn" disabled={busy || name.trim().length < 2} style={{ minWidth: 140, minHeight: 44 }}>
          {busy ? "Guardando…" : proveedor ? "Guardar cambios" : "Crear proveedor"}
        </button>
        {onDone && <button type="button" className="cmd-btn ghost" onClick={onDone} style={{ minHeight: 44 }}>Cancelar</button>}
        {msg && <span role={msg.ok ? "status" : "alert"} style={{ fontSize: 13, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
      </div>
    </form>
  );
}

/** «Nuevo proveedor»: a button that unfolds the empty form. */
export function NuevoProveedor() {
  const [open, setOpen] = React.useState(false);
  if (!open) return <button type="button" className="cmd-btn sm" onClick={() => setOpen(true)}>＋ Nuevo proveedor</button>;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: 16, width: "100%", maxWidth: 560 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Nuevo proveedor</div>
      <ProveedorForm onDone={() => setOpen(false)} />
    </div>
  );
}

/** Archive the supplier and go back to the list. */
export function QuitarProveedor({ id, name, items }: { id: string; name: string; items: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function quitar() {
    const extra = items ? ` Sus ${items} ítem${items === 1 ? "" : "s"} quedan sin proveedor.` : "";
    if (!window.confirm(`¿Quitar a ${name}? Sus pedidos se conservan.${extra}`)) return;
    setBusy(true);
    const r = await archivarProveedor(id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push("/inventario/proveedores");
  }
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
      <button type="button" className="cmd-btn ghost sm" onClick={() => void quitar()} disabled={busy} style={{ color: "var(--red)" }}>{busy ? "Quitando…" : "Quitar proveedor"}</button>
      {error && <span role="alert" style={{ fontSize: 13, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
