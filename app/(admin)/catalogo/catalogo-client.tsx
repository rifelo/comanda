"use client";

/**
 * 01 · Catálogo — two-pane: categorías tree (left) + product table (right).
 *
 * Server fetches `productos` + `categorias` once; this component owns the
 * in-memory filter pipeline (search box, fav toggle, stock chips, category
 * pick) so chip taps don't round-trip to Supabase.
 */
import * as React from "react";
import type {
  CatalogoCategoryNode,
  CatalogoRow,
  ProductoStockStatus,
} from "@/lib/types";
import { fmtCOP } from "@/lib/mock/productos";
import {
  SectionCrumb,
  StockBadge,
  Thumb,
  CmdMiniLabel,
} from "../_components/shared";
import { Chip } from "../_components/chip";
import { NuevoProductoDrawer } from "./nuevo-producto-drawer";
import { NuevaCategoriaForm } from "./nueva-categoria-form";
import { FavoriteToggle } from "./favorite-toggle";
import { deleteProductoCategoria } from "./actions";

function flattenCategorias(
  nodes: CatalogoCategoryNode[],
): CatalogoCategoryNode[] {
  const out: CatalogoCategoryNode[] = [];
  const walk = (n: CatalogoCategoryNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function descendantIds(
  node: CatalogoCategoryNode,
  acc: Set<string> = new Set(),
): Set<string> {
  if (node.id) acc.add(node.id);
  node.children?.forEach((c) => descendantIds(c, acc));
  return acc;
}

function CategoriaTree({
  nodes,
  activeId,
  onPick,
  onDelete,
}: {
  nodes: CatalogoCategoryNode[];
  activeId: string | null; // null = "Todas"
  onPick: (id: string | null) => void;
  onDelete: (deletedId: string) => void;
}) {
  // Tree-level state — one row at a time can be hovered or in confirm
  // mode. The single-string design is intentional: opening a second
  // confirm collapses the first (matches "one at a time" in the spec).
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const confirmRef = React.useRef<HTMLDivElement | null>(null);

  // Focus the confirm container as soon as it opens so Escape works
  // without the user having to click into it first.
  React.useEffect(() => {
    if (confirmId && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [confirmId]);

  const Row = ({ row }: { row: CatalogoCategoryNode }) => {
    const isActive = activeId === row.id;
    const isRoot = row.indent === 0;
    const isConfirming = row.id !== null && confirmId === row.id;
    const indentPad = 8 + Math.max(row.indent - 1, 0) * 14;

    // ── Confirm variant ────────────────────────────────────────────────
    if (isConfirming) {
      return (
        <div
          ref={confirmRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setConfirmId(null);
              setError(null);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            paddingLeft: indentPad,
            background: "var(--paper)",
            border: "1px solid var(--red)",
            borderRadius: 2,
            fontSize: 10,
            outline: "none",
          }}
        >
          <span
            style={{
              flex: 1,
              color: "var(--red)",
              letterSpacing: ".08em",
            }}
          >
            {error
              ? error
              : <>¿Eliminar «{row.label}»?</>}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              if (!row.id) return;
              const targetId = row.id;
              startTransition(async () => {
                const r = await deleteProductoCategoria(targetId);
                if (!r.ok) {
                  setError(r.error ?? "No se pudo eliminar.");
                  return;
                }
                onDelete(targetId);
                setConfirmId(null);
                setError(null);
              });
            }}
            style={{
              background: "var(--red)",
              color: "var(--paper-lt)",
              border: "none",
              fontSize: 9,
              padding: "3px 8px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
              borderRadius: 2,
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
              setError(null);
            }}
            style={{
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              fontSize: 9,
              padding: "3px 8px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 2,
              minHeight: 0,
            }}
          >
            No
          </button>
        </div>
      );
    }

    // ── Normal variant ─────────────────────────────────────────────────
    // The ✕ shows on hover OR while this row is the active filter; never
    // for the synthetic "Todas" row (id === null).
    const showDelete =
      row.id !== null && (hoveredId === row.id || isActive);

    return (
      <div
        style={{ position: "relative" }}
        onMouseEnter={() => {
          if (row.id) setHoveredId(row.id);
        }}
        onMouseLeave={() => {
          // Only clear if this row is still the hovered one; avoids the
          // race where a fast pointer enters row B before A's leave fires.
          setHoveredId((prev) => (prev === row.id ? null : prev));
        }}
      >
        <button
          type="button"
          onClick={() => onPick(row.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            textAlign: "left",
            padding: "5px 8px",
            paddingLeft: indentPad,
            background: isActive ? "var(--ink)" : "transparent",
            color: isActive ? "var(--paper-lt)" : "var(--ink)",
            border: "none",
            fontSize: 11,
            borderRadius: 2,
            minHeight: 0,
            cursor: "pointer",
          }}
        >
          {row.children?.length ? (
            <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
          ) : (
            <span style={{ width: 8 }} />
          )}
          <span style={{ flex: 1, fontWeight: isRoot ? 600 : 400 }}>
            {row.label}
          </span>
          <span className="cmd-num" style={{ fontSize: 10, opacity: 0.7 }}>
            {row.count}
          </span>
        </button>
        {showDelete ? (
          <button
            type="button"
            title="Eliminar categoría"
            aria-label={`Eliminar categoría ${row.label}`}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmId(row.id);
              setError(null);
            }}
            style={{
              position: "absolute",
              right: 4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 16,
              height: 16,
              // globals.css enforces a 44px min-height on every <button>
              // for kitchen-staff touch targets; opt out so the inline
              // 16px height actually applies.
              minHeight: 0,
              fontSize: 8,
              lineHeight: "14px",
              textAlign: "center",
              color: "var(--red)",
              background: "var(--paper)",
              border: "1px solid var(--red)",
              borderRadius: 2,
              padding: 0,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
    );
  };
  return (
    <div className="flex flex-col" style={{ gap: 1 }}>
      {nodes.map((r) => (
        <React.Fragment key={r.id ?? "all"}>
          <Row row={r} />
          {r.children?.map((c) => (
            <React.Fragment key={c.id ?? "all"}>
              <Row row={c} />
              {c.children?.map((g) => <Row key={g.id ?? "all"} row={g} />)}
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

export function CatalogoClient({
  productos,
  categorias,
}: {
  productos: CatalogoRow[];
  categorias: CatalogoCategoryNode[];
}) {
  const [cat, setCat] = React.useState<string | null>(null);
  const [fav, setFav] = React.useState(false);
  const [stock, setStock] = React.useState<"all" | ProductoStockStatus>("all");
  const [q, setQ] = React.useState("");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editProduct, setEditProduct] = React.useState<CatalogoRow | null>(null);
  const [catFormOpen, setCatFormOpen] = React.useState(false);

  // Build a category-id -> descendant-ids map so picking a parent also
  // matches its children's productos.
  const descendantsByCat = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of flattenCategorias(categorias)) {
      if (node.id) map.set(node.id, descendantIds(node));
    }
    return map;
  }, [categorias]);

  const filtered = React.useMemo(() => {
    const allowedCatIds = cat ? descendantsByCat.get(cat) : null;
    const needle = q.trim().toLowerCase();
    return productos.filter((p) => {
      if (allowedCatIds && (!p.category_id || !allowedCatIds.has(p.category_id)))
        return false;
      if (fav && !p.is_favorite) return false;
      if (stock !== "all" && p.stock_status !== stock) return false;
      if (needle) {
        const hay = `${p.name} ${p.sku} ${p.category_label ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [productos, descendantsByCat, cat, fav, stock, q]);

  return (
    <div>
      <SectionCrumb
        section="catalogo"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Exportar CSV
            </button>
            <button
              type="button"
              className="cmd-btn sm"
              onClick={() => {
                setEditProduct(null);
                setDrawerOpen(true);
              }}
            >
              + Nuevo producto
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
        {/* tree */}
        <div
          className="cmd-paper-lt"
          style={{
            borderRight: "1px dashed var(--rule)",
            padding: "14px 12px",
          }}
        >
          <CmdMiniLabel>Categorías</CmdMiniLabel>
          <CategoriaTree
            nodes={categorias}
            activeId={cat}
            onPick={setCat}
            onDelete={(id) => {
              if (cat === id) setCat(null);
            }}
          />
          {catFormOpen ? (
            <NuevaCategoriaForm
              categorias={categorias}
              activeId={cat}
              onClose={() => setCatFormOpen(false)}
              onCreated={(id) => setCat(id)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCatFormOpen(true)}
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
        </div>

        {/* main */}
        <div style={{ padding: "14px 22px 24px" }}>
          {/* search + filter bar */}
          <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
            <div
              className="cmd-paper-lt"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                border: "1px solid var(--ink)",
                flex: "0 1 320px",
                minWidth: 220,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--muted)" }}>⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, SKU, código de barras…"
                aria-label="Buscar productos"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 12,
                  outline: "none",
                  flex: 1,
                  color: "var(--ink)",
                  padding: 0,
                  minHeight: 0,
                  minWidth: 0,
                }}
              />
            </div>
            <span style={{ width: 1, height: 22, background: "var(--rule)" }} />
            <Chip active={fav} onClick={() => setFav(!fav)}>
              ★ Favoritos
            </Chip>
            <Chip active={stock === "all"} onClick={() => setStock("all")}>
              Todos
            </Chip>
            <Chip active={stock === "ok"} onClick={() => setStock("ok")}>
              Disponibles
            </Chip>
            <Chip active={stock === "bajo"} onClick={() => setStock("bajo")}>
              Stock bajo
            </Chip>
            <Chip active={stock === "sin"} danger onClick={() => setStock("sin")}>
              Sin stock
            </Chip>
            <div
              className="text-muted ml-auto"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {filtered.length} de {productos.length} productos
            </div>
          </div>

          {/* table */}
          <div
            className="cmd-paper-lt"
            style={{ marginTop: 14, border: "1.5px solid var(--ink)" }}
          >
            <div
              className="bg-paper"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "22px 44px 1fr 160px 90px 90px 84px 100px 28px",
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
              <span />
              <span>Producto · SKU</span>
              <span>Categoría</span>
              <span style={{ textAlign: "right" }}>Precio</span>
              <span style={{ textAlign: "right" }}>Costo</span>
              <span style={{ textAlign: "right" }}>Margen</span>
              <span>Estado</span>
              <span />
            </div>
            {filtered.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "22px 44px 1fr 160px 90px 90px 84px 100px 28px",
                  gap: 10,
                  padding: "10px 12px",
                  alignItems: "center",
                  borderBottom: "1px dashed var(--rule-soft)",
                  background: i % 2 ? "var(--paper-lt)" : "var(--paper)",
                }}
              >
                <FavoriteToggle productoId={p.id} initial={p.is_favorite} />
                <Thumb label={p.name.split(" ")[0]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div
                    className="cmd-num text-muted"
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    {p.sku} · cód. {1000000 + i}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {p.category_label ?? "—"}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ${fmtCOP(p.price_cop)}
                </div>
                <div
                  className="cmd-num text-muted"
                  style={{ textAlign: "right", fontSize: 12 }}
                >
                  ${fmtCOP(p.cost_cop)}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      p.margin_pct >= 60
                        ? "var(--green)"
                        : p.margin_pct >= 50
                          ? "var(--ink)"
                          : "var(--amber)",
                  }}
                >
                  {p.margin_pct}%
                </div>
                <StockBadge status={p.stock_status} />
                <button
                  type="button"
                  className="text-muted"
                  aria-label={`Editar ${p.name}`}
                  onClick={() => {
                    setEditProduct(p);
                    setDrawerOpen(true);
                  }}
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    width: "100%",
                    minHeight: 0,
                  }}
                >
                  ···
                </button>
              </div>
            ))}
            {filtered.length === 0 ? (
              <div
                className="text-muted"
                style={{
                  padding: "30px 18px",
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                No hay productos que coincidan con los filtros.
              </div>
            ) : null}
          </div>

          <div
            className="text-muted"
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span>Última sincronización · hoy 12:34</span>
            <div className="flex" style={{ gap: 6 }}>
              <button type="button" className="cmd-btn ghost sm">
                ‹ ant.
              </button>
              <button type="button" className="cmd-btn ghost sm">
                sig. ›
              </button>
            </div>
          </div>
        </div>
      </div>

      <NuevoProductoDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditProduct(null);
        }}
        categorias={categorias}
        defaultCategoryId={cat}
        editData={editProduct}
      />
    </div>
  );
}
