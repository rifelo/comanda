"use client";

/**
 * 01 · Catálogo — two-pane: categorías tree (left) + product table (right).
 *
 * Client component because the filter chips, search box, and category tree
 * selection all drive a single in-memory filter pipeline over `PRODUCTOS`.
 */
import * as React from "react";
import {
  CATEGORIAS,
  PRODUCTOS,
  type CategoriaRow,
  type StockStatus,
  fmtCOP,
} from "@/lib/mock/productos";
import {
  SectionCrumb,
  StockBadge,
  Thumb,
  CmdMiniLabel,
} from "../_components/shared";
import { Chip, StarFav } from "../_components/chip";

function CategoriaTree({
  active,
  onPick,
}: {
  active: string;
  onPick: (id: string) => void;
}) {
  const Row = ({ row }: { row: CategoriaRow }) => {
    const isActive = active === row.id;
    return (
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
          paddingLeft: 8 + (row.indent || 0) * 14,
          background: isActive ? "var(--ink)" : "transparent",
          color: isActive ? "var(--paper-lt)" : "var(--ink)",
          border: "none",
          fontSize: 11,
          borderRadius: 2,
          minHeight: 0,
          cursor: "pointer",
        }}
      >
        {row.children ? (
          <span style={{ fontSize: 9, opacity: 0.6 }}>
            {row.expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span style={{ width: 8 }} />
        )}
        <span style={{ flex: 1, fontWeight: row.root ? 600 : 400 }}>
          {row.label}
        </span>
        <span
          className="cmd-num"
          style={{ fontSize: 10, opacity: 0.7 }}
        >
          {row.count}
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col" style={{ gap: 1 }}>
      {CATEGORIAS.map((r) => (
        <React.Fragment key={r.id}>
          <Row row={r} />
          {r.expanded &&
            r.children?.map((c) => <Row key={c.id} row={c} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

export function CatalogoClient() {
  const [cat, setCat] = React.useState<string>("all");
  const [fav, setFav] = React.useState(false);
  const [stock, setStock] = React.useState<"all" | StockStatus>("all");
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const catLabel =
      cat === "all"
        ? null
        : CATEGORIAS.flatMap((c) => [c, ...(c.children ?? [])]).find(
            (c) => c.id === cat,
          )?.label.toLowerCase();
    const needle = q.trim().toLowerCase();
    return PRODUCTOS.filter((p) => {
      if (catLabel && !p.cat.toLowerCase().includes(catLabel.split(" ")[0]))
        return false;
      if (fav && !p.fav) return false;
      if (stock !== "all" && p.stock !== stock) return false;
      if (needle) {
        const hay = `${p.name} ${p.sku} ${p.cat}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [cat, fav, stock, q]);

  return (
    <div>
      <SectionCrumb
        section="catalogo"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Exportar CSV
            </button>
            <button type="button" className="cmd-btn sm">
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
          <CategoriaTree active={cat} onPick={setCat} />
          <button
            type="button"
            className="cmd-link"
            style={{
              padding: "10px 8px 0",
              fontSize: 11,
              color: "var(--muted)",
              minHeight: 0,
              background: "none",
              border: "none",
            }}
          >
            + nueva categoría
          </button>
        </div>

        {/* main */}
        <div style={{ padding: "14px 22px 24px" }}>
          {/* search + filter bar */}
          <div
            className="flex items-center flex-wrap"
            style={{ gap: 10 }}
          >
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
            <span
              style={{ width: 1, height: 22, background: "var(--rule)" }}
            />
            <Chip active={fav} onClick={() => setFav(!fav)}>
              ★ Favoritos
            </Chip>
            <Chip active={stock === "all"} onClick={() => setStock("all")}>
              Todos
            </Chip>
            <Chip active={stock === "ok"} onClick={() => setStock("ok")}>
              Disponibles
            </Chip>
            <Chip
              active={stock === "bajo"}
              onClick={() => setStock("bajo")}
            >
              Stock bajo
            </Chip>
            <Chip
              active={stock === "sin"}
              danger
              onClick={() => setStock("sin")}
            >
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
              {filtered.length} de {PRODUCTOS.length} productos
            </div>
          </div>

          {/* table */}
          <div
            className="cmd-paper-lt"
            style={{
              marginTop: 14,
              border: "1.5px solid var(--ink)",
            }}
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
                  background:
                    i % 2 ? "var(--paper-lt)" : "var(--paper)",
                }}
              >
                <StarFav initialOn={p.fav} />
                <Thumb label={p.name.split(" ")[0]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {p.name}
                  </div>
                  <div
                    className="cmd-num text-muted"
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    {p.sku} · cód. {1000000 + i}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {p.cat}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ${fmtCOP(p.price)}
                </div>
                <div
                  className="cmd-num text-muted"
                  style={{ textAlign: "right", fontSize: 12 }}
                >
                  ${fmtCOP(p.cost)}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      p.margin >= 60
                        ? "var(--green)"
                        : p.margin >= 50
                          ? "var(--ink)"
                          : "var(--amber)",
                  }}
                >
                  {p.margin}%
                </div>
                <StockBadge status={p.stock} />
                <div
                  className="text-muted"
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ···
                </div>
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
    </div>
  );
}
