"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, SearchField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { pedirConteoAgente } from "../actions";

type Ing = { id: string; name: string; ubicacion: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «Pedir un conteo»: the owner picks an item and the team counts it today. */
export function PedirConteo({ ingredientes }: { ingredientes: Ing[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<Ing | null>(null);
  const [detalle, setDetalle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const lista = React.useMemo(() => {
    const n = norm(q.trim());
    return ingredientes
      .filter((i) => !n || norm(i.name).includes(n) || norm(i.ubicacion ?? "").includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 60);
  }, [ingredientes, q]);

  function cerrar() {
    setOpen(false);
    setQ("");
    setSel(null);
    setDetalle("");
  }

  async function pedir() {
    if (!sel) return;
    setBusy(true);
    const r = await pedirConteoAgente({ ingredienteId: sel.id, detalle: detalle.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: `${sel.name} quedó en la lista de hoy.` });
    cerrar();
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {msg && (
          <span role="status" style={{ fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--late)" }}>
            {msg.text}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
        >
          Pedir un conteo
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={cerrar}
        title="Pedir un conteo"
        footer={
          <>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button block disabled={!sel} loading={busy} onClick={() => void pedir()}>
              {sel ? `Contar ${sel.name} hoy` : "Elige un insumo"}
            </Button>
          </>
        }
      >
        <p className="ui-sub m-0">El equipo lo verá hoy en la tablet, antes que lo que pidió el control de inventario.</p>
        <SearchField value={q} onChange={setQ} placeholder="Buscar insumo o zona" label="Buscar insumo" autoFocus />
        <div role="listbox" aria-label="Insumos" className="flex flex-col" style={{ border: "1px solid var(--line)", borderRadius: 12, maxHeight: 300, overflowY: "auto" }}>
          {lista.length === 0 && <div style={{ padding: "12px 14px", fontSize: 14, color: "var(--muted)" }}>No hay insumos con ese nombre.</div>}
          {lista.map((i, idx) => {
            const on = sel?.id === i.id;
            return (
              <button
                key={i.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => setSel(i)}
                className="flex items-center text-left cursor-pointer"
                style={{
                  gap: 10,
                  minHeight: 48,
                  padding: "8px 14px",
                  border: 0,
                  borderTop: idx ? "1px solid var(--line)" : 0,
                  background: on ? "var(--brand-soft)" : "transparent",
                  color: "var(--text)",
                  font: "inherit",
                  fontSize: 15,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontWeight: on ? 700 : 500 }}>{i.name}</span>
                {i.ubicacion && <span style={{ fontSize: 12, color: "var(--muted)" }}>{i.ubicacion}</span>}
              </button>
            );
          })}
        </div>
        <Field label="¿Por qué? (opcional)" placeholder="Ej.: creo que se está perdiendo" value={detalle} maxLength={200} onChange={(e) => setDetalle(e.target.value)} />
      </Sheet>
    </>
  );
}
