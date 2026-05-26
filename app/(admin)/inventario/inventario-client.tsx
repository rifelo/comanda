"use client";

/**
 * 02 · Inventario — org-scoped catálogo + stock control + conteo físico
 * collapsed into one section. Receives initial categorías + ingredientes
 * from the server component and routes every mutation through Supabase
 * server actions (insert / update for the catalog, ingrediente_movements
 * for stock-changing operations so the audit log stays the source of
 * truth for stock_current).
 */
import * as React from "react";
import type { Ingrediente, IngredienteCategoria } from "@/lib/types";
import { SectionCrumb, StockBar, CmdMiniLabel } from "../_components/shared";
import {
  adjustIngredienteStock,
  applyConteo,
  createIngrediente,
  createIngredienteCategoria,
  deleteIngrediente,
  updateIngrediente,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────────
// Tree helpers
// ─────────────────────────────────────────────────────────────────────────
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

interface VisibleRow {
  id: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

function visibleRows(nodes: TreeNode[], expanded: Set<string>): VisibleRow[] {
  const out: VisibleRow[] = [];
  const walk = (arr: TreeNode[]) => {
    for (const n of arr) {
      const hasChildren = n.children.length > 0;
      const isExp = expanded.has(n.id);
      out.push({ id: n.id, label: n.label, depth: n.depth, hasChildren, expanded: isExp });
      if (hasChildren && isExp) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function computeCategoryCounts(
  tree: TreeNode[],
  ingredientes: Ingrediente[],
): Map<string, number> {
  const direct = new Map<string, number>();
  for (const ing of ingredientes) {
    if (!ing.category_id) continue;
    direct.set(ing.category_id, (direct.get(ing.category_id) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  const walk = (n: TreeNode): number => {
    let total = direct.get(n.id) ?? 0;
    for (const c of n.children) total += walk(c);
    counts.set(n.id, total);
    return total;
  };
  for (const r of tree) walk(r);
  return counts;
}

const UNITS = ["kg", "g", "L", "ml", "und", "porción", "loncha", "bola"] as const;
type Unit = (typeof UNITS)[number];

function fmtCOP(n: number): string {
  return Number(n).toLocaleString("es-CO");
}

function fmtDelta(d: number): string {
  const v = Number(d.toFixed(2));
  return (v > 0 ? "+" : "") + v.toString();
}

// ─────────────────────────────────────────────────────────────────────────
// IngTree — left rail
// ─────────────────────────────────────────────────────────────────────────
function IngTree({
  total,
  tree,
  active,
  expanded,
  counts,
  onPick,
  onToggle,
}: {
  total: number;
  tree: TreeNode[];
  active: string;
  expanded: Set<string>;
  counts: Map<string, number>;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const rows = visibleRows(tree, expanded);
  return (
    <div className="flex flex-col" style={{ gap: 1 }}>
      {/* root virtual row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPick("all")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick("all");
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          background: active === "all" ? "var(--ink)" : "transparent",
          color: active === "all" ? "var(--paper-lt)" : "var(--ink)",
          fontSize: 11,
          borderRadius: 2,
          cursor: "pointer",
        }}
      >
        <span style={{ width: 8 }} />
        <span style={{ flex: 1, fontWeight: 600 }}>Todos los ingredientes</span>
        <span className="cmd-num" style={{ fontSize: 10, opacity: 0.7 }}>
          {total}
        </span>
      </div>
      {rows.map((row) => {
        const isActive = active === row.id;
        const count = counts.get(row.id) ?? 0;
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => onPick(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(row.id);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              paddingLeft: 8 + row.depth * 14,
              background: isActive ? "var(--ink)" : "transparent",
              color: isActive ? "var(--paper-lt)" : "var(--ink)",
              fontSize: 11,
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            {row.hasChildren ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={
                  row.expanded ? "Colapsar categoría" : "Expandir categoría"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(row.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(row.id);
                  }
                }}
                style={{
                  width: 12,
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 9,
                  opacity: 0.6,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {row.expanded ? "▾" : "▸"}
              </span>
            ) : (
              <span
                style={{
                  width: 12,
                  display: "inline-flex",
                  justifyContent: "center",
                  color: isActive ? "var(--paper-lt)" : "var(--muted)",
                  opacity: 0.7,
                }}
              >
                ·
              </span>
            )}
            <span style={{ flex: 1, fontWeight: 400 }}>{row.label}</span>
            <span className="cmd-num" style={{ fontSize: 10, opacity: 0.7 }}>
              {count}
            </span>
          </div>
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
// IngredienteDrawer — both "Nuevo" (create) and "Editar" (update) modes.
// When `editing` is provided the form pre-fills with that row's data,
// hides Stock actual (mutated via ± / conteo), and routes save to update.
// ─────────────────────────────────────────────────────────────────────────
function IngredienteDrawer({
  editing,
  categorias,
  depthById,
  pending,
  serverError,
  onClose,
  onSave,
}: {
  editing: Ingrediente | null;
  categorias: IngredienteCategoria[];
  depthById: Map<string, number>;
  pending: boolean;
  serverError: string | null;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    name: string;
    categoryId: string | null;
    unit: Unit;
    stockCurrent: number;
    stockMin: number;
    mermaPct: number;
    costCop: number;
  }) => void;
}) {
  const isEdit = editing !== null;
  const [form, setForm] = React.useState({
    name: editing?.name ?? "",
    categoryId: editing?.category_id ?? "",
    unit: ((editing?.unit as Unit) ?? "kg") as Unit,
    stock: editing ? String(editing.stock_current) : "",
    min: editing ? String(editing.stock_min) : "",
    merma: editing ? String(editing.merma_pct) : "",
    cost: editing ? String(editing.cost_cop) : "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [costFocused, setCostFocused] = React.useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const costDisplay =
    costFocused || form.cost === ""
      ? form.cost
      : `$ ${fmtCOP(Number(form.cost))}`;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Requerido";
    if (!isEdit) {
      if (!form.stock || isNaN(Number(form.stock)) || Number(form.stock) < 0)
        e.stock = "Inválido";
    }
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
      id: editing?.id,
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unit: form.unit,
      stockCurrent: isEdit ? Number(editing!.stock_current) : Number(form.stock),
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
        aria-label={isEdit ? "Editar ingrediente" : "Nuevo ingrediente"}
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
              Inventario · 02
            </div>
            <div
              className="font-slab"
              style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}
            >
              {isEdit ? "Editar ingrediente" : "Nuevo ingrediente"}
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
                onChange={(e) => set("unit", e.target.value as Unit)}
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
            {isEdit ? (
              <div>
                <label style={labelSt}>Stock actual</label>
                <div
                  className="cmd-num"
                  style={{
                    padding: "7px 9px",
                    border: "1.5px dashed var(--rule)",
                    background: "var(--paper)",
                    color: "var(--muted)",
                    fontSize: 12,
                  }}
                  title="Edita el stock con el botón ± de la fila o con Modo conteo."
                >
                  {Number(editing!.stock_current)} {editing!.unit}
                </div>
              </div>
            ) : (
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
            )}
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
                type="text"
                inputMode="numeric"
                value={costDisplay}
                disabled={pending}
                onFocus={() => setCostFocused(true)}
                onBlur={() => setCostFocused(false)}
                onChange={(e) =>
                  set("cost", e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="Ej. 18900"
                style={inputSt(errors.cost)}
              />
              {errors.cost ? <div style={errSt}>{errors.cost}</div> : null}
            </div>
          </div>

          {!isEdit && form.stock !== "" && form.min !== "" ? (
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
            {pending
              ? "Guardando…"
              : isEdit
                ? "Guardar cambios"
                : "Guardar ingrediente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// InventarioClient (root)
// ─────────────────────────────────────────────────────────────────────────
const GRID = "22px 1.4fr 1fr 60px 90px 130px 90px 90px 70px";

export function InventarioClient({
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
  const [editing, setEditing] = React.useState<Ingrediente | null>(null);
  const [catFormOpen, setCatFormOpen] = React.useState(false);
  const [drawerError, setDrawerError] = React.useState<string | null>(null);
  const [catError, setCatError] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [ajustarId, setAjustarId] = React.useState<string | null>(null);
  const [ajustarVal, setAjustarVal] = React.useState("");
  const [conteoMode, setConteoMode] = React.useState(false);
  const [conteoVals, setConteoVals] = React.useState<Record<string, string>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  const { tree, depthById } = React.useMemo(
    () => buildTree(categorias),
    [categorias],
  );

  // Tree expansion state — start with every parent expanded so the rail
  // looks identical to today's flat list on first load. New categories
  // created in this session are added to the set inside handleAddCategoria.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const c of initialCategorias) s.add(c.id);
    return s;
  });
  const toggleExpanded = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const categoryCounts = React.useMemo(
    () => computeCategoryCounts(tree, ingredientes),
    [tree, ingredientes],
  );

  const sortedCategorias = React.useMemo(
    () =>
      [...categorias].sort(
        (a, b) =>
          (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0) ||
          a.label.localeCompare(b.label),
      ),
    [categorias, depthById],
  );

  const cancelAjustar = () => {
    setAjustarId(null);
    setAjustarVal("");
  };

  const exitConteo = (discard: boolean) => {
    if (discard) setConteoVals({});
    setConteoMode(false);
  };

  // ── handlers ──────────────────────────────────────────────────────
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
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(res.categoria.id);
        if (parentId) next.add(parentId);
        return next;
      });
      setCat(res.categoria.id);
      setCatFormOpen(false);
    });
  };

  const handleSaveIngrediente = (input: {
    id?: string;
    name: string;
    categoryId: string | null;
    unit: Unit;
    stockCurrent: number;
    stockMin: number;
    mermaPct: number;
    costCop: number;
  }) => {
    setDrawerError(null);
    startTransition(async () => {
      if (input.id) {
        const res = await updateIngrediente({
          id: input.id,
          name: input.name,
          categoryId: input.categoryId,
          unit: input.unit,
          stockMin: input.stockMin,
          mermaPct: input.mermaPct,
          costCop: input.costCop,
        });
        if (!res.ok) {
          setDrawerError(res.error);
          return;
        }
        setIngredientes((prev) =>
          prev.map((i) =>
            i.id === input.id ? (res.ingrediente as Ingrediente) : i,
          ),
        );
      } else {
        const res = await createIngrediente({
          name: input.name,
          categoryId: input.categoryId,
          unit: input.unit,
          stockCurrent: input.stockCurrent,
          stockMin: input.stockMin,
          mermaPct: input.mermaPct,
          costCop: input.costCop,
        });
        if (!res.ok) {
          setDrawerError(res.error);
          return;
        }
        setIngredientes((prev) => [res.ingrediente as Ingrediente, ...prev]);
      }
      setDrawerOpen(false);
      setEditing(null);
    });
  };

  const handleDelete = (id: string) => {
    setRowError(null);
    startTransition(async () => {
      const res = await deleteIngrediente({ id });
      if (!res.ok) {
        setRowError(res.error);
        return;
      }
      setIngredientes((prev) => prev.filter((i) => i.id !== id));
      setDeleteId(null);
    });
  };

  const handleConfirmAjustar = (ing: Ingrediente) => {
    if (ajustarVal === "" || isNaN(Number(ajustarVal))) {
      cancelAjustar();
      return;
    }
    const newStock = Number(ajustarVal);
    setRowError(null);
    startTransition(async () => {
      const res = await adjustIngredienteStock({ id: ing.id, newStock });
      if (!res.ok) {
        setRowError(res.error);
        return;
      }
      setIngredientes((prev) =>
        prev.map((i) =>
          i.id === ing.id
            ? { ...i, stock_current: Number(res.ingrediente.stock_current) }
            : i,
        ),
      );
      cancelAjustar();
    });
  };

  const handleApplyConteo = () => {
    const counts = Object.entries(conteoVals)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([id, v]) => ({ id, physicalCount: Number(v) }));
    if (counts.length === 0) {
      exitConteo(true);
      return;
    }
    setRowError(null);
    startTransition(async () => {
      const res = await applyConteo({ counts });
      if (!res.ok) {
        setRowError(res.error);
        return;
      }
      const byId = new Map<string, number>(
        res.updated.map((u: { id: string; stock_current: number }) => [
          u.id,
          Number(u.stock_current),
        ]),
      );
      setIngredientes((prev) =>
        prev.map((i) =>
          byId.has(i.id) ? { ...i, stock_current: byId.get(i.id)! } : i,
        ),
      );
      setConteoVals({});
      setConteoMode(false);
    });
  };

  // ── derived ───────────────────────────────────────────────────────
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
        <IngredienteDrawer
          editing={editing}
          categorias={sortedCategorias}
          depthById={depthById}
          pending={isPending}
          serverError={drawerError}
          onClose={() => {
            setDrawerOpen(false);
            setEditing(null);
            setDrawerError(null);
          }}
          onSave={handleSaveIngrediente}
        />
      ) : null}

      <SectionCrumb
        section="inventario"
        right={
          <>
            <button
              type="button"
              className={`cmd-btn ${conteoMode ? "" : "ghost"} sm`}
              disabled={isPending}
              onClick={() => {
                if (conteoMode) {
                  handleApplyConteo();
                } else {
                  cancelAjustar();
                  setConteoVals({});
                  setConteoMode(true);
                }
              }}
            >
              {conteoMode ? "✓ Aplicar conteo" : "Modo conteo"}
            </button>
            {conteoMode ? (
              <button
                type="button"
                className="cmd-btn ghost sm"
                disabled={isPending}
                onClick={() => exitConteo(true)}
              >
                Cancelar conteo
              </button>
            ) : (
              <button type="button" className="cmd-btn ghost sm">
                Importar
              </button>
            )}
            <button
              type="button"
              className="cmd-btn sm"
              disabled={conteoMode}
              onClick={() => {
                setEditing(null);
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
            expanded={expanded}
            counts={categoryCounts}
            onPick={setCat}
            onToggle={toggleExpanded}
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

          {rowError ? (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontSize: 11,
                background: "var(--paper)",
              }}
            >
              {rowError}
            </div>
          ) : null}

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
              <span style={{ textAlign: "right" }}>
                {conteoMode ? "Sistema" : "Stock"}
              </span>
              <span>{conteoMode ? "Conteo físico" : "Stock vs mínimo"}</span>
              <span style={{ textAlign: "right" }}>
                {conteoMode ? "Diferencia" : "Merma"}
              </span>
              <span style={{ textAlign: "right" }}>Costo / U</span>
              <span />
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
              const fisicoRaw = conteoVals[ing.id];
              const fisico =
                conteoMode && fisicoRaw !== undefined && fisicoRaw !== ""
                  ? Number(fisicoRaw)
                  : null;
              const diff = fisico !== null ? fisico - Number(ing.stock_current) : null;
              const isDeleting = deleteId === ing.id;
              const isAdjusting = ajustarId === ing.id;
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

                  {/* col 6: StockBar | ajustar input | conteo input */}
                  {conteoMode ? (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={fisicoRaw ?? ""}
                      onChange={(e) =>
                        setConteoVals((v) => ({ ...v, [ing.id]: e.target.value }))
                      }
                      placeholder="Contar…"
                      style={{
                        border: "1.5px solid var(--ink)",
                        padding: "4px 8px",
                        fontSize: 12,
                        width: "100%",
                        background: "var(--paper-lt)",
                        color: "var(--ink)",
                        outline: "none",
                        textAlign: "right",
                      }}
                    />
                  ) : isAdjusting ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        autoFocus
                        value={ajustarVal}
                        disabled={isPending}
                        onChange={(e) => setAjustarVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleConfirmAjustar(ing);
                          if (e.key === "Escape") cancelAjustar();
                        }}
                        style={{
                          flex: 1,
                          border: "1.5px solid var(--ink)",
                          padding: "4px 6px",
                          fontSize: 11,
                          background: "var(--paper-lt)",
                          color: "var(--ink)",
                          outline: "none",
                          textAlign: "right",
                          minWidth: 0,
                        }}
                      />
                      <button
                        type="button"
                        title="Confirmar"
                        disabled={isPending}
                        onClick={() => handleConfirmAjustar(ing)}
                        style={{
                          background: "var(--ink)",
                          color: "var(--paper-lt)",
                          border: "none",
                          fontSize: 10,
                          padding: "4px 7px",
                          cursor: "pointer",
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        title="Cancelar"
                        onClick={cancelAjustar}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--rule)",
                          fontSize: 10,
                          padding: "4px 7px",
                          cursor: "pointer",
                          color: "var(--muted)",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
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
                  )}

                  {/* col 7: Merma | Diferencia */}
                  {conteoMode ? (
                    <div
                      className="cmd-num"
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          diff === null
                            ? "var(--muted)"
                            : diff < 0
                              ? "var(--red)"
                              : diff > 0
                                ? "var(--amber)"
                                : "var(--green)",
                      }}
                    >
                      {diff === null ? "—" : fmtDelta(diff)}
                    </div>
                  ) : (
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
                  )}

                  <div
                    className="cmd-num"
                    style={{ textAlign: "right", fontSize: 12 }}
                  >
                    ${fmtCOP(ing.cost_cop)}
                  </div>

                  {/* col 9: row actions */}
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      justifyContent: "flex-end",
                      alignItems: "center",
                    }}
                  >
                    {isDeleting ? (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(ing.id)}
                          style={{
                            background: "var(--red)",
                            color: "var(--paper-lt)",
                            border: "none",
                            fontSize: 10,
                            padding: "3px 6px",
                            cursor: "pointer",
                          }}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(null)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--rule)",
                            fontSize: 10,
                            padding: "3px 6px",
                            cursor: "pointer",
                            color: "var(--ink)",
                          }}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        {!conteoMode && !isAdjusting ? (
                          <button
                            type="button"
                            title="Ajustar stock"
                            disabled={isPending}
                            onClick={() => {
                              setRowError(null);
                              setAjustarId(ing.id);
                              setAjustarVal(String(ing.stock_current));
                            }}
                            style={{
                              background: "none",
                              border: "1px solid var(--rule)",
                              color: "var(--muted)",
                              fontSize: 10,
                              cursor: "pointer",
                              padding: "2px 5px",
                              letterSpacing: "0.1em",
                            }}
                          >
                            ±
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Editar"
                          disabled={conteoMode || isAdjusting}
                          onClick={() => {
                            setEditing(ing);
                            setDrawerError(null);
                            setDrawerOpen(true);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--muted)",
                            fontSize: 13,
                            cursor: "pointer",
                            padding: "2px 4px",
                          }}
                        >
                          ✏
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          disabled={conteoMode || isAdjusting}
                          onClick={() => {
                            setRowError(null);
                            setDeleteId(ing.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--red)",
                            fontSize: 12,
                            cursor: "pointer",
                            padding: "2px 4px",
                          }}
                        >
                          ✕
                        </button>
                      </>
                    )}
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
