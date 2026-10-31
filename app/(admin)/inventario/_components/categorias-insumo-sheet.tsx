"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2 } from "lucide-react";
import type { IngredienteCategoria } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { createIngredienteCategoria, deleteIngredienteCategoria, updateIngredienteCategoria } from "../actions";
import { Select } from "../../productos/_components/bits";

/** Insumo categories: rename, delete (its items become «Sin categoría») and add. */
export function CategoriasInsumoSheet({ categorias, conteo, onClose }: { categorias: IngredienteCategoria[]; conteo: Record<string, number>; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [parent, setParent] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const raices = categorias.filter((c) => !c.parent_id).sort((a, b) => a.label.localeCompare(b.label, "es"));
  const hijos = (id: string) => categorias.filter((c) => c.parent_id === id).sort((a, b) => a.label.localeCompare(b.label, "es"));

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "No se pudo.");
    toast(ok, "ok");
    setConfirm(null);
    setEditId(null);
    router.refresh();
  }

  const fila = (c: IngredienteCategoria, sub: boolean) => (
    <li key={c.id} className="flex items-center gap-2 min-h-14 border-b border-line last:border-b-0">
      {editId === c.id ? (
        <>
          <Field id={`ren-${c.id}`} aria-label="Nuevo nombre" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="flex-1" autoFocus />
          <IconButton label="Guardar nombre" size="sm" disabled={busy === c.id} onClick={() => run(c.id, () => updateIngredienteCategoria({ id: c.id, label: editLabel.trim() }), "Categoría renombrada")}>
            <Check size={18} aria-hidden />
          </IconButton>
        </>
      ) : (
        <>
          <span className={sub ? "flex-1 pl-6 text-[16px]" : "flex-1 ui-title"}>{c.label}</span>
          <span className="ui-sub ui-num w-8 text-right">{conteo[c.id] ?? 0}</span>
          {confirm === c.id ? (
            <Button size="sm" variant="danger" loading={busy === c.id} onClick={() => run(c.id, () => deleteIngredienteCategoria({ id: c.id }), "Categoría eliminada")}>
              Eliminar
            </Button>
          ) : (
            <>
              <IconButton
                label={`Renombrar ${c.label}`}
                size="sm"
                onClick={() => {
                  setEditId(c.id);
                  setEditLabel(c.label);
                }}
              >
                <Pencil size={18} aria-hidden />
              </IconButton>
              <IconButton label={`Eliminar ${c.label}`} size="sm" onClick={() => setConfirm(c.id)}>
                <Trash2 size={18} aria-hidden />
              </IconButton>
            </>
          )}
        </>
      )}
    </li>
  );

  return (
    <Sheet open onClose={onClose} title="Categorías de insumos">
      <div className="flex flex-col gap-5">
        {error ? <p className="m-0 text-[15px] font-semibold text-late">{error}</p> : null}
        <ul className="m-0 p-0 list-none">
          {raices.map((r) => (
            <React.Fragment key={r.id}>
              {fila(r, false)}
              {hijos(r.id).map((h) => fila(h, true))}
            </React.Fragment>
          ))}
        </ul>
        {confirm ? <p className="ui-sub m-0">Sus insumos quedan «Sin categoría» y las subcategorías se borran.</p> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return setError("Escribe el nombre.");
            void run("add", () => createIngredienteCategoria({ label: label.trim(), parentId: parent || null }), "Categoría creada").then(() => setLabel(""));
          }}
          className="flex flex-col gap-3 border-t border-line pt-4"
        >
          <h3 className="ui-title m-0">Nueva categoría</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="icat-label" label="Nombre" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Select id="icat-parent" label="Dentro de" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">— Principal —</option>
              {raices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="strong" loading={busy === "add"}>
            Crear categoría
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
