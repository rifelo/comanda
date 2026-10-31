"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { crearProductoRapido } from "../actions";
import { Select } from "./bits";
import { sugerirSku } from "./sku";

/**
 * «Nuevo producto» — four fields (name, category, price, SKU suggested from
 * the category). Saving opens the ficha on «Receta» so the recipe is next.
 * Navigation happens after the await (never inside startTransition).
 */
export function NuevoProductoSheet({
  open,
  onClose,
  hojas,
  productos,
}: {
  open: boolean;
  onClose: () => void;
  hojas: { id: string; label: string }[];
  productos: { sku: string; category_id: string | null }[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [skuTocado, setSkuTocado] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ msg: string; field?: string } | null>(null);

  const skuSugerido = React.useMemo(
    () =>
      sugerirSku({
        categoriaLabel: hojas.find((h) => h.id === cat)?.label ?? null,
        skusCategoria: productos.filter((p) => p.category_id === cat).map((p) => p.sku),
        todos: productos.map((p) => p.sku),
      }),
    [cat, hojas, productos],
  );
  const skuValue = skuTocado ? sku : skuSugerido;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const precio = Number(price.replace(/\./g, "").replace(",", "."));
    if (!name.trim()) return setError({ msg: "Escribe el nombre.", field: "name" });
    if (!Number.isFinite(precio) || precio < 0) return setError({ msg: "Precio inválido.", field: "price_cop" });
    setSaving(true);
    const r = await crearProductoRapido({ name, category_id: cat || null, price_cop: Math.round(precio), sku: skuValue });
    setSaving(false);
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    router.push(`/productos/${r.id}?tab=receta`);
  }

  const err = (f: string) => (error?.field === f ? error.msg : undefined);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo producto"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="nuevo-producto" block loading={saving}>
            Crear y añadir receta
          </Button>
        </div>
      }
    >
      <form id="nuevo-producto" onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field id="np-name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Latte de avellana" error={err("name")} autoFocus />
        <Select id="np-cat" label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} error={err("category_id")}>
          <option value="">Sin categoría</option>
          {hojas.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field id="np-price" label="Precio de venta" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="9.000" error={err("price_cop")} />
          <Field
            id="np-sku"
            label="SKU"
            value={skuValue}
            onChange={(e) => {
              setSkuTocado(true);
              setSku(e.target.value.toUpperCase());
            }}
            hint={skuTocado ? undefined : "Sugerido"}
            error={err("sku")}
            autoCapitalize="characters"
          />
        </div>
        {error && !error.field ? <p className="m-0 text-sm font-semibold text-late">{error.msg}</p> : null}
        <p className="ui-sub m-0">La receta y la foto se añaden después, en la ficha del producto.</p>
      </form>
    </Sheet>
  );
}
