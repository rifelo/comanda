"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { fmtCOP } from "@/lib/mock/productos";
import type {
  RecetasView,
  RecetaRow,
  RecetaItemRow,
  IngredienteOption,
} from "@/lib/db/recetas";
import { Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, Thumb, CmdMiniLabel } from "../_components/shared";
import {
  addRecetaItem,
  updateRecetaItemQty,
  removeRecetaItem,
  createReceta,
} from "./actions";

const MARGEN_MIN = 55;
const GRID = "1.6fr 80px 70px 100px 100px 32px";

// ── one editable ingredient line ──────────────────────────────────────────
function ItemRow({
  item,
  even,
  onError,
}: {
  item: RecetaItemRow;
  even: boolean;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [qty, setQty] = React.useState(String(item.qty));

  // Resync the input when the server value changes (after revalidate) — the
  // React-recommended "adjust state during render" pattern, no effect.
  const [prevServerQty, setPrevServerQty] = React.useState(item.qty);
  if (item.qty !== prevServerQty) {
    setPrevServerQty(item.qty);
    setQty(String(item.qty));
  }

  const commit = () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setQty(String(item.qty));
      return;
    }
    if (n === item.qty) return;
    onError(null);
    start(async () => {
      const r = await updateRecetaItemQty({ item_id: item.id, qty: n });
      if (r?.error) {
        onError(r.error);
        setQty(String(item.qty));
      } else router.refresh();
    });
  };

  const remove = () => {
    onError(null);
    start(async () => {
      const r = await removeRecetaItem({ item_id: item.id });
      if (r?.error) onError(r.error);
      else router.refresh();
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 10,
        padding: "10px 14px",
        alignItems: "center",
        borderBottom: "1px dashed var(--rule-soft)",
        background: even ? "var(--paper-lt)" : "var(--paper)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
      <input
        className="cmd-num bg-paper"
        value={qty}
        type="number"
        min="0"
        step="any"
        disabled={pending}
        onChange={(e) => setQty(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
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
        {item.unit}
      </div>
      <div className="cmd-num text-muted" style={{ textAlign: "right", fontSize: 12 }}>
        ${fmtCOP(item.cost_cop)}
      </div>
      <div className="cmd-num" style={{ textAlign: "right", fontSize: 12, fontWeight: 600 }}>
        ${fmtCOP(item.total)}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-muted"
        style={{
          textAlign: "right",
          fontSize: 14,
          cursor: pending ? "default" : "pointer",
          background: "none",
          border: "none",
          minHeight: 0,
          padding: 0,
        }}
        aria-label={`Quitar ${item.name}`}
      >
        ✕
      </button>
    </div>
  );
}

// ── add-ingredient row ─────────────────────────────────────────────────────
function AddIngredient({
  productoId,
  options,
  onError,
}: {
  productoId: string;
  options: IngredienteOption[];
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [ingId, setIngId] = React.useState("");
  const [qty, setQty] = React.useState("");

  const add = () => {
    const n = Number(qty);
    if (!ingId) return onError("Elige un ingrediente.");
    if (!Number.isFinite(n) || n <= 0) return onError("Cantidad inválida.");
    onError(null);
    start(async () => {
      const r = await addRecetaItem({
        producto_id: productoId,
        ingrediente_id: ingId,
        qty: n,
      });
      if (r?.error) onError(r.error);
      else {
        setIngId("");
        setQty("");
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-paper" style={{ padding: 14, borderTop: "1px dashed var(--rule)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>+</span>
        <select
          aria-label="Ingrediente"
          value={ingId}
          disabled={pending || options.length === 0}
          onChange={(e) => setIngId(e.target.value)}
          className="cmd-paper-lt"
          style={{
            border: "1px solid var(--rule)",
            padding: "7px 10px",
            fontSize: 12,
            flex: 1,
            color: "var(--ink)",
            minHeight: 0,
            cursor: "pointer",
          }}
        >
          <option value="">
            {options.length ? "Agregar ingrediente…" : "Sin ingredientes disponibles"}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · ${fmtCOP(o.cost_cop)}/{o.unit}
            </option>
          ))}
        </select>
        <input
          aria-label="Cantidad"
          type="number"
          min="0"
          step="any"
          placeholder="cant."
          value={qty}
          disabled={pending}
          onChange={(e) => setQty(e.target.value)}
          style={{
            border: "1px solid var(--rule)",
            padding: "7px 10px",
            fontSize: 12,
            width: 80,
            textAlign: "right",
            color: "var(--ink)",
            minHeight: 0,
          }}
        />
        <button type="button" className="cmd-btn ghost sm" disabled={pending} onClick={add}>
          {pending ? "…" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

// ── detail panel ───────────────────────────────────────────────────────────
function RecetaDetail({
  receta,
  ingredientes,
}: {
  receta: RecetaRow;
  ingredientes: IngredienteOption[];
}) {
  const [error, setError] = React.useState<string | null>(null);
  const margen = receta.margin_pct;
  const ok = margen >= MARGEN_MIN;

  const usedIds = new Set(receta.items.map((i) => i.ingrediente_id));
  const addable = ingredientes.filter((i) => !usedIds.has(i.id));

  return (
    <div style={{ padding: "20px 28px 28px" }}>
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
            style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
          >
            {receta.category_label ?? "Sin categoría"} · {receta.sku}
          </div>
          <div className="font-slab" style={{ fontSize: 28, marginTop: 2, lineHeight: 1.05 }}>
            {receta.product}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-2)" }}>
            {receta.items.length} ingrediente{receta.items.length === 1 ? "" : "s"} ·
            costo recalculado en vivo
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="text-muted"
            style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
          >
            Precio de venta
          </div>
          <div className="cmd-num font-slab" style={{ fontSize: 32, lineHeight: 1, marginTop: 2 }}>
            ${fmtCOP(receta.price_cop)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
            se edita en Catálogo
          </div>
        </div>
        <div style={{ position: "absolute", top: -8, right: 18 }}>
          <Stamp rotate={4} color={ok ? "var(--green)" : "var(--red)"}>
            {ok ? "rentable" : "revisar"}
          </Stamp>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid var(--red)",
            color: "var(--red)",
            padding: "8px 12px",
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)" }}>
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
          {receta.items.length === 0 ? (
            <div className="text-muted" style={{ padding: 18, fontSize: 12, textAlign: "center" }}>
              Sin ingredientes todavía — agrega el primero abajo.
            </div>
          ) : (
            receta.items.map((it, i) => (
              <ItemRow key={it.id} item={it} even={i % 2 === 1} onError={setError} />
            ))
          )}
          <AddIngredient productoId={receta.producto_id} options={addable} onError={setError} />
        </div>

        <div className="flex flex-col" style={{ gap: 14 }}>
          <SummaryCard label="Costo total de la receta" caption="basado en costos de inventario">
            ${fmtCOP(receta.cost)}
          </SummaryCard>
          <SummaryCard label="Precio de venta" caption="lista base · sin descuentos">
            ${fmtCOP(receta.price_cop)}
          </SummaryCard>
          <div
            className="cmd-paper-lt relative"
            style={{ border: `1.5px solid ${ok ? "var(--green)" : "var(--red)"}`, padding: 14 }}
          >
            <div
              className="text-muted"
              style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              Margen de ganancia
            </div>
            <div
              className="cmd-num font-slab"
              style={{ fontSize: 38, lineHeight: 1, marginTop: 4, color: ok ? "var(--green)" : "var(--red)" }}
            >
              {margen}%
            </div>
            <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
              {ok ? `✓ sobre umbral mínimo (${MARGEN_MIN}%)` : `⚠ bajo umbral mínimo (${MARGEN_MIN}%)`}
            </div>
          </div>
          <div className="bg-paper" style={{ border: "1px dashed var(--rule)", padding: 12 }}>
            <div
              className="text-muted"
              style={{ fontSize: 10, marginBottom: 4, letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              Utilidad por unidad
            </div>
            <div className="cmd-num" style={{ fontSize: 18, fontWeight: 600 }}>
              ${fmtCOP(receta.price_cop - receta.cost)}
            </div>
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
    <div className="cmd-paper-lt" style={{ border: "1.5px solid var(--ink)", padding: 14 }}>
      <div
        className="text-muted"
        style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
      >
        {label}
      </div>
      <div className="cmd-num font-slab" style={{ fontSize: 30, lineHeight: 1, marginTop: 4 }}>
        {children}
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
        {caption}
      </div>
    </div>
  );
}

// ── Nueva receta drawer ────────────────────────────────────────────────────
type DraftLine = { ingrediente_id: string; qty: string };

function NuevaRecetaDrawer({
  productos,
  ingredientes,
  onClose,
  onCreated,
}: {
  productos: { id: string; name: string; sku: string }[];
  ingredientes: IngredienteOption[];
  onClose: () => void;
  onCreated: (productoId: string) => void;
}) {
  const [productoId, setProductoId] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ ingrediente_id: "", qty: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const ingById = React.useMemo(
    () => new Map(ingredientes.map((i) => [i.id, i])),
    [ingredientes],
  );
  const totalCosto = lines.reduce((s, l) => {
    const ing = ingById.get(l.ingrediente_id);
    return s + (ing ? Math.round((Number(l.qty) || 0) * ing.cost_cop) : 0);
  }, 0);

  const setLine = (i: number, k: keyof DraftLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, { ingrediente_id: "", qty: "" }]);
  const delLine = (i: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  const save = () => {
    if (!productoId) return setError("Elige un producto.");
    const items = lines
      .filter((l) => l.ingrediente_id && Number(l.qty) > 0)
      .map((l) => ({ ingrediente_id: l.ingrediente_id, qty: Number(l.qty) }));
    if (items.length === 0) return setError("Agrega al menos un ingrediente con cantidad.");
    setError(null);
    start(async () => {
      const r = await createReceta({ producto_id: productoId, items });
      if (r?.error) setError(r.error);
      else onCreated(productoId);
    });
  };

  const inputSt: React.CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "7px 9px",
    border: "1.5px solid var(--ink)",
    outline: "none",
    minHeight: 0,
  };
  const labelSt: React.CSSProperties = {
    display: "block",
    fontSize: 9,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(30,25,18,.32)" }} />
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
              style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
            >
              Recetas · 03
            </div>
            <div className="font-slab" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>
              Nueva receta
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted"
            style={{ background: "none", border: "1px solid var(--rule)", fontSize: 12, padding: "4px 9px", cursor: "pointer", minHeight: 0 }}
          >
            ✕ cerrar
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 0" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Producto *</label>
            <select
              aria-label="Producto de la receta"
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              style={{ ...inputSt, appearance: "none", cursor: "pointer" }}
            >
              <option value="">
                {productos.length ? "Elige un producto sin receta…" : "Todos los productos ya tienen receta"}
              </option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </div>

          <div style={{ height: 1, background: "var(--rule)", margin: "4px -22px 16px" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div
              className="text-muted"
              style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}
            >
              Ingredientes de la receta
            </div>
            <button type="button" onClick={addLine} className="cmd-btn ghost sm" style={{ fontSize: 10 }}>
              + agregar fila
            </button>
          </div>

          {lines.map((l, i) => (
            <div
              key={i}
              style={{ display: "grid", gridTemplateColumns: "1fr 70px 22px", gap: 6, marginBottom: 6 }}
            >
              <select
                aria-label={`Ingrediente fila ${i + 1}`}
                value={l.ingrediente_id}
                onChange={(e) => setLine(i, "ingrediente_id", e.target.value)}
                style={{ ...inputSt, fontSize: 11, padding: "5px 6px", appearance: "none", cursor: "pointer" }}
              >
                <option value="">Ingrediente…</option>
                {ingredientes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (${fmtCOP(o.cost_cop)}/{o.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={l.qty}
                onChange={(e) => setLine(i, "qty", e.target.value)}
                placeholder="cant."
                style={{ ...inputSt, fontSize: 11, padding: "5px 7px", textAlign: "right" }}
              />
              <button
                type="button"
                onClick={() => delLine(i)}
                disabled={lines.length <= 1}
                className="text-muted"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 14,
                  cursor: lines.length > 1 ? "pointer" : "default",
                  opacity: lines.length > 1 ? 1 : 0.3,
                  padding: 0,
                  minHeight: 0,
                }}
                aria-label="Quitar fila"
              >
                ✕
              </button>
            </div>
          ))}

          <div
            className="bg-paper"
            style={{ margin: "12px 0 16px", padding: "10px 12px", border: "1px dashed var(--rule)" }}
          >
            <div
              className="text-muted"
              style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              Costo receta (estimado)
            </div>
            <div className="cmd-num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              ${fmtCOP(totalCosto)}
            </div>
          </div>

          {error ? (
            <div role="alert" style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div
          className="bg-paper"
          style={{ padding: "14px 22px 18px", borderTop: "1.5px solid var(--ink)", display: "flex", gap: 10, flexShrink: 0 }}
        >
          <button type="button" onClick={onClose} className="cmd-btn ghost" style={{ flex: 1 }} disabled={pending}>
            Cancelar
          </button>
          <button type="button" onClick={save} className="cmd-btn" style={{ flex: 2 }} disabled={pending}>
            {pending ? "Creando…" : "Crear receta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── shell ──────────────────────────────────────────────────────────────────
export function RecetasClient({ view }: { view: RecetasView }) {
  const router = useRouter();
  const { recetas, productosSinReceta, ingredientes } = view;
  const [selected, setSelected] = React.useState<string | null>(
    recetas[0]?.producto_id ?? null,
  );
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Derive the effective selection so it stays valid as the recipe list
  // changes (create / empty-out) — no effect, no setState-in-effect.
  const effectiveSelected =
    selected !== null && recetas.some((r) => r.producto_id === selected)
      ? selected
      : (recetas[0]?.producto_id ?? null);

  const receta = recetas.find((r) => r.producto_id === effectiveSelected) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
      {drawerOpen ? (
        <NuevaRecetaDrawer
          productos={productosSinReceta}
          ingredientes={ingredientes}
          onClose={() => setDrawerOpen(false)}
          onCreated={(productoId) => {
            setSelected(productoId);
            setDrawerOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      <SectionCrumb
        section="recetas"
        right={
          <button
            type="button"
            className="cmd-btn sm"
            disabled={productosSinReceta.length === 0}
            onClick={() => setDrawerOpen(true)}
          >
            + Nueva receta
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "calc(100vh - 120px)" }}>
        <div className="cmd-paper-lt" style={{ borderRight: "1.5px solid var(--ink)", overflowY: "auto" }}>
          <div style={{ padding: "10px 12px 6px" }}>
            <CmdMiniLabel>Recetas ({recetas.length})</CmdMiniLabel>
          </div>
          {recetas.length === 0 ? (
            <div className="text-muted" style={{ padding: "14px", fontSize: 11, lineHeight: 1.5 }}>
              Aún no hay recetas. Crea una con <strong>+ Nueva receta</strong> para
              calcular costos y márgenes a partir del inventario.
            </div>
          ) : (
            recetas.map((r) => {
              const isActive = r.producto_id === effectiveSelected;
              const margenColor = r.margin_pct >= MARGEN_MIN ? "var(--green)" : "var(--amber)";
              return (
                <button
                  key={r.producto_id}
                  type="button"
                  onClick={() => setSelected(r.producto_id)}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, lineHeight: 1.3, flex: 1, paddingRight: 8 }}>
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
                      {r.margin_pct}%
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
                    {r.sku} · {r.items.length} ing · ${fmtCOP(r.cost)}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div style={{ overflowY: "auto" }}>
          {receta ? (
            <RecetaDetail key={receta.producto_id} receta={receta} ingredientes={ingredientes} />
          ) : (
            <div className="text-muted" style={{ padding: 40, fontSize: 13 }}>
              {recetas.length === 0
                ? "Crea tu primera receta para ver costos y márgenes aquí."
                : "Selecciona una receta de la lista"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
