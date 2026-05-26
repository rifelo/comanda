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
  deleteIngredienteCategoria,
  updateIngrediente,
  updateIngredienteCategoria,
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

// Keep in sync with the Zod `UNITS` in ./actions.ts — `caja` and `bulto`
// are pack-level primaries that pair with a secondary unit + conversion
// factor (e.g. 1 caja = 12 und) via the dual-unit fields on Ingrediente.
const UNITS = [
  "kg",
  "g",
  "L",
  "ml",
  "und",
  "porción",
  "loncha",
  "bola",
  "caja",
  "bulto",
] as const;
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
const ROW_H = 32;

function IngTree({
  total,
  tree,
  active,
  expanded,
  counts,
  pending,
  onPick,
  onToggle,
  onRemove,
  onRename,
}: {
  total: number;
  tree: TreeNode[];
  active: string;
  expanded: Set<string>;
  counts: Map<string, number>;
  pending: boolean;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
}) {
  const rows = visibleRows(tree, expanded);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameVal, setRenameVal] = React.useState("");

  // Outside-click closes the ··· popover. Scoped to mousedown so we
  // close *before* the click lands on a tree row underneath.
  React.useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-tree-menu]")) return;
      setMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuId]);

  // Optimistic-close: surface the new label immediately and rely on the
  // parent's catError banner if the server action rejects.
  const commitRename = (id: string) => {
    const v = renameVal.trim();
    if (!v) return;
    onRename(id, v);
    setRenameId(null);
    setRenameVal("");
  };
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
          padding: "0 8px",
          background: active === "all" ? "var(--ink)" : "transparent",
          color: active === "all" ? "var(--paper-lt)" : "var(--ink)",
          fontSize: 11,
          borderRadius: 2,
          // Unified row height — every node (root, parent, leaf, rename,
          // confirm) aligns to the same 32px grid. globals.css forces 44px
          // min-height on every [role="button"] so we override explicitly.
          minHeight: ROW_H,
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
        const isHov = hoverId === row.id;
        const isConfirm = confirmId === row.id;
        const isRenaming = renameId === row.id;
        const isMenuOpen = menuId === row.id;
        const count = counts.get(row.id) ?? 0;

        // ── Inline rename strip ───────────────────────────────────────
        if (isRenaming) {
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                minHeight: ROW_H,
                padding: "0 6px",
                paddingLeft: 8 + row.depth * 14,
              }}
            >
              <input
                autoFocus
                value={renameVal}
                disabled={pending}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(row.id);
                  if (e.key === "Escape") setRenameId(null);
                }}
                style={{
                  flex: 1,
                  border: "1.5px solid var(--ink)",
                  padding: "3px 6px",
                  fontSize: 11,
                  background: "var(--paper-lt)",
                  color: "var(--ink)",
                  outline: "none",
                  minHeight: 0,
                }}
              />
              <button
                type="button"
                aria-label="Confirmar renombrar"
                disabled={pending}
                onClick={() => commitRename(row.id)}
                style={{
                  background: "var(--ink)",
                  color: "var(--paper-lt)",
                  border: "none",
                  fontSize: 9,
                  padding: "4px 7px",
                  cursor: "pointer",
                  minHeight: 0,
                }}
              >
                ✓
              </button>
              <button
                type="button"
                aria-label="Cancelar renombrar"
                onClick={() => setRenameId(null)}
                style={{
                  background: "transparent",
                  color: "var(--muted)",
                  border: "1px solid var(--rule)",
                  fontSize: 9,
                  padding: "3px 7px",
                  cursor: "pointer",
                  minHeight: 0,
                }}
              >
                ✕
              </button>
            </div>
          );
        }

        // ── Delete confirm strip ──────────────────────────────────────
        if (isConfirm) {
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                minHeight: ROW_H,
                padding: "0 8px",
                paddingLeft: 8 + row.depth * 14,
                background: "var(--paper)",
                border: "1px solid var(--red)",
                fontSize: 10,
              }}
            >
              <span
                style={{
                  flex: 1,
                  color: "var(--red)",
                  letterSpacing: "0.08em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                ¿Eliminar «{row.label}»?
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(row.id);
                  setConfirmId(null);
                }}
                style={{
                  background: "var(--red)",
                  color: "var(--paper-lt)",
                  border: "none",
                  fontSize: 9,
                  padding: "3px 8px",
                  cursor: "pointer",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  minHeight: 0,
                }}
              >
                Sí
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(null);
                }}
                style={{
                  background: "transparent",
                  color: "var(--ink)",
                  border: "1px solid var(--rule)",
                  fontSize: 9,
                  padding: "3px 8px",
                  cursor: "pointer",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  minHeight: 0,
                }}
              >
                No
              </button>
            </div>
          );
        }

        // ── Normal row ────────────────────────────────────────────────
        const showMenuBtn = isHov || isActive || isMenuOpen;
        return (
          <div
            key={row.id}
            onMouseEnter={() => setHoverId(row.id)}
            onMouseLeave={() =>
              setHoverId((prev) => (prev === row.id ? null : prev))
            }
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: ROW_H,
              background: isActive ? "var(--ink)" : "transparent",
              borderRadius: 2,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onPick(row.id);
                setMenuId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(row.id);
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                minHeight: ROW_H,
                padding: "0 0 0 8px",
                paddingLeft: 8 + row.depth * 14,
                color: isActive ? "var(--paper-lt)" : "var(--ink)",
                fontSize: 11,
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
                    minHeight: 0,
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
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </span>
              <span
                className="cmd-num"
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            </div>

            {/*
              ··· menu slot — always in flex flow so the row's width
              never jitters and the count never sits under the button.
              The button itself is hidden via `visibility` unless the
              row is hovered, active, or the menu is open, so the slot
              still reserves its space at rest.
            */}
            <div
              data-tree-menu
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                padding: "0 4px 0 2px",
                color: isActive ? "var(--paper-lt)" : "var(--muted)",
              }}
            >
              <button
                type="button"
                aria-label={`Acciones de ${row.label}`}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                tabIndex={showMenuBtn ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(isMenuOpen ? null : row.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  padding: "0 4px",
                  lineHeight: 1,
                  minHeight: 0,
                  visibility: showMenuBtn ? "visible" : "hidden",
                }}
              >
                ···
              </button>
              {isMenuOpen ? (
                <div
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    zIndex: 30,
                    background: "var(--paper-lt)",
                    border: "1.5px solid var(--ink)",
                    minWidth: 130,
                    boxShadow: "2px 4px 12px rgba(0,0,0,0.12)",
                    color: "var(--ink)",
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRenameVal(row.label);
                      setRenameId(row.id);
                      setMenuId(null);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "8px 12px",
                      fontSize: 11,
                      color: "var(--ink)",
                      cursor: "pointer",
                      minHeight: 0,
                    }}
                  >
                    ✏ Renombrar
                  </button>
                  <div style={{ height: 1, background: "var(--rule)" }} />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmId(row.id);
                      setMenuId(null);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "8px 12px",
                      fontSize: 11,
                      color: "var(--red)",
                      cursor: "pointer",
                      minHeight: 0,
                    }}
                  >
                    ✕ Eliminar
                  </button>
                </div>
              ) : null}
            </div>
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
    unit2: Unit | null;
    conversionFactor: number | null;
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
    // Dual-unit fields. `hasUnit2` is the toggle; `unit2` is "" until the
    // user picks one (avoids forcing a default that disagrees with `unit`).
    // `convFactor` is a string for input binding — coerced on save.
    hasUnit2: !!editing?.unit2,
    unit2: (editing?.unit2 ?? "") as Unit | "",
    convFactor:
      editing?.conversion_factor != null
        ? String(editing.conversion_factor)
        : "",
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
    if (form.hasUnit2) {
      if (!form.unit2.trim()) e.unit2 = "Selecciona la segunda unidad";
      // Factor stays optional even with the toggle on — but if provided it
      // must be a positive number (matches the DB check constraint).
      if (form.convFactor !== "") {
        const n = Number(form.convFactor);
        if (isNaN(n) || n <= 0) e.convFactor = "Inválido";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const unit2Send: Unit | null =
      form.hasUnit2 && form.unit2 ? (form.unit2 as Unit) : null;
    const factorSend: number | null =
      form.hasUnit2 && form.convFactor ? Number(form.convFactor) : null;
    onSave({
      id: editing?.id,
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unit: form.unit,
      unit2: unit2Send,
      conversionFactor: factorSend,
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

          {/* Dual-unit toggle. When on, the dashed inner box reveals the
              secondary-unit dropdown + optional conversion factor. We filter
              out `form.unit` so the two units can never be the same. */}
          <div style={rowGap}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--ink)",
                cursor: pending ? "default" : "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={form.hasUnit2}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked;
                  // Turning the toggle off clears the inner fields so a
                  // stale unit2 doesn't sneak through on save.
                  setForm((f) => ({
                    ...f,
                    hasUnit2: next,
                    unit2: next ? f.unit2 : "",
                    convFactor: next ? f.convFactor : "",
                  }));
                }}
                style={{ accentColor: "var(--ink)" }}
              />
              Activar segunda unidad de medida
            </label>

            {form.hasUnit2 ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "12px 12px 10px",
                  border: "1px dashed var(--ink)",
                  background: "var(--paper)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelSt}>Segunda unidad</label>
                  <select
                    value={form.unit2}
                    disabled={pending}
                    onChange={(e) =>
                      set("unit2", e.target.value as Unit | "")
                    }
                    style={{
                      ...inputSt(errors.unit2),
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— Seleccionar —</option>
                    {UNITS.filter((u) => u !== form.unit).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {errors.unit2 ? (
                    <div style={errSt}>{errors.unit2}</div>
                  ) : null}
                </div>
                <div>
                  <label style={labelSt}>
                    Factor de conversión (opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.convFactor}
                    disabled={pending}
                    onChange={(e) => set("convFactor", e.target.value)}
                    placeholder={`1 ${form.unit} = ? ${form.unit2 || "…"}`}
                    style={inputSt(errors.convFactor)}
                  />
                  {errors.convFactor ? (
                    <div style={errSt}>{errors.convFactor}</div>
                  ) : null}
                </div>
                {/* Preview row spans both columns. Shows the live conversion
                    when we have stock + unit2 + factor; otherwise nudges the
                    user that the factor is missing. */}
                <div style={{ gridColumn: "1 / -1" }}>
                  {form.stock !== "" &&
                  form.unit2 &&
                  form.convFactor !== "" &&
                  !isNaN(Number(form.stock)) &&
                  !isNaN(Number(form.convFactor)) &&
                  Number(form.convFactor) > 0 ? (
                    <div
                      className="cmd-num"
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                      }}
                    >
                      Vista previa:{" "}
                      <span style={{ color: "var(--ink)" }}>
                        {Number(form.stock)} {form.unit}
                      </span>{" "}
                      →{" "}
                      <span style={{ color: "var(--ink)" }}>
                        {fmtCOP(
                          Number(form.stock) * Number(form.convFactor),
                        )}{" "}
                        {form.unit2}
                      </span>
                    </div>
                  ) : form.unit2 && form.convFactor === "" ? (
                    <div
                      style={{
                        fontSize: 11,
                        fontStyle: "italic",
                        color: "var(--muted)",
                      }}
                    >
                      Sin factor: se mostrará la unidad secundaria sin
                      conversión automática
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
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
const GRID = "22px 1.4fr 1fr 60px 90px 130px 90px 90px 32px";

export function InventarioClient({
  initialCategorias,
  initialIngredientes,
}: {
  initialCategorias: IngredienteCategoria[];
  initialIngredientes: Ingrediente[];
}) {
  const [categorias, setCategorias] = React.useState(initialCategorias);
  const [ingredientes, setIngredientes] = React.useState(initialIngredientes);
  const [cat, setCatRaw] = React.useState("all");
  const [search, setSearch] = React.useState("");
  // Clicking a tree node always clears the search so the user can see the
  // results of the chosen category. Use setCat everywhere instead of setCatRaw.
  const setCat = React.useCallback((id: string) => {
    setCatRaw(id);
    setSearch("");
  }, []);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Ingrediente | null>(null);
  const [catFormOpen, setCatFormOpen] = React.useState(false);
  const [drawerError, setDrawerError] = React.useState<string | null>(null);
  const [catError, setCatError] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [rowMenuId, setRowMenuId] = React.useState<string | null>(null);
  const [ajustarId, setAjustarId] = React.useState<string | null>(null);
  const [ajustarVal, setAjustarVal] = React.useState("");
  const [conteoMode, setConteoMode] = React.useState(false);
  const [conteoVals, setConteoVals] = React.useState<Record<string, string>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  // Outside-click closes the row ··· popover. Scoped to `[data-row-menu]`
  // so it stays out of the tree menu's `[data-tree-menu]` listener — both
  // run only while their respective ids are non-null, and a click on the
  // popover container itself is preserved by the closest() guard.
  React.useEffect(() => {
    if (!rowMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-row-menu]")) return;
      setRowMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [rowMenuId]);

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

  // Map each category id → the set of all ids in its subtree (incl. itself),
  // so the table filter can match descendants of the selected node.
  const subtreeIds = React.useMemo(() => {
    const out = new Map<string, Set<string>>();
    const walk = (n: TreeNode): Set<string> => {
      const acc = new Set<string>([n.id]);
      for (const c of n.children) for (const id of walk(c)) acc.add(id);
      out.set(n.id, acc);
      return acc;
    };
    for (const r of tree) walk(r);
    return out;
  }, [tree]);

  const labelByCatId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) m.set(c.id, c.label);
    return m;
  }, [categorias]);

  // Filter ingredientes for the table. Search wins over the tree selection
  // (spec: "ignoring the tree selection while typing"); clearing search
  // falls back to the cat filter (matching the chosen node + its subtree).
  const filteredIngredientes = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return ingredientes.filter((i) => {
        const catName = i.category_id
          ? (labelByCatId.get(i.category_id) ?? "")
          : "";
        return (
          i.name.toLowerCase().includes(q) ||
          catName.toLowerCase().includes(q)
        );
      });
    }
    if (cat === "all") return ingredientes;
    const allowed = subtreeIds.get(cat);
    if (!allowed) return ingredientes;
    return ingredientes.filter(
      (i) => i.category_id !== null && allowed.has(i.category_id),
    );
  }, [ingredientes, search, cat, subtreeIds, labelByCatId]);

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
      setSearch("");
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

  const handleRenameCategoria = (id: string, label: string) => {
    setCatError(null);
    startTransition(async () => {
      const res = await updateIngredienteCategoria({ id, label });
      if (!res.ok) {
        setCatError(res.error ?? "No se pudo renombrar la categoría.");
        return;
      }
      setCategorias((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, label: res.categoria?.label ?? label }
            : c,
        ),
      );
    });
  };

  const handleDeleteCategoria = (id: string) => {
    setCatError(null);
    // Snapshot the descendants now — once the row is gone from `tree` we
    // can't recompute the set.
    const doomed = subtreeIds.get(id) ?? new Set<string>([id]);
    startTransition(async () => {
      const res = await deleteIngredienteCategoria({ id });
      if (!res.ok) {
        setCatError(res.error ?? "No se pudo eliminar la categoría.");
        return;
      }
      setCategorias((prev) => prev.filter((c) => !doomed.has(c.id)));
      // DB ON DELETE SET NULL nulls category_id on ingredientes that pointed
      // at any of the deleted categories — mirror that in local state so the
      // table doesn't keep showing stale category labels.
      setIngredientes((prev) =>
        prev.map((i) =>
          i.category_id && doomed.has(i.category_id)
            ? { ...i, category_id: null }
            : i,
        ),
      );
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const d of doomed) next.delete(d);
        return next;
      });
      // Spec: deleting a category resets the filter to "Todos".
      setCat("all");
    });
  };

  const handleSaveIngrediente = (input: {
    id?: string;
    name: string;
    categoryId: string | null;
    unit: Unit;
    unit2: Unit | null;
    conversionFactor: number | null;
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
          unit2: input.unit2,
          conversionFactor: input.conversionFactor,
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
          unit2: input.unit2,
          conversionFactor: input.conversionFactor,
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
            pending={isPending}
            onPick={setCat}
            onToggle={toggleExpanded}
            onRemove={handleDeleteCategoria}
            onRename={handleRenameCategoria}
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
              border: `1.5px solid ${search ? "var(--ink)" : "var(--rule)"}`,
              padding: "7px 12px",
              background: "var(--paper-lt)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)" }}>⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ingrediente por nombre o categoría…"
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "var(--ink)",
                outline: "none",
                padding: 0,
              }}
            />
            {search ? (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 0,
                  // globals.css clamps every <button> to 44px min-height;
                  // without this opt-out, the clear ✕ inflates the search
                  // bar the moment the user starts typing.
                  minHeight: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            ) : null}
          </div>
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

            {filteredIngredientes.length === 0 ? (
              <div
                className="text-muted"
                style={{
                  padding: "40px 18px",
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                {ingredientes.length === 0
                  ? "Aún no hay ingredientes. Usa “+ Nuevo ingrediente” para crear el primero."
                  : search.trim()
                    ? `Ningún ingrediente coincide con «${search.trim()}».`
                    : "Esta categoría no tiene ingredientes todavía."}
              </div>
            ) : null}

            {filteredIngredientes.map((ing, i) => {
              const categoryName = ing.category_id
                ? (labelByCatId.get(ing.category_id) ?? "—")
                : "—";
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
                    <div style={{ fontWeight: 600 }}>{ing.unit}</div>
                    {/* Only show the "+ unit2" hint here when there's NO
                        conversion factor — otherwise the secondary surfaces
                        in the stock cell as the converted value. */}
                    {ing.unit2 && !ing.conversion_factor ? (
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--muted)",
                          marginTop: 1,
                        }}
                      >
                        + {ing.unit2}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="cmd-num"
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <div>{Number(ing.stock_current)}</div>
                    {ing.unit2 && ing.conversion_factor ? (
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--muted)",
                          fontWeight: 400,
                          marginTop: 1,
                        }}
                      >
                        →{" "}
                        {fmtCOP(
                          Number(ing.stock_current) *
                            Number(ing.conversion_factor),
                        )}{" "}
                        {ing.unit2}
                      </div>
                    ) : null}
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

                  {/* col 9: row actions — single ··· popover + delete pill.
                      The cell wrapper is relative so both the popover (top:
                      100%) and the delete confirm pill (overlay) anchor to
                      it without pushing the column wider. */}
                  <div
                    data-row-menu
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      position: "relative",
                    }}
                  >
                    {isDeleting ? (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "50%",
                          transform: "translateY(-50%)",
                          zIndex: 20,
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                          background: "var(--paper-lt)",
                          border: "1px solid var(--red)",
                          padding: "3px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--red)",
                            marginRight: 4,
                          }}
                        >
                          ¿Eliminar?
                        </span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(ing.id)}
                          style={{
                            background: "var(--red)",
                            color: "var(--paper-lt)",
                            border: "none",
                            fontSize: 9,
                            padding: "2px 6px",
                            cursor: "pointer",
                            minHeight: 0,
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
                            fontSize: 9,
                            padding: "2px 6px",
                            cursor: "pointer",
                            color: "var(--ink)",
                            minHeight: 0,
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Acciones de ${ing.name}`}
                          aria-haspopup="menu"
                          aria-expanded={rowMenuId === ing.id}
                          disabled={isAdjusting}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRowError(null);
                            setRowMenuId(
                              rowMenuId === ing.id ? null : ing.id,
                            );
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--muted)",
                            fontSize: 14,
                            letterSpacing: "0.08em",
                            lineHeight: 1,
                            padding: "0 2px",
                            cursor: "pointer",
                            minHeight: 0,
                          }}
                        >
                          ···
                        </button>
                        {rowMenuId === ing.id ? (
                          <div
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              zIndex: 30,
                              background: "var(--paper-lt)",
                              border: "1.5px solid var(--ink)",
                              minWidth: 130,
                              boxShadow: "2px 4px 12px rgba(0,0,0,0.12)",
                            }}
                          >
                            {!conteoMode ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={isPending}
                                onClick={() => {
                                  setRowMenuId(null);
                                  setRowError(null);
                                  setAjustarId(ing.id);
                                  setAjustarVal(String(ing.stock_current));
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "8px 12px",
                                  fontSize: 11,
                                  textAlign: "left",
                                  background: "none",
                                  border: "none",
                                  color: "var(--ink)",
                                  cursor: "pointer",
                                  minHeight: 0,
                                }}
                              >
                                ± Ajustar stock
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuId(null);
                                setEditing(ing);
                                setDrawerError(null);
                                setDrawerOpen(true);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "8px 12px",
                                fontSize: 11,
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                color: "var(--ink)",
                                cursor: "pointer",
                                minHeight: 0,
                              }}
                            >
                              ✏ Editar
                            </button>
                            <div
                              style={{
                                height: 1,
                                background: "var(--rule)",
                              }}
                            />
                            <button
                              type="button"
                              role="menuitem"
                              disabled={isPending}
                              onClick={() => {
                                setRowMenuId(null);
                                setRowError(null);
                                setDeleteId(ing.id);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "8px 12px",
                                fontSize: 11,
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                color: "var(--red)",
                                cursor: "pointer",
                                minHeight: 0,
                              }}
                            >
                              ✕ Eliminar
                            </button>
                          </div>
                        ) : null}
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
