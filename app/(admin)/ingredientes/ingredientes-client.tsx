"use client";

/**
 * 02 · Ingredientes — org-scoped catalog + 4-level tree. Receives initial
 * categorias + ingredientes from the server component; calls server actions
 * to persist new categories and ingredients.
 */
import * as React from "react";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import { SectionCrumb, StockBar, CmdMiniLabel } from "../_components/shared";
import {
  createIngrediente,
  createIngredienteCategoria,
} from "./actions";

interface TreeNode {
  id: string;
  label: string;
  depth: number;
  children: TreeNode[];
}

function buildTree(rows: IngredienteCategoria[]): {
  tree: TreeNode[];
  depthById: Map<string, number>;
} {
  const byId = new Map<string, TreeNode>();
  for (const r of rows) {
    byId.set(r.id, { id: r.id, label: r.label, depth: 0, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id) byId.get(r.parent_id)?.children.push(node);
    else roots.push(node);
  }
  const depthById = new Map<string, number>();
  const walk = (nodes: TreeNode[], d: number) => {
    for (const n of nodes) {
      n.depth = d;
      depthById.set(n.id, d);
      walk(n.children, d + 1);
    }
  };
  walk(roots, 0);
  return { tree: roots, depthById };
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

const UNITS = ["kg", "g", "L", "ml", "und", "porción", "loncha", "bola"] as const;

function fmtCOP(n: number): string {
  return Number(n).toLocaleString("es-CO");
}

// ─────────────────────────────────────────────────────────────────────────
// IngTree — left rail
// ─────────────────────────────────────────────────────────────────────────
function IngTree({
  total,
  tree,
  active,
  onPick,
}: {
  total: number;
  tree: TreeNode[];
  active: string;
  onPick: (id: string) => void;
}) {
  const flat = flattenTree(tree);
  const items: { id: string; label: string; depth: number; root?: boolean }[] = [
    { id: "all", label: "Todos los ingredientes", depth: 0, root: true },
    ...flat.map((n) => ({ id: n.id, label: n.label, depth: n.depth })),
  ];
  return (
    <div className="flex flex-col" style={{ gap: 1 }}>
      {items.map((row) => {
        const isActive = active === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onPick(row.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              textAlign: "left",
              padding: "5px 8px",
              paddingLeft: 8 + row.depth * 14,
              background: isActive ? "var(--ink)" : "transparent",
              color: isActive ? "var(--paper-lt)" : "var(--ink)",
              border: "none",
              fontSize: 11,
              borderRadius: 2,
              minHeight: 0,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 8 }} />
            <span style={{ flex: 1, fontWeight: row.root ? 600 : 400 }}>
              {row.label}
            </span>
            {row.root ? (
              <span className="cmd-num" style={{ fontSize: 10, opacity: 0.7 }}>
                {total}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NuevaCategoriaForm — inline form in the tree panel
// ─────────────────────────────────────────────────────────────────────────
function NuevaCategoriaForm({
  categorias,
  depthById,
  pending,
  onSave,
  onCancel,
}: {
  categorias: IngredienteCategoria[];
  depthById: Map<string, number>;
  pending: boolean;
  onSave: (input: { label: string; parentId: string | null }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = React.useState("");
  const [parent, setParent] = React.useState<string>("root");
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cap parent depth at 2 so a new child stays within the 4-level UI tree.
  const parentCandidates = categorias.filter(
    (c) => (depthById.get(c.id) ?? 0) <= 2,
  );

  const handleSave = () => {
    if (!label.trim()) {
      setError("Requerido");
      return;
    }
    onSave({
      label: label.trim(),
      parentId: parent === "root" ? null : parent,
    });
  };

  const inputSt: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 11,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "6px 8px",
    border: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
    outline: "none",
    marginBottom: 2,
  };
  const labelSt: React.CSSProperties = {
    display: "block",
    fontSize: 8,
    color: "var(--muted)",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    marginBottom: 3,
  };

  return (
    <div
      style={{
        margin: "8px 0 0",
        padding: "10px 8px 12px",
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--muted)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        Nueva categoría
      </div>

      <div>
        <label style={labelSt}>Nombre *</label>
        <input
          ref={inputRef}
          value={label}
          disabled={pending}
          onChange={(e) => {
            setLabel(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Ej. Mariscos"
          style={inputSt}
        />
        {error ? (
          <div style={{ fontSize: 10, color: "var(--red)" }}>{error}</div>
        ) : null}
      </div>

      <div>
        <label style={labelSt}>Categoría padre</label>
        <select
          value={parent}
          disabled={pending}
          onChange={(e) => setParent(e.target.value)}
          style={{
            ...inputSt,
            marginBottom: 0,
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <option value="root">— Nivel raíz —</option>
          {parentCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(depthById.get(c.id) ?? 0)}
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="cmd-btn ghost sm"
          style={{ flex: 1, fontSize: 10 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="cmd-btn sm"
          style={{ flex: 2, fontSize: 10 }}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NuevoIngredienteDrawer
// ─────────────────────────────────────────────────────────────────────────
function NuevoIngredienteDrawer({
  categorias,
  depthById,
  pending,
  serverError,
  onClose,
  onSave,
}: {
  categorias: IngredienteCategoria[];
  depthById: Map<string, number>;
  pending: boolean;
  serverError: string | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    categoryId: string | null;
    unit: (typeof UNITS)[number];
    stockCurrent: number;
    stockMin: number;
    mermaPct: number;
    costCop: number;
  }) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    categoryId: "" as string,
    unit: "kg" as (typeof UNITS)[number],
    stock: "",
    min: "",
    merma: "",
    cost: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Requerido";
    if (!form.stock || isNaN(Number(form.stock)) || Number(form.stock) < 0)
      e.stock = "Inválido";
    if (!form.min || isNaN(Number(form.min)) || Number(form.min) < 0)
      e.min = "Inválido";
    if (!form.cost || isNaN(Number(form.cost)) || Number(form.cost) <= 0)
      e.cost = "Inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unit: form.unit,
      stockCurrent: Number(form.stock),
      stockMin: Number(form.min),
      mermaPct: form.merma ? Number(form.merma) : 0,
      costCop: Math.round(Number(form.cost)),
    });
  };

  const inputSt = (err?: string): React.CSSProperties => ({
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 12,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "7px 9px",
    border: `1.5px solid ${err ? "var(--red)" : "var(--ink)"}`,
    outline: "none",
  });
  const labelSt: React.CSSProperties = {
    display: "block",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
  };
  const errSt: React.CSSProperties = {
    fontSize: 10,
    color: "var(--red)",
    marginTop: 3,
  };
  const rowGap: React.CSSProperties = { marginBottom: 16 };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(30,25,18,.32)",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />

      <div
        role="dialog"
        aria-label="Nuevo ingrediente"
        style={{
          position: "relative",
          zIndex: 1,
          width: 400,
          maxWidth: "100%",
          height: "100%",
          background: "var(--paper-lt)",
          borderLeft: "1.5px solid var(--ink)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="bg-paper"
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1.5px solid var(--ink)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: "var(--muted)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Ingredientes · 02
            </div>
            <div
              className="font-slab"
              style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}
            >
              Nuevo ingrediente
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--rule)",
              fontSize: 12,
              color: "var(--muted)",
              padding: "4px 9px",
              cursor: "pointer",
            }}
          >
            ✕ cerrar
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px 22px 0" }}>
          <div style={rowGap}>
            <label style={labelSt}>Nombre del ingrediente *</label>
            <input
              value={form.name}
              disabled={pending}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej. Carne molida 80/20"
              style={inputSt(errors.name)}
            />
            {errors.name ? <div style={errSt}>{errors.name}</div> : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              ...rowGap,
            }}
          >
            <div>
              <label style={labelSt}>Categoría</label>
              <select
                value={form.categoryId}
                disabled={pending}
                onChange={(e) => set("categoryId", e.target.value)}
                style={{ ...inputSt(), appearance: "none", cursor: "pointer" }}
              >
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"  ".repeat(depthById.get(c.id) ?? 0)}
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelSt}>Unidad de medida</label>
              <select
                value={form.unit}
                disabled={pending}
                onChange={(e) =>
                  set("unit", e.target.value as (typeof UNITS)[number])
                }
                style={{ ...inputSt(), appearance: "none", cursor: "pointer" }}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              ...rowGap,
            }}
          >
            <div>
              <label style={labelSt}>Stock actual *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.stock}
                disabled={pending}
                onChange={(e) => set("stock", e.target.value)}
                placeholder="Ej. 14.2"
                style={inputSt(errors.stock)}
              />
              {errors.stock ? <div style={errSt}>{errors.stock}</div> : null}
            </div>
            <div>
              <label style={labelSt}>Stock mínimo *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.min}
                disabled={pending}
                onChange={(e) => set("min", e.target.value)}
                placeholder="Ej. 8"
                style={inputSt(errors.min)}
              />
              {errors.min ? <div style={errSt}>{errors.min}</div> : null}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              ...rowGap,
            }}
          >
            <div>
              <label style={labelSt}>Merma estimada (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={form.merma}
                disabled={pending}
                onChange={(e) => set("merma", e.target.value)}
                placeholder="Ej. 3.2"
                style={inputSt()}
              />
            </div>
            <div>
              <label style={labelSt}>Costo / unidad (COP) *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.cost}
                disabled={pending}
                onChange={(e) => set("cost", e.target.value)}
                placeholder="Ej. 18900"
                style={inputSt(errors.cost)}
              />
              {errors.cost ? <div style={errSt}>{errors.cost}</div> : null}
            </div>
          </div>

          {form.stock !== "" && form.min !== "" ? (
            <div
              className="bg-paper"
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                border: "1px dashed var(--rule)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "var(--muted)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Vista previa de stock
              </div>
              <StockBar
                value={Number(form.stock)}
                min={Number(form.min)}
                max={Math.max(
                  Number(form.min) * 2.5,
                  Number(form.stock) * 1.1,
                  1,
                )}
                unit={form.unit}
              />
            </div>
          ) : null}

          {serverError ? (
            <div
              style={{
                marginBottom: 16,
                padding: "8px 10px",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontSize: 11,
                background: "var(--paper)",
              }}
            >
              {serverError}
            </div>
          ) : null}
        </div>

        <div
          className="bg-paper"
          style={{
            padding: "14px 22px 18px",
            borderTop: "1.5px solid var(--ink)",
            display: "flex",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="cmd-btn ghost"
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="cmd-btn"
            style={{ flex: 2 }}
          >
            {pending ? "Guardando…" : "Guardar ingrediente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// IngredientesClient (root)
// ─────────────────────────────────────────────────────────────────────────
const GRID = "22px 1.4fr 1fr 60px 90px 130px 90px 90px";

export function IngredientesClient({
  initialCategorias,
  initialIngredientes,
}: {
  initialCategorias: IngredienteCategoria[];
  initialIngredientes: Ingrediente[];
}) {
  const [categorias, setCategorias] = React.useState(initialCategorias);
  const [ingredientes, setIngredientes] = React.useState(initialIngredientes);
  const [cat, setCat] = React.useState("all");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [catFormOpen, setCatFormOpen] = React.useState(false);
  const [drawerError, setDrawerError] = React.useState<string | null>(null);
  const [catError, setCatError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const { tree, depthById } = React.useMemo(
    () => buildTree(categorias),
    [categorias],
  );

  // Sort for the parent / category selects: depth-major, then label.
  const sortedCategorias = React.useMemo(
    () =>
      [...categorias].sort(
        (a, b) =>
          (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0) ||
          a.label.localeCompare(b.label),
      ),
    [categorias, depthById],
  );

  const handleAddCategoria = ({
    label,
    parentId,
  }: {
    label: string;
    parentId: string | null;
  }) => {
    setCatError(null);
    startTransition(async () => {
      const res = await createIngredienteCategoria({ label, parentId });
      if (!res.ok) {
        setCatError(res.error);
        return;
      }
      setCategorias((prev) => [...prev, res.categoria as IngredienteCategoria]);
      setCat(res.categoria.id);
      setCatFormOpen(false);
    });
  };

  const handleAddIngrediente = (input: {
    name: string;
    categoryId: string | null;
    unit: (typeof UNITS)[number];
    stockCurrent: number;
    stockMin: number;
    mermaPct: number;
    costCop: number;
  }) => {
    setDrawerError(null);
    startTransition(async () => {
      const res = await createIngrediente(input);
      if (!res.ok) {
        setDrawerError(res.error);
        return;
      }
      setIngredientes((prev) => [res.ingrediente as Ingrediente, ...prev]);
      setDrawerOpen(false);
    });
  };

  const lowStockCount = ingredientes.filter(
    (i) => Number(i.stock_current) < Number(i.stock_min),
  ).length;
  const highMermaCount = ingredientes.filter(
    (i) => Number(i.merma_pct) >= 5,
  ).length;

  const kpis = [
    { label: "Ingredientes activos", val: String(ingredientes.length) },
    {
      label: "En stock bajo",
      val: String(lowStockCount),
      tone: "var(--amber)",
    },
    { label: "Merma > 5%", val: String(highMermaCount), tone: "var(--red)" },
    { label: "Costo prom. plato", val: "$ —" },
  ];

  return (
    <div style={{ position: "relative" }}>
      {drawerOpen ? (
        <NuevoIngredienteDrawer
          categorias={sortedCategorias}
          depthById={depthById}
          pending={isPending}
          serverError={drawerError}
          onClose={() => {
            setDrawerOpen(false);
            setDrawerError(null);
          }}
          onSave={handleAddIngrediente}
        />
      ) : null}

      <SectionCrumb
        section="ingredientes"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Importar
            </button>
            <button
              type="button"
              className="cmd-btn sm"
              onClick={() => {
                setDrawerError(null);
                setDrawerOpen(true);
              }}
            >
              + Nuevo ingrediente
            </button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          minHeight: "calc(100vh - 120px)",
        }}
      >
        <div
          className="cmd-paper-lt"
          style={{
            borderRight: "1px dashed var(--rule)",
            padding: "14px 12px",
          }}
        >
          <CmdMiniLabel>Árbol jerárquico</CmdMiniLabel>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "0 4px 8px",
            }}
          >
            Categoría → Subcat. → Principal → Subingrediente
          </div>
          <IngTree
            total={ingredientes.length}
            tree={tree}
            active={cat}
            onPick={setCat}
          />
          {catFormOpen ? (
            <NuevaCategoriaForm
              categorias={sortedCategorias}
              depthById={depthById}
              pending={isPending}
              onSave={handleAddCategoria}
              onCancel={() => {
                setCatFormOpen(false);
                setCatError(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setCatError(null);
                setCatFormOpen(true);
              }}
              className="cmd-link"
              style={{
                padding: "10px 8px 0",
                fontSize: 11,
                color: "var(--muted)",
                minHeight: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              + nueva categoría
            </button>
          )}
          {catError ? (
            <div
              style={{
                marginTop: 8,
                padding: "6px 8px",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontSize: 10,
                background: "var(--paper)",
              }}
            >
              {catError}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "16px 22px 24px" }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {kpis.map((k) => (
              <div
                key={k.label}
                style={{
                  borderLeft: `2px solid ${k.tone || "var(--ink)"}`,
                  paddingLeft: 12,
                }}
              >
                <div
                  className="text-muted"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  {k.label}
                </div>
                <div
                  className="cmd-num font-slab"
                  style={{ fontSize: 26, lineHeight: 1, marginTop: 4 }}
                >
                  {k.val}
                </div>
              </div>
            ))}
          </div>

          <div
            className="cmd-paper-lt"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            <div
              className="bg-paper"
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 10,
                padding: "8px 12px",
                borderBottom: "1.5px solid var(--ink)",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 600,
              }}
            >
              <span />
              <span>Ingrediente</span>
              <span>Categoría</span>
              <span style={{ textAlign: "center" }}>Unidad</span>
              <span style={{ textAlign: "right" }}>Stock</span>
              <span>Stock vs mínimo</span>
              <span style={{ textAlign: "right" }}>Merma</span>
              <span style={{ textAlign: "right" }}>Costo / U</span>
            </div>

            {ingredientes.length === 0 ? (
              <div
                className="text-muted"
                style={{
                  padding: "40px 18px",
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                Aún no hay ingredientes. Usa “+ Nuevo ingrediente” para crear el primero.
              </div>
            ) : null}

            {ingredientes.map((ing, i) => {
              const categoryName =
                categorias.find((c) => c.id === ing.category_id)?.label ?? "—";
              return (
                <div
                  key={ing.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    gap: 10,
                    padding: "10px 12px",
                    alignItems: "center",
                    borderBottom: "1px dashed var(--rule-soft)",
                    background: i % 2 ? "var(--paper-lt)" : "var(--paper)",
                  }}
                >
                  <span style={{ color: "var(--rule)", fontSize: 10 }}>·</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {ing.name}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                    {categoryName}
                  </div>
                  <div
                    className="text-muted cmd-num"
                    style={{ textAlign: "center", fontSize: 11 }}
                  >
                    {ing.unit}
                  </div>
                  <div
                    className="cmd-num"
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {Number(ing.stock_current)}
                  </div>
                  <StockBar
                    value={Number(ing.stock_current)}
                    min={Number(ing.stock_min)}
                    max={Math.max(
                      Number(ing.stock_min) * 2.5,
                      Number(ing.stock_current) * 1.1,
                      1,
                    )}
                    unit={ing.unit}
                  />
                  <div
                    className="cmd-num"
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      color:
                        Number(ing.merma_pct) >= 5
                          ? "var(--red)"
                          : Number(ing.merma_pct) >= 2
                            ? "var(--amber)"
                            : "var(--muted)",
                    }}
                  >
                    {Number(ing.merma_pct)}%
                  </div>
                  <div
                    className="cmd-num"
                    style={{ textAlign: "right", fontSize: 12 }}
                  >
                    ${fmtCOP(ing.cost_cop)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
