"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/feedback";
import { createProductoCategoria, deleteProductoCategoria } from "../actions";
import { Select } from "./bits";

type Cat = { id: string; label: string; parent_id: string | null; count: number };

/** Product categories: list (parents with their children), add, delete. */
export function CategoriasSheet({ open, onClose, todas }: { open: boolean; onClose: () => void; todas: Cat[] }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [parent, setParent] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const raices = todas.filter((c) => !c.parent_id);
  const hijos = (id: string) => todas.filter((c) => c.parent_id === id);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return setError("Escribe el nombre.");
    setError(null);
    setBusy("add");
    const fd = new FormData();
    fd.set("label", label.trim());
    fd.set("parent_id", parent);
    const r = await createProductoCategoria(null, fd);
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "No se pudo crear.");
    setLabel("");
    toast("Categoría creada", "ok");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const r = await deleteProductoCategoria(id);
    setBusy(null);
    setConfirm(null);
    if (!r.ok) return toast(r.error ?? "No se pudo eliminar.", "late");
    toast("Categoría eliminada", "ok");
    router.refresh();
  }

  const fila = (c: Cat, sub: boolean) => (
    <li key={c.id} className="flex items-center gap-3 min-h-14 border-b border-line last:border-b-0">
      <span className={sub ? "flex-1 pl-6 text-[16px]" : "flex-1 ui-title"}>{c.label}</span>
      <span className="ui-sub ui-num">{c.count}</span>
      {confirm === c.id ? (
        <Button size="sm" variant="danger" loading={busy === c.id} onClick={() => remove(c.id)}>
          Eliminar
        </Button>
      ) : (
        <IconButton label={`Eliminar ${c.label}`} size="sm" onClick={() => setConfirm(c.id)}>
          <Trash2 size={18} aria-hidden />
        </IconButton>
      )}
    </li>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Categorías">
      <div className="flex flex-col gap-5">
        <ul className="m-0 p-0 list-none">
          {raices.map((r) => (
            <React.Fragment key={r.id}>
              {fila(r, false)}
              {hijos(r.id).map((h) => fila(h, true))}
            </React.Fragment>
          ))}
        </ul>
        {confirm ? <p className="ui-sub m-0">Al eliminar una categoría sus productos quedan «Sin categoría» y sus subcategorías se borran.</p> : null}
        <form onSubmit={add} className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="ui-title m-0">Nueva categoría</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="cat-label" label="Nombre" value={label} onChange={(e) => setLabel(e.target.value)} error={error ?? undefined} />
            <Select id="cat-parent" label="Dentro de" value={parent} onChange={(e) => setParent(e.target.value)}>
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
