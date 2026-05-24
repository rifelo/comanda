"use client";

/**
 * NuevoProductoDrawer — right slide-in form for creating a producto.
 *
 * Mirrors the design at /tmp/comanda-design-2/comanda/project/comanda-productos.jsx
 * (lines 346-567): 5 fields, live margin preview, 3-button stock toggle,
 * optional photo upload. Submits via the createProducto Server Action.
 */
import * as React from "react";
import type {
  CatalogoCategoryNode,
  CatalogoRow,
  ProductoStockStatus,
} from "@/lib/types";
import { fmtCOP } from "@/lib/mock/productos";
import { Drawer } from "../_components/drawer";
import { createProducto, updateProducto } from "./actions";

type LeafOption = { id: string; label: string };

function flattenLeafCategorias(
  nodes: CatalogoCategoryNode[],
  parentLabel: string | null = null,
  acc: LeafOption[] = [],
): LeafOption[] {
  for (const n of nodes) {
    if (!n.id) continue; // skip the synthetic root
    const hasChildren = (n.children?.length ?? 0) > 0;
    if (hasChildren) {
      flattenLeafCategorias(n.children!, n.label, acc);
    } else {
      acc.push({
        id: n.id,
        label: parentLabel ? `${parentLabel} · ${n.label}` : n.label,
      });
    }
  }
  return acc;
}

