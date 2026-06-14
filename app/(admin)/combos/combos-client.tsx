"use client";

/**
 * Combos — bundles of productos sold at a package price. Real CRUD: create a
 * combo (name + price + product lines), toggle active, edit the bundle price
 * inline, and delete. Regular total and saving are derived from list prices.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { fmtCOP } from "@/lib/mock/productos";
import { comboSavingPct } from "@/lib/combos";
import type { CombosView, ComboRow } from "@/lib/db/combos";
import { Stamp } from "@/components/comanda/primitives";
import { SectionCrumb } from "../_components/shared";
import {
  createCombo,
  deleteCombo,
  setComboActive,
  updateComboPrice,
} from "./actions";

type ProductoOpt = { id: string; name: string; price_cop: number };

function PriceInput({ combo }: { combo: ComboRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [val, setVal] = React.useState(String(combo.price_cop));
  const [prev, setPrev] = React.useState(combo.price_cop);
  if (combo.price_cop !== prev) {
    setPrev(combo.price_cop);
    setVal(String(combo.price_cop));
  }
  const commit = () => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) return setVal(String(combo.price_cop));
    if (n === combo.price_cop) return;
    start(async () => {
      const r = await updateComboPrice({ combo_id: combo.id, price_cop: n });
      if (r?.error) setVal(String(combo.price_cop));
      else router.refresh();
    });
  };
  return (
    <input
      aria-label={`Precio combo ${combo.name}`}
      type="number"
      min="0"
      value={val}
      disabled={pending}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="cmd-num"
      style={{ width: 110, textAlign: "right", border: "1px solid var(--ink)", padding: "5px 8px", fontSize: 16, fontWeight: 600, color: "var(--ink)", background: "var(--paper)", minHeight: 0 }}
    />
  );
}

function ComboCard({ combo }: { combo: ComboRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const savePct = comboSavingPct(combo.regular_total, combo.price_cop);

  const toggle = () =>
    start(async () => {
      await setComboActive({ combo_id: combo.id, active: !combo.active });
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      await deleteCombo({ combo_id: combo.id });
      router.refresh();
    });

  return (
    <div
      className="cmd-paper-lt relative"
      style={{ border: "1.5px solid var(--ink)", padding: 18, opacity: combo.active ? 1 : 0.6 }}
    >
      <div style={{ position: "absolute", top: -8, right: 16 }}>
        <Stamp rotate={3} color={combo.active ? "var(--green)" : "var(--muted)"}>
          {combo.active ? "activo" : "inactivo"}
        </Stamp>
      </div>
      <div className="flex justify-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="font-slab" style={{ fontSize: 22, lineHeight: 1.05 }}>{combo.name}</div>
          {combo.description ? (
            <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{combo.description}</div>
          ) : null}
        </div>
      </div>

      <div style={{ border: "1px dashed var(--rule)", padding: 10, marginBottom: 12 }}>
        {combo.items.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 11, textAlign: "center", padding: 6 }}>Sin productos</div>
        ) : (
          combo.items.map((it) => (
            <div key={it.id} className="flex justify-between" style={{ fontSize: 12, padding: "3px 0" }}>
              <span>{it.qty}× {it.name}</span>
              <span className="cmd-num text-muted">${fmtCOP(it.total)}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-between" style={{ alignItems: "center", marginBottom: 6 }}>
        <span className="text-muted" style={{ fontSize: 11 }}>
          Regular <span className="cmd-num" style={{ textDecorationLine: "line-through" }}>${fmtCOP(combo.regular_total)}</span>
        </span>
        <PriceInput combo={combo} />
      </div>
      <div className="flex justify-between" style={{ alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: combo.saving > 0 ? "var(--green)" : "var(--muted)" }}>
          Ahorro ${fmtCOP(combo.saving)} {savePct > 0 ? `· ${savePct}%` : ""}
        </span>
        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="cmd-btn ghost sm" disabled={pending} onClick={toggle}>
            {combo.active ? "Desactivar" : "Activar"}
          </button>
          <button type="button" className="cmd-btn ghost sm" disabled={pending} onClick={remove} style={{ color: "var(--red)", borderColor: "var(--red)" }}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

type DraftLine = { producto_id: string; qty: string };

function CrearComboDrawer({
  productos,
  onClose,
}: {
  productos: ProductoOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ producto_id: "", qty: "1" }]);
  const [error, setError] = React.useState<string | null>(null);

  const prodById = React.useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const regular = lines.reduce((s, l) => {
    const p = prodById.get(l.producto_id);
    return s + (p ? p.price_cop * (Number(l.qty) || 0) : 0);
  }, 0);

  const setLine = (i: number, k: keyof DraftLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, { producto_id: "", qty: "1" }]);
  const delLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  const save = () => {
    const items = lines
      .filter((l) => l.producto_id && Number(l.qty) > 0)
      .map((l) => ({ producto_id: l.producto_id, qty: Number(l.qty) }));
    if (!name.trim()) return setError("El nombre es obligatorio.");
    if (!price || Number(price) < 0) return setError("Precio inválido.");
    if (items.length === 0) return setError("Agrega al menos un producto.");
    setError(null);
    start(async () => {
      const r = await createCombo({ name, description, price_cop: Number(price), items });
      if (r?.error) setError(r.error);
      else { onClose(); router.refresh(); }
    });
  };

  const inputSt: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", background: "var(--paper)", padding: "8px 10px", border: "1.5px solid var(--ink)", outline: "none", minHeight: 0 };
  const labelSt: React.CSSProperties = { display: "block", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(30,25,18,.32)" }} />
      <div className="cmd-paper-lt" style={{ position: "relative", zIndex: 1, width: 460, maxWidth: "100%", height: "100%", borderLeft: "1.5px solid var(--ink)", display: "flex", flexDirection: "column" }}>
        <div className="bg-paper" style={{ padding: "18px 22px 14px", borderBottom: "1.5px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>Combos · 09</div>
            <div className="font-slab" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>Nuevo combo</div>
          </div>
          <button type="button" onClick={onClose} className="text-muted" style={{ background: "none", border: "1px solid var(--rule)", fontSize: 12, padding: "4px 9px", cursor: "pointer", minHeight: 0 }}>✕ cerrar</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Nombre *</label>
            <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Combo Clásico" style={inputSt} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Descripción</label>
            <input aria-label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="la combinación más pedida" style={inputSt} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Precio combo (COP) *</label>
            <input aria-label="Precio" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="33900" style={inputSt} />
          </div>

          <div style={{ height: 1, background: "var(--rule)", margin: "4px -22px 16px" }} />
          <div className="flex justify-between" style={{ alignItems: "center", marginBottom: 8 }}>
            <div className="text-muted" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>Productos</div>
            <button type="button" onClick={addLine} className="cmd-btn ghost sm" style={{ fontSize: 10 }}>+ fila</button>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 56px 22px", gap: 6, marginBottom: 6 }}>
              <select aria-label={`Producto fila ${i + 1}`} value={l.producto_id} onChange={(e) => setLine(i, "producto_id", e.target.value)} style={{ ...inputSt, fontSize: 11, padding: "5px 6px", appearance: "none", cursor: "pointer" }}>
                <option value="">Producto…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (${fmtCOP(p.price_cop)})</option>
                ))}
              </select>
              <input aria-label={`Cantidad fila ${i + 1}`} type="number" min="1" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} style={{ ...inputSt, fontSize: 11, padding: "5px 7px", textAlign: "right" }} />
              <button type="button" onClick={() => delLine(i)} disabled={lines.length <= 1} className="text-muted" style={{ background: "none", border: "none", fontSize: 14, cursor: lines.length > 1 ? "pointer" : "default", opacity: lines.length > 1 ? 1 : 0.3, padding: 0, minHeight: 0 }} aria-label="Quitar fila">✕</button>
            </div>
          ))}

          <div className="bg-paper" style={{ margin: "12px 0 16px", padding: "10px 12px", border: "1px dashed var(--rule)", display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted" style={{ fontSize: 11 }}>Regular</span>
            <span className="cmd-num" style={{ fontWeight: 600 }}>${fmtCOP(regular)}</span>
          </div>
          {price && Number(price) >= 0 ? (
            <div className="bg-paper" style={{ marginBottom: 16, padding: "10px 12px", border: "1px dashed var(--green)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--green)" }}>Ahorro estimado</span>
              <span className="cmd-num" style={{ fontWeight: 600, color: "var(--green)" }}>${fmtCOP(Math.max(0, regular - Number(price)))}</span>
            </div>
          ) : null}

          {error ? <div role="alert" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div> : null}
        </div>

        <div className="bg-paper" style={{ padding: "14px 22px 18px", borderTop: "1.5px solid var(--ink)", display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} className="cmd-btn ghost" style={{ flex: 1 }} disabled={pending}>Cancelar</button>
          <button type="button" onClick={save} className="cmd-btn" style={{ flex: 2 }} disabled={pending}>{pending ? "Creando…" : "Crear combo"}</button>
        </div>
      </div>
    </div>
  );
}

export function CombosClient({ view }: { view: CombosView }) {
  const { combos, productos } = view;
  const [drawer, setDrawer] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(true);
  const shown = showInactive ? combos : combos.filter((c) => c.active);

  return (
    <div>
      {drawer ? <CrearComboDrawer productos={productos} onClose={() => setDrawer(false)} /> : null}
      <SectionCrumb
        section="combos"
        right={
          <>
            <button type="button" className={showInactive ? "cmd-btn ghost sm" : "cmd-btn sm"} onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
            </button>
            <button type="button" className="cmd-btn sm" disabled={productos.length === 0} onClick={() => setDrawer(true)}>
              + Crear combo
            </button>
          </>
        }
      />

      <div style={{ padding: "24px 28px" }}>
        {shown.length === 0 ? (
          <div className="text-muted" style={{ padding: 40, fontSize: 13, textAlign: "center" }}>
            {combos.length === 0
              ? "Aún no hay combos. Crea uno con + Crear combo."
              : "No hay combos activos."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
            {shown.map((c) => (
              <ComboCard key={c.id} combo={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
