"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import { unitCostFromPack } from "@/lib/cost";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { createIngrediente, deleteIngrediente, updateIngrediente } from "../actions";
import { pesos, Select } from "../../productos/_components/bits";

// Same list as app/(admin)/inventario/actions.ts UNITS.
const UNITS = ["kg", "g", "L", "ml", "und", "porción", "loncha", "bola", "caja", "bulto", "paquete"] as const;
type Unit = (typeof UNITS)[number];

/** Categories as «Padre · Hija» options, parents first. */
export function opcionesCategoria(cats: IngredienteCategoria[]): { id: string; label: string }[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  return cats
    .map((c) => ({ id: c.id, label: c.parent_id && byId.get(c.parent_id) ? `${byId.get(c.parent_id)!.label} · ${c.label}` : c.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * Create or edit an insumo: name, category, unit, cost (per unit, or per pack
 * — the per-unit cost is derived), minimum and merma. Changing the unit of an
 * item used in recipes is refused by the server (leche ml/bolsa rule). Levels,
 * zone, piece and supplier live in /inventario/niveles.
 */
export function InsumoSheet({ editing, categorias, onClose }: { editing: Ingrediente | null; categorias: IngredienteCategoria[]; onClose: () => void }) {
  const router = useRouter();
  const isEdit = editing !== null;
  const [f, setF] = React.useState({
    name: editing?.name ?? "",
    categoryId: editing?.category_id ?? "",
    unit: ((editing?.unit as Unit) ?? "und") as Unit,
    stock: "",
    min: editing ? String(editing.stock_min) : "0",
    merma: editing ? String(editing.merma_pct ?? 0) : "0",
    modo: (editing?.pack_qty != null ? "paquete" : "unidad") as "paquete" | "unidad",
    cost: editing ? String(editing.cost_cop) : "",
    packCost: editing?.pack_cost_cop != null ? String(editing.pack_cost_cop) : "",
    packQty: editing?.pack_qty != null ? String(editing.pack_qty) : "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmArchivar, setConfirmArchivar] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const opts = opcionesCategoria(categorias);

  const packUnit = f.modo === "paquete" && num(f.packQty) > 0 && num(f.packCost) >= 0 ? unitCostFromPack(num(f.packCost), num(f.packQty)) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = "Escribe el nombre.";
    if (!isEdit && (f.stock === "" || !(num(f.stock) >= 0))) er.stock = "¿Cuánto hay hoy? (0 si nada)";
    if (!(num(f.min) >= 0)) er.min = "Inválido";
    if (f.modo === "paquete") {
      if (!(num(f.packCost) > 0)) er.packCost = "Precio del paquete";
      if (!(num(f.packQty) > 0)) er.packQty = "Unidades por paquete";
    } else if (f.cost === "" || !(num(f.cost) >= 0)) er.cost = "Costo por unidad (0 si aún no lo sabes)";
    setErrors(er);
    if (Object.keys(er).length) return;
    setError(null);
    setSaving(true);
    const common = {
      name: f.name.trim(),
      categoryId: f.categoryId || null,
      unit: f.unit,
      unit2: editing?.unit2 ?? null,
      conversionFactor: editing?.conversion_factor ?? null,
      stockMin: num(f.min),
      mermaPct: num(f.merma) || 0,
      costCop: f.modo === "paquete" ? (packUnit ?? 0) : num(f.cost),
      packCostCop: f.modo === "paquete" ? Math.round(num(f.packCost)) : null,
      packQty: f.modo === "paquete" ? num(f.packQty) : null,
    };
    const r = isEdit ? await updateIngrediente({ id: editing!.id, ...common }) : await createIngrediente({ ...common, stockCurrent: num(f.stock) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(isEdit ? "Insumo guardado" : "Insumo creado", "ok");
    router.refresh();
    onClose();
  }

  async function archivar() {
    if (!editing) return;
    setSaving(true);
    const r = await deleteIngrediente({ id: editing.id });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(`${editing.name} archivado`);
    router.refresh();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isEdit ? `Editar ${editing!.name}` : "Nuevo insumo"}
      footer={
        <Button type="submit" form="insumo-form" block loading={saving}>
          {isEdit ? "Guardar" : "Crear insumo"}
        </Button>
      }
    >
      <form id="insumo-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        {error ? <p className="m-0 text-[15px] font-semibold text-late" role="alert">{error}</p> : null}
        <Field id="ins-name" label="Nombre" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoComplete="off" placeholder="Leche entera Alquería" />
        <div className="grid grid-cols-2 gap-3">
          <Select id="ins-cat" label="Categoría" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Sin categoría</option>
            {opts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select id="ins-unit" label="Unidad" value={f.unit} onChange={(e) => set("unit", e.target.value as Unit)} hint={isEdit ? "No cambia si está en recetas" : undefined}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
        {!isEdit ? <Field id="ins-stock" label={`¿Cuánto hay hoy? (${f.unit})`} inputMode="decimal" value={f.stock} onChange={(e) => set("stock", e.target.value)} error={errors.stock} /> : null}

        <div className="flex flex-col gap-2">
          <span className="ui-label">Costo</span>
          <Segmented
            size="sm"
            label="Cómo se compra"
            value={f.modo}
            onChange={(v) => set("modo", v)}
            options={[
              { value: "unidad", label: `Por ${f.unit}` },
              { value: "paquete", label: "Por paquete" },
            ]}
          />
          {f.modo === "unidad" ? (
            <Field id="ins-cost" label={`Costo por ${f.unit}`} inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} error={errors.cost} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field id="ins-pcost" label="Precio del paquete" inputMode="numeric" value={f.packCost} onChange={(e) => set("packCost", e.target.value)} error={errors.packCost} />
              <Field id="ins-pqty" label={`${f.unit} por paquete`} inputMode="decimal" value={f.packQty} onChange={(e) => set("packQty", e.target.value)} error={errors.packQty} />
              {packUnit != null ? <p className="ui-sub m-0 col-span-2">= {pesos(packUnit, { unit: true })} por {f.unit}</p> : null}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="ins-min" label={`Mínimo (${f.unit})`} inputMode="decimal" value={f.min} onChange={(e) => set("min", e.target.value)} error={errors.min} hint="Por debajo: «poco»" />
          <Field id="ins-merma" label="Merma estimada %" inputMode="decimal" value={f.merma} onChange={(e) => set("merma", e.target.value)} />
        </div>
        <p className="ui-sub m-0">
          Zona, presentación (bolsa de 900 ml…), niveles y proveedor:{" "}
          <Link href="/inventario/niveles" className="text-text font-semibold">
            Niveles
          </Link>
          .
        </p>

        {isEdit ? (
          <div className="border-t border-line pt-4 flex flex-wrap items-center gap-3">
            {confirmArchivar ? (
              <>
                <span className="ui-sub flex-1">Sale de las listas; el historial se conserva.</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmArchivar(false)}>
                  No
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={archivar} loading={saving}>
                  Archivar
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmArchivar(true)}>
                Archivar insumo
              </Button>
            )}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