const STOCK_OPTIONS: { value: ProductoStockStatus; label: string; danger?: boolean }[] = [
  { value: "ok", label: "Disponible" },
  { value: "bajo", label: "Stock bajo" },
  { value: "sin", label: "Sin stock", danger: true },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function NuevoProductoDrawer({
  open,
  onClose,
  categorias,
  defaultCategoryId,
  editData = null,
}: {
  open: boolean;
  onClose: () => void;
  categorias: CatalogoCategoryNode[];
  defaultCategoryId: string | null;
  editData?: CatalogoRow | null;
}) {
  const isEdit = !!editData;
  const leafOptions = React.useMemo(
    () => flattenLeafCategorias(categorias),
    [categorias],
  );

  const initialCategory = React.useMemo(() => {
    if (editData?.category_id && leafOptions.some((o) => o.id === editData.category_id)) {
      return editData.category_id;
    }
    if (defaultCategoryId && leafOptions.some((o) => o.id === defaultCategoryId)) {
      return defaultCategoryId;
    }
    return leafOptions[0]?.id ?? "";
  }, [editData, defaultCategoryId, leafOptions]);

  const [name, setName] = React.useState(editData?.name ?? "");
  const [sku, setSku] = React.useState(editData?.sku ?? "");
  const [categoryId, setCategoryId] = React.useState(initialCategory);
  const [price, setPrice] = React.useState(
    editData ? String(editData.price_cop) : "",
  );
  const [cost, setCost] = React.useState(
    editData ? String(editData.cost_cop) : "",
  );
  const [stock, setStock] = React.useState<ProductoStockStatus>(
    editData?.stock_status ?? "ok",
  );
  const [file, setFile] = React.useState<File | null>(null);

  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );

  // Sync form state whenever the drawer opens: in edit mode prefill from
  // editData, in create mode start blank (and inherit the rail's current
  // category from initialCategory).
  React.useEffect(() => {
    if (!open) return;
    if (editData) {
      setName(editData.name);
      setSku(editData.sku);
      setCategoryId(initialCategory);
      setPrice(String(editData.price_cop));
      setCost(String(editData.cost_cop));
      setStock(editData.stock_status);
    } else {
      setName("");
      setSku("");
      setCategoryId(initialCategory);
      setPrice("");
      setCost("");
      setStock("ok");
    }
    setFile(null);
    setError(null);
    setWarning(null);
    setFieldErrors({});
  }, [open, editData, initialCategory]);

  const priceNum = Number(price);
  const costNum = Number(cost);
  const margenPct =
    Number.isFinite(priceNum) && Number.isFinite(costNum) && priceNum > 0
      ? Math.round(((priceNum - costNum) / priceNum) * 100)
      : null;
  const utilidad =
    Number.isFinite(priceNum) && Number.isFinite(costNum) && priceNum > 0
      ? priceNum - costNum
      : null;

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_IMAGE_BYTES) {
      setFieldErrors((p) => ({
        ...p,
        image: "La foto supera 2 MB.",
      }));
      setFile(null);
      e.target.value = "";
      return;
    }
    setFieldErrors((p) => {
      const { image: _, ...rest } = p;
      void _;
      return rest;
    });
    setFile(f);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setWarning(null);
    setFieldErrors({});
    startTransition(async () => {
      const r = isEdit
        ? await updateProducto(null, formData)
        : await createProducto(null, formData);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        if (r.fieldErrors) setFieldErrors(r.fieldErrors);
        return;
      }
      if (r.warning) setWarning(r.warning);
      // Surface a warning if one exists; otherwise close.
      if (!r.warning) onClose();
    });
  }

  return (
    <Drawer
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={isEdit ? "Editar producto" : "Nuevo producto"}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="cmd-btn ghost"
            style={{ flex: 1, padding: "10px 14px" }}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="nuevo-producto-form"
            className="cmd-btn"
            style={{ flex: 2, padding: "10px 14px" }}
            disabled={pending}
          >
            {pending
              ? "Guardando…"
              : isEdit
                ? "Guardar cambios"
                : "Guardar producto"}
          </button>
        </>
      }
    >
      <form
        id="nuevo-producto-form"
        action={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {isEdit ? (
          <input type="hidden" name="id" value={editData.id} />
        ) : null}
        {error ? (
          <p
            role="alert"
            style={{
              color: "var(--red)",
              fontSize: 12,
              letterSpacing: "0.04em",
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : null}
        {warning ? (
          <p
            role="status"
            style={{
              color: "var(--amber)",
              fontSize: 12,
              letterSpacing: "0.04em",
              margin: 0,
            }}
          >
            {warning}
          </p>
        ) : null}

        <Field
          id="np-name"
          name="name"
          label="Nombre del producto *"
          value={name}
          onChange={(v) => setName(v)}
          placeholder="Ej. Daniel's Burger Clásica"
          error={fieldErrors.name}
          disabled={pending}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field
            id="np-sku"
            name="sku"
            label="SKU *"
            value={sku}
            onChange={(v) => setSku(v)}
            placeholder="HB-001"
            error={fieldErrors.sku}
            disabled={pending}
          />
          <SelectField
            id="np-category"
            name="category_id"
            label="Categoría"
            value={categoryId}
            onChange={(v) => setCategoryId(v)}
            error={fieldErrors.category_id}
            disabled={pending || leafOptions.length === 0}
            options={
              leafOptions.length === 0
                ? [{ value: "", label: "— sin categorías —" }]
                : leafOptions.map((o) => ({ value: o.id, label: o.label }))
            }
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field
            id="np-price"
            name="price_cop"
            label="Precio de venta (COP) *"
            type="number"
            inputMode="numeric"
            min="0"
            value={price}
            onChange={(v) => setPrice(v)}
            placeholder="24900"
            error={fieldErrors.price_cop}
            disabled={pending}
          />
          <Field
            id="np-cost"
            name="cost_cop"
            label="Costo (COP) *"
            type="number"
            inputMode="numeric"
            min="0"
            value={cost}
            onChange={(v) => setCost(v)}
            placeholder="9200"
            error={fieldErrors.cost_cop}
            disabled={pending}
          />
        </div>

        {margenPct !== null && utilidad !== null ? (
          <div
            className="bg-paper"
            style={{
              border: "1px dashed var(--rule)",
              padding: "10px 12px",
              display: "flex",
              gap: 20,
            }}
          >
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Margen
              </div>
              <div
                className="cmd-num"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color:
                    margenPct >= 60
                      ? "var(--green)"
                      : margenPct >= 50
                        ? "var(--ink)"
                        : "var(--amber)",
                }}
              >
                {margenPct}%
              </div>
            </div>
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Utilidad
              </div>
              <div
                className="cmd-num"
                style={{ fontSize: 16, fontWeight: 500 }}
              >
                ${fmtCOP(utilidad)}
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <FieldLabel htmlFor="np-stock-group">
            Estado inicial de stock
          </FieldLabel>
          <div
            id="np-stock-group"
            role="radiogroup"
            style={{ display: "flex", gap: 6, marginTop: 6 }}
          >
            {STOCK_OPTIONS.map((opt) => {
              const active = stock === opt.value;
              const accent = opt.danger ? "var(--red)" : "var(--ink)";
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setStock(opt.value)}
                  disabled={pending}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    border: `1px solid ${accent}`,
                    background: active ? accent : "transparent",
                    color: active ? "var(--paper-lt)" : accent,
                    cursor: "pointer",
                    minHeight: 0,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="stock_status" value={stock} />
        </div>

        <div>
          <FieldLabel htmlFor="np-image">Foto del producto</FieldLabel>
          <label
            htmlFor="np-image"
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: 90,
              border: "1px dashed var(--rule)",
              background: "var(--paper)",
              color: "var(--muted)",
              fontSize: 11,
              cursor: pending ? "not-allowed" : "pointer",
              textAlign: "center",
              padding: "0 12px",
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>□</span>
            <span>
              {file
                ? file.name
                : "Subir imagen (JPG, PNG — máx 2 MB)"}
            </span>
          </label>
          <input
            id="np-image"
            name="image"
            type="file"
            accept="image/jpeg,image/png"
            onChange={onFilePick}
            disabled={pending}
            style={{ display: "none" }}
          />
          {fieldErrors.image ? (
            <p
              style={{
                color: "var(--red)",
                fontSize: 10,
                marginTop: 4,
              }}
            >
              {fieldErrors.image}
            </p>
          ) : null}
        </div>

        {/* Bottom spacer so the last field isn't hidden behind the sticky
            footer. The Drawer body uses overflow-y: auto. */}
        <div style={{ height: 8 }} />
      </form>
    </Drawer>
  );
}

// ── inline form primitives ───────────────────────────────────────────

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-muted block"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function Field({
  id,
  name,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "value" | "onChange"
>) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={{
          borderBottom: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
          padding: "6px 0",
          marginTop: 4,
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
      {error ? (
        <p
          style={{
            color: "var(--red)",
            fontSize: 10,
            marginTop: 4,
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  error,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
} & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "id" | "name" | "value" | "onChange"
>) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={{
          borderBottom: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
          padding: "6px 0",
          marginTop: 4,
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p
          style={{
            color: "var(--red)",
            fontSize: 10,
            marginTop: 4,
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
