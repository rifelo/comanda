"use client";

import * as React from "react";
import {
  RECETAS_LIST,
  RECETAS_INGS,
  fmtCOP,
  type RecetaIngrediente,
  type RecetaSummary,
} from "@/lib/mock/productos";
import { Scribble, Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, Thumb, CmdMiniLabel } from "../_components/shared";

const GRID = "1.6fr 80px 70px 100px 100px 32px";

function RecetaDetail({
  receta,
  initialIngs,
}: {
  receta: RecetaSummary;
  initialIngs: RecetaIngrediente[];
}) {
  const [rows, setRows] = React.useState<RecetaIngrediente[]>(initialIngs);
  const totalCosto = rows.reduce((s, x) => s + x.total, 0);
  const margen = ((receta.price - totalCosto) / receta.price) * 100;
  const ok = margen >= 55;

  return (
    <div style={{ padding: "20px 28px 28px" }}>
      {/* product header */}
      <div
        className="cmd-noise cmd-paper-lt relative"
        style={{
          border: "1.5px solid var(--ink)",
          padding: 18,
          display: "grid",
          gridTemplateColumns: "80px 1fr 220px",
          gap: 18,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Thumb w={80} h={80} label={receta.product.split(" ")[0]} />
        <div>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {receta.cat} · {receta.sku}
          </div>
          <div
            className="font-slab"
            style={{ fontSize: 28, marginTop: 2, lineHeight: 1.05 }}
          >
            {receta.product}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-2)" }}>
            Receta versión {receta.version} · editada por{" "}
            <strong>{receta.editor}</strong> · {receta.date}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Precio de venta
          </div>
          <div
            className="cmd-num font-slab"
            style={{ fontSize: 32, lineHeight: 1, marginTop: 2 }}
          >
            ${fmtCOP(receta.price)}
          </div>
          <button
            type="button"
            className="cmd-link"
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 6,
              minHeight: 0,
              padding: 0,
              background: "none",
              border: "none",
            }}
          >
            editar precio
          </button>
        </div>
        <div style={{ position: "absolute", top: -8, right: 18 }}>
          <Stamp rotate={4}>vigente · v{receta.version}</Stamp>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 20,
        }}
      >
        {/* ingredients table */}
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
              padding: "8px 14px",
              borderBottom: "1.5px solid var(--ink)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            <span>Ingrediente</span>
            <span style={{ textAlign: "right" }}>Cantidad</span>
            <span>Unidad</span>
            <span style={{ textAlign: "right" }}>Costo / U</span>
            <span style={{ textAlign: "right" }}>Costo total</span>
            <span />
          </div>
          {rows.map((g, i) => (
            <div
              key={`${g.name}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 10,
                padding: "10px 14px",
                alignItems: "center",
                borderBottom: "1px dashed var(--rule-soft)",
                background: i % 2 ? "var(--paper-lt)" : "var(--paper)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</div>
                {g.note ? (
                  <div style={{ marginTop: 2 }}>
                    <Scribble size={12} rotate={-2}>
                      {g.note}
                    </Scribble>
                  </div>
                ) : null}
              </div>
              <input
                className="cmd-num bg-paper"
                defaultValue={g.qty}
                style={{
                  textAlign: "right",
                  border: "1px solid var(--rule)",
                  padding: "4px 6px",
                  fontSize: 12,
                  width: "100%",
                  color: "var(--ink)",
                  minHeight: 0,
                }}
              />
              <div className="text-muted" style={{ fontSize: 11 }}>
                {g.unit}
              </div>
              <div
                className="cmd-num text-muted"
                style={{ textAlign: "right", fontSize: 12 }}
              >
                ${fmtCOP(g.cost)}
              </div>
              <div
                className="cmd-num"
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ${fmtCOP(g.total)}
              </div>
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => rs.filter((_, j) => j !== i))
                }
                className="text-muted"
                style={{
                  textAlign: "right",
                  fontSize: 14,
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  minHeight: 0,
                  padding: 0,
                }}
                aria-label={`Quitar ${g.name}`}
              >
                ✕
              </button>
            </div>
          ))}
          <div
            className="bg-paper"
            style={{
              padding: "14px",
              borderTop: "1px dashed var(--rule)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 14, color: "var(--muted)" }}>+</span>
              <input
                placeholder="Agregar ingrediente · buscar por nombre o SKU"
                className="cmd-paper-lt"
                style={{
                  border: "1px solid var(--rule)",
                  padding: "7px 10px",
                  fontSize: 12,
                  width: "100%",
                  color: "var(--ink)",
                  outline: "none",
                  minHeight: 0,
                }}
              />
              <button type="button" className="cmd-btn ghost sm">
                Agregar
              </button>
            </div>
          </div>
        </div>

        {/* summary cards */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          <SummaryCard
            label="Costo total de la receta"
            caption="basado en costos actuales de inventario"
          >
            ${fmtCOP(totalCosto)}
          </SummaryCard>
          <SummaryCard
            label="Precio de venta"
            caption="lista base · sin descuentos"
          >
            ${fmtCOP(receta.price)}
          </SummaryCard>
          <div
            className="cmd-paper-lt relative"
            style={{
              border: `1.5px solid ${ok ? "var(--green)" : "var(--red)"}`,
              padding: 14,
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
              Margen de ganancia
            </div>
            <div
              className="cmd-num font-slab"
              style={{
                fontSize: 38,
                lineHeight: 1,
                marginTop: 4,
                color: ok ? "var(--green)" : "var(--red)",
              }}
            >
              {margen.toFixed(1)}%
            </div>
            <div
              className="text-muted"
              style={{ fontSize: 10, marginTop: 4 }}
            >
              {ok
                ? "✓ sobre umbral mínimo (55%)"
                : "⚠ bajo umbral mínimo (55%)"}
            </div>
            <div style={{ position: "absolute", top: -10, right: 12 }}>
              <Stamp rotate={-4} color={ok ? "var(--green)" : "var(--red)"}>
                {ok ? "rentable" : "revisar"}
              </Stamp>
            </div>
          </div>
          <div
            className="bg-paper"
            style={{ border: "1px dashed var(--rule)", padding: 12 }}
          >
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                marginBottom: 6,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Aplicar a
            </div>
            <label
              style={{
                display: "flex",
                gap: 6,
                fontSize: 11,
                marginBottom: 4,
                minHeight: 0,
              }}
            >
              <input type="checkbox" defaultChecked /> Norte · Chapinero · Centro
            </label>
            <label
              style={{
                display: "flex",
                gap: 6,
                fontSize: 11,
                minHeight: 0,
              }}
            >
              <input type="checkbox" /> Replicar cambios en variantes
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cmd-paper-lt"
      style={{ border: "1.5px solid var(--ink)", padding: 14 }}
    >
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="cmd-num font-slab"
        style={{ fontSize: 30, lineHeight: 1, marginTop: 4 }}
      >
        {children}
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
        {caption}
      </div>
    </div>
  );
}

const CATS = [
  "Hamburguesas · Clásicas",
  "Hamburguesas · Especiales",
  "Hamburguesas · Vegetarianas",
  "Acompañamientos",
  "Bebidas · Gaseosas",
  "Bebidas · Cervezas",
  "Bebidas · Jugos naturales",
  "Postres",
  "Salsas (extras)",
  "Combos",
];

const UNITS = ["und", "kg", "g", "L", "ml", "porción", "loncha", "bola"];

type DraftRow = { name: string; qty: string; unit: string; cost: string };

const EMPTY_FORM = {
  product: "",
  sku: "",
  cat: CATS[0],
  price: "",
};
const EMPTY_ING: DraftRow = { name: "", qty: "", unit: "und", cost: "" };

type SavePayload = {
  meta: RecetaSummary;
  ings: RecetaIngrediente[];
};

function NuevaRecetaDrawer({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (p: SavePayload) => void;
}) {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [rows, setRows] = React.useState<DraftRow[]>([{ ...EMPTY_ING }]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const setF = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setRow = (i: number, k: keyof DraftRow, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_ING }]);
  const delRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const totalCosto = rows.reduce((s, r) => {
    const qty = Number(r.qty) || 0;
    const cost = Number(r.cost) || 0;
    return s + qty * cost;
  }, 0);
  const price = Number(form.price) || 0;
  const margen =
    price > 0 ? Math.round(((price - totalCosto) / price) * 100) : null;

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!form.product.trim()) e.product = "Requerido";
    if (!form.sku.trim()) e.sku = "Requerido";
    if (!form.price || price <= 0) e.price = "Precio inválido";
    if (rows.every((r) => !r.name.trim()))
      e.rows = "Agrega al menos un ingrediente";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const id = "r" + Date.now();
    const ings: RecetaIngrediente[] = rows
      .filter((r) => r.name.trim())
      .map((r) => {
        const qty = Number(r.qty) || 0;
        const cost = Number(r.cost) || 0;
        return {
          name: r.name.trim(),
          qty,
          unit: r.unit,
          cost,
          total: Math.round(qty * cost),
        };
      });
    onSave({
      meta: {
        id,
        product: form.product.trim(),
        sku: form.sku.trim().toUpperCase(),
        cat: form.cat,
        price,
        version: 1,
        editor: "Tú",
        date: "hoy",
      },
      ings,
    });
  };

  const inputSt = (err?: string): React.CSSProperties => ({
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "7px 9px",
    border: `1.5px solid ${err ? "var(--red)" : "var(--ink)"}`,
    outline: "none",
    minHeight: 0,
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
  const gap: React.CSSProperties = { marginBottom: 14 };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(30,25,18,.32)",
        }}
      />
      <div
        className="cmd-paper-lt"
        style={{
          position: "relative",
          zIndex: 1,
          width: 480,
          maxWidth: "100%",
          height: "100%",
          borderLeft: "1.5px solid var(--ink)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
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
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Recetas · 03
            </div>
            <div
              className="font-slab"
              style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}
            >
              Nueva receta
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted"
            style={{
              background: "none",
              border: "1px solid var(--rule)",
              fontSize: 12,
              padding: "4px 9px",
              cursor: "pointer",
              minHeight: 0,
            }}
          >
            ✕ cerrar
          </button>
        </div>

        {/* body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px 0",
          }}
        >
          <div style={gap}>
            <label style={labelSt}>Nombre del producto *</label>
            <input
              value={form.product}
              onChange={(e) => setF("product", e.target.value)}
              placeholder="Ej. Burger Especial de la Casa"
              style={inputSt(errors.product)}
            />
            {errors.product ? (
              <div style={errSt}>{errors.product}</div>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr",
              gap: 10,
              ...gap,
            }}
          >
            <div>
              <label style={labelSt}>SKU *</label>
              <input
                value={form.sku}
                onChange={(e) => setF("sku", e.target.value)}
                placeholder="HB-099"
                style={inputSt(errors.sku)}
              />
              {errors.sku ? <div style={errSt}>{errors.sku}</div> : null}
            </div>
            <div>
              <label style={labelSt}>Categoría</label>
              <select
                value={form.cat}
                onChange={(e) => setF("cat", e.target.value)}
                style={{
                  ...inputSt(),
                  appearance: "none",
                  cursor: "pointer",
                }}
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={gap}>
            <label style={labelSt}>Precio de venta (COP) *</label>
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => setF("price", e.target.value)}
              placeholder="24900"
              style={inputSt(errors.price)}
            />
            {errors.price ? <div style={errSt}>{errors.price}</div> : null}
          </div>

          <div
            style={{
              height: 1,
              background: "var(--rule)",
              margin: "4px -22px 16px",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Ingredientes de la receta
            </div>
            <button
              type="button"
              onClick={addRow}
              className="cmd-btn ghost sm"
              style={{ fontSize: 10 }}
            >
              + agregar fila
            </button>
          </div>
          {errors.rows ? (
            <div style={{ ...errSt, marginBottom: 8 }}>{errors.rows}</div>
          ) : null}

          <div
            className="text-muted"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 70px 80px 22px",
              gap: 6,
              fontSize: 8,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "0 0 4px",
            }}
          >
            <span>Ingrediente</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span style={{ textAlign: "right" }}>Costo / U</span>
            <span />
          </div>

          {rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 70px 80px 22px",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <input
                value={r.name}
                onChange={(e) => setRow(i, "name", e.target.value)}
                placeholder="Nombre…"
                style={{ ...inputSt(), fontSize: 11, padding: "5px 7px" }}
              />
              <input
                type="number"
                min="0"
                value={r.qty}
                onChange={(e) => setRow(i, "qty", e.target.value)}
                placeholder="0"
                style={{
                  ...inputSt(),
                  fontSize: 11,
                  padding: "5px 7px",
                  textAlign: "right",
                }}
              />
              <select
                value={r.unit}
                onChange={(e) => setRow(i, "unit", e.target.value)}
                style={{
                  ...inputSt(),
                  fontSize: 11,
                  padding: "5px 4px",
                  appearance: "none",
                  cursor: "pointer",
                }}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={r.cost}
                onChange={(e) => setRow(i, "cost", e.target.value)}
                placeholder="0"
                style={{
                  ...inputSt(),
                  fontSize: 11,
                  padding: "5px 7px",
                  textAlign: "right",
                }}
              />
              <button
                type="button"
                onClick={() => delRow(i)}
                disabled={rows.length <= 1}
                className="text-muted"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 14,
                  cursor: rows.length > 1 ? "pointer" : "default",
                  opacity: rows.length > 1 ? 1 : 0.3,
                  padding: 0,
                  minHeight: 0,
                }}
                aria-label="Quitar fila"
              >
                ✕
              </button>
            </div>
          ))}

          {price > 0 ? (
            <div
              className="bg-paper"
              style={{
                margin: "12px 0 16px",
                padding: "10px 12px",
                border: "1px dashed var(--rule)",
                display: "flex",
                gap: 24,
              }}
            >
              <PreviewStat label="Costo receta" value={fmtCOP(totalCosto)} />
              <PreviewStat
                label="Margen"
                value={margen !== null ? `${margen}%` : "—"}
                color={
                  margen === null
                    ? "var(--muted)"
                    : margen >= 55
                      ? "var(--green)"
                      : "var(--amber)"
                }
              />
              <PreviewStat
                label="Utilidad"
                value={fmtCOP(price - totalCosto)}
              />
            </div>
          ) : null}
        </div>

        {/* footer */}
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
            className="cmd-btn ghost"
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="cmd-btn"
            style={{ flex: 2 }}
          >
            Crear receta
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="cmd-num"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: color || "var(--ink)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function RecetasClient() {
  const [recetasList, setRecetasList] =
    React.useState<RecetaSummary[]>(RECETAS_LIST);
  const [recetasIngs, setRecetasIngs] =
    React.useState<Record<string, RecetaIngrediente[]>>(RECETAS_INGS);
  const [selected, setSelected] = React.useState<string>("r2");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const receta = recetasList.find((r) => r.id === selected);
  const ings = receta ? recetasIngs[selected] ?? [] : [];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", position: "relative" }}
    >
      {drawerOpen ? (
        <NuevaRecetaDrawer
          onClose={() => setDrawerOpen(false)}
          onSave={({ meta, ings: newIngs }) => {
            setRecetasList((list) => [meta, ...list]);
            setRecetasIngs((map) => ({ ...map, [meta.id]: newIngs }));
            setSelected(meta.id);
            setDrawerOpen(false);
          }}
        />
      ) : null}
      <SectionCrumb
        section="recetas"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Duplicar
            </button>
            <button type="button" className="cmd-btn ghost sm">
              Historial
            </button>
            <button
              type="button"
              className="cmd-btn sm"
              onClick={() => setDrawerOpen(true)}
            >
              + Nueva receta
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
        {/* list panel */}
        <div
          className="cmd-paper-lt"
          style={{
            borderRight: "1.5px solid var(--ink)",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "10px 12px 6px" }}>
            <CmdMiniLabel>Recetas ({recetasList.length})</CmdMiniLabel>
          </div>
          {recetasList.map((r) => {
            const ri = recetasIngs[r.id] ?? [];
            const tc = ri.reduce((s, x) => s + x.total, 0);
            const mg =
              r.price > 0 ? Math.round(((r.price - tc) / r.price) * 100) : 0;
            const isActive = r.id === selected;
            const margenColor =
              mg >= 55 ? "var(--green)" : "var(--amber)";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  borderBottom: "1px dashed var(--rule-soft)",
                  background: isActive ? "var(--ink)" : "transparent",
                  color: isActive ? "var(--paper-lt)" : "var(--ink)",
                  cursor: "pointer",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      lineHeight: 1.3,
                      flex: 1,
                      paddingRight: 8,
                    }}
                  >
                    {isActive ? "▸ " : ""}
                    {r.product}
                  </div>
                  <span
                    className="cmd-num"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      color: isActive ? "var(--paper-lt)" : margenColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {mg}%
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: isActive ? "var(--paper-lt)" : "var(--muted)",
                    marginTop: 3,
                    opacity: isActive ? 0.75 : 1,
                  }}
                >
                  {r.sku} · v{r.version} · {r.date}
                </div>
              </button>
            );
          })}
        </div>

        {/* detail panel */}
        <div style={{ overflowY: "auto" }}>
          {receta ? (
            <RecetaDetail
              key={selected}
              receta={receta}
              initialIngs={ings}
            />
          ) : (
            <div
              className="text-muted"
              style={{ padding: 40, fontSize: 13 }}
            >
              Selecciona una receta de la lista
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
