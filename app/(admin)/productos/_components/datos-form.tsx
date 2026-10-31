"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ProductoFicha } from "@/lib/db/recetas";
import { Button } from "@/components/ui/button";
import { Banner, toast } from "@/components/ui/feedback";
import { Field, TextArea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { deleteProducto, updateProducto } from "../actions";
import { pesos, Select } from "./bits";

const STOCK = [
  { value: "ok", label: "Disponible" },
  { value: "bajo", label: "Poco" },
  { value: "sin", label: "Agotado" },
] as const;

/**
 * «Datos»: name, category, price, SKU, description, availability and photo.
 * With a recipe the cost comes from it; without one it is typed here.
 * Saved through the existing `updateProducto` action (FormData contract).
 */
export function DatosForm({ ficha, tieneReceta }: { ficha: ProductoFicha; tieneReceta: boolean }) {
  const router = useRouter();
  const p = ficha.producto;
  const [f, setF] = React.useState({
    name: p.name,
    category_id: p.category_id ?? "",
    price: String(p.price_cop),
    cost: String(p.cost_cop),
    sku: p.sku,
    description: p.description ?? "",
    stock_status: p.stock_status,
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("name", f.name);
    fd.set("category_id", f.category_id);
    fd.set("price_cop", String(Math.round(num(f.price))));
    fd.set("cost_cop", String(Math.round(num(f.cost) || 0)));
    fd.set("sku", f.sku);
    fd.set("description", f.description);
    fd.set("stock_status", f.stock_status);
    if (file) fd.set("image", file);
    setSaving(true);
    const r = await updateProducto(null, fd);
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setError(r.error ?? "No se pudo guardar.");
      return;
    }
    setFile(null);
    toast(r.warning ?? "Producto guardado", r.warning ? "brand" : "ok");
    router.refresh();
  }

  async function borrar() {
    setDeleting(true);
    const r = await deleteProducto(p.id);
    setDeleting(false);
    if (!r.ok) return setError(r.error ?? "No se pudo eliminar.");
    toast("Producto eliminado");
    router.push("/productos");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Banner tone="late" onClose={() => setError(null)}>
          {error}
        </Banner>
      ) : null}
      <Field id="d-name" label="Nombre" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
      <Select id="d-cat" label="Categoría" value={f.category_id} onChange={(e) => set("category_id", e.target.value)} error={errors.category_id}>
        <option value="">Sin categoría</option>
        {ficha.categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Field id="d-price" label="Precio de venta" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, ""))} error={errors.price_cop} />
        <Field id="d-sku" label="SKU" value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} error={errors.sku} />
      </div>
      {tieneReceta ? (
        <p className="ui-sub m-0">
          Costo {pesos(p.cost_cop)}: sale de la receta y se recalcula solo.
        </p>
      ) : (
        <Field id="d-cost" label="Costo (sin receta)" inputMode="numeric" value={f.cost} onChange={(e) => set("cost", e.target.value.replace(/[^\d.,]/g, ""))} hint="Con una receta, el costo se calcula de sus insumos." error={errors.cost_cop} />
      )}
      <div className="flex flex-col gap-1.5">
        <span className="ui-label">En el POS</span>
        <Segmented options={STOCK.map((s) => ({ value: s.value, label: s.label }))} value={f.stock_status} onChange={(v) => set("stock_status", v)} label="Disponibilidad" />
      </div>
      <TextArea id="d-desc" label="Descripción (opcional)" value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={500} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="d-foto" className="ui-label">
          Foto (JPG o PNG, máx. 2 MB)
        </label>
        <input id="d-foto" type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[15px] min-h-11" />
      </div>

      <div className="sticky bottom-3 z-10">
        <Button type="submit" block loading={saving}>
          Guardar cambios
        </Button>
      </div>

      <div className="border-t border-line pt-4 flex flex-wrap items-center gap-3">
        {confirmDel ? (
          <>
            <span className="ui-sub flex-1">¿Eliminar {p.name}? Se quita del POS; las ventas pasadas no cambian.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
              No
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={borrar} loading={deleting}>
              Sí, eliminar
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>
            Eliminar producto
          </Button>
        )}
      </div>
    </form>
  );
}
