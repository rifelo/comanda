import Link from "next/link";
import { posMoney } from "@/lib/pos/types";
import { MARGEN_OBJETIVO, type ProductoRentable, type RentabilidadDia } from "@/lib/numeros/rentabilidad";

const money = (n: number) => (Math.round(n) < 0 ? `−${posMoney(-Math.round(n))}` : posMoney(Math.round(n)));
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLabel = (ym: string | null) => (ym ? MES[Number(ym.slice(5, 7)) - 1] : null);

/**
 * «¿El día fue rentable?» — the day's income statement (sales → gross →
 * net after the Bold fee, expenses and the fixed share), a short reading and
 * the profit of every product sold. Server component; data from
 * lib/numeros/rentabilidad.ts.
 */
export function Rentabilidad({ r, esHoy }: { r: RentabilidadDia; esHoy: boolean }) {
  const gana = r.utilidadNeta >= 0;
  const avance = r.equilibrio ? Math.min(100, Math.round((r.ventas / r.equilibrio) * 100)) : null;
  const top = r.productos[0] ?? null;
  const bajos = r.productos.filter((p) => p.bajo);
  const cats = r.categorias.filter((c) => c.ingreso > 0);
  const peorCat = cats.length > 1 ? [...cats].sort((a, b) => (a.margen ?? 0) - (b.margen ?? 0))[0] : null;
  const porMil = r.ventas > 0 ? Math.round((r.utilidadBruta / r.ventas) * 1000) : null;

  if (r.ventas === 0) {
    return (
      <div data-testid="rentabilidad" className="text-muted" style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)", padding: "16px 14px", fontSize: 12 }}>
        Sin ventas pagadas {esHoy ? "todavía" : "ese día"}. Los costos fijos del día son {posMoney(r.fijos.dia)}: eso es lo que hay que cubrir.
      </div>
    );
  }

  return (
    <div data-testid="rentabilidad" style={{ display: "grid", gap: 14 }}>
      <div className="grid grid-cols-1 lg:grid-cols-5" style={{ gap: 14 }}>
        {/* ── estado de resultados ── */}
        <div className="cmd-noise lg:col-span-3" style={{ border: "1.5px solid var(--ink)", background: "var(--paper-lt)", padding: 16 }}>
          <Fila label="Ventas pagadas" value={posMoney(r.ventas)} />
          <Fila
            label="Costo de venta"
            hint={`insumos según la receta de cada producto · ${r.margenBruto ?? 0} % de margen`}
            value={`−${posMoney(r.costoVenta)}`}
            tone="var(--red)"
          />
          <Fila label="Utilidad bruta" value={money(r.utilidadBruta)} strong tone="var(--green)" />
          <Fila
            label={r.comision.estimada ? "Comisión Bold (estimada)" : "Comisión Bold"}
            hint={r.comision.estimada ? `1,495 % + 4x1000 sobre ${posMoney(r.comision.base)} en transferencias y tarjeta` : "registrada en Gastos ese día"}
            value={`−${money(r.comision.monto)}`}
            tone="var(--red)"
          />
          {r.otrosGastos > 0 ? <Fila label="Otros gastos del día" hint="los de Gastos, sin arriendo, servicios ni nómina" value={`−${money(r.otrosGastos)}`} tone="var(--red)" /> : null}
          <Fila
            label="Costos fijos del día"
            hint={
              r.fijos.mesFuente
                ? `arriendo, servicios y nómina de ${mesLabel(r.fijos.mesFuente)}: ${posMoney(r.fijos.mes)} ÷ ${r.fijos.diasMes} días${esHoy ? " · cuenta el día completo" : ""}`
                : "no hay arriendo, servicios ni nómina en Gastos: regístralos para ver la utilidad real"
            }
            value={`−${posMoney(r.fijos.dia)}`}
            tone="var(--red)"
          />
          <div className="flex items-baseline justify-between" style={{ gap: 12, marginTop: 8, paddingTop: 10, borderTop: "1.5px solid var(--ink)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{gana ? "Utilidad neta del día" : "Pérdida del día"}</span>
            <span className="font-slab cmd-num" style={{ fontSize: 26, lineHeight: 1, color: gana ? "var(--green)" : "var(--red)" }}>{money(r.utilidadNeta)}</span>
          </div>
          {r.equilibrio != null && avance != null ? (
            <div style={{ marginTop: 14 }}>
              <div className="flex flex-wrap items-baseline justify-between" style={{ gap: "2px 10px", fontSize: 11.5 }}>
                <span>
                  Punto de equilibrio: <b className="cmd-num">{posMoney(r.equilibrio)}</b> en ventas
                </span>
                <span className="text-muted cmd-num">
                  {r.ventas >= r.equilibrio ? `superado por ${posMoney(r.ventas - r.equilibrio)}` : `faltan ${posMoney(r.equilibrio - r.ventas)}`} · {avance} %
                </span>
              </div>
              <div aria-hidden style={{ marginTop: 6, height: 8, background: "var(--paper-dk)" }}>
                <div style={{ width: `${avance}%`, height: "100%", background: avance >= 100 ? "var(--green)" : "var(--amber)" }} />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── lectura del día ── */}
        <div className="lg:col-span-2" style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)", padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Para decidir</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 9, fontSize: 12.5, lineHeight: 1.45 }}>
            {porMil != null ? (
              <li>
                De cada <b>$1.000</b> vendidos quedan <b className="cmd-num">{posMoney(porMil)}</b> después de insumos.
              </li>
            ) : null}
            {top ? (
              <li>
                Lo que más ganancia dejó: <b>{top.name}</b> · <span className="cmd-num">{posMoney(top.utilidad)}</span> en {top.unidades} {top.unidades === 1 ? "unidad" : "unidades"}.
              </li>
            ) : null}
            {peorCat ? (
              <li>
                Categoría con menor margen: <b>{peorCat.categoria}</b> ({peorCat.margen} %).{" "}
                {peorCat.categoria.toLowerCase() === "postres" ? <span className="text-muted">Los postres son gancho a propósito.</span> : null}
              </li>
            ) : null}
            {bajos.length ? (
              <li>
                <b style={{ color: "var(--amber)" }}>{bajos.length} {bajos.length === 1 ? "producto" : "productos"} bajo {MARGEN_OBJETIVO} %:</b> {bajos.slice(0, 4).map((p) => `${p.name} (${p.margen} %)`).join(", ")}
                {bajos.length > 4 ? ` y ${bajos.length - 4} más` : ""}. Revisa precio o receta en <Link href="/recetas" className="cmd-link">Recetas</Link>.
              </li>
            ) : (
              <li>Todo lo vendido (sin contar postres) está en {MARGEN_OBJETIVO} % de margen o más.</li>
            )}
            {r.sinCosto.productos ? (
              <li style={{ color: "var(--red)" }}>
                {r.sinCosto.productos} {r.sinCosto.productos === 1 ? "producto vendido no tiene" : "productos vendidos no tienen"} costo ({posMoney(r.sinCosto.ingreso)} en ventas): su utilidad sale inflada.
              </li>
            ) : null}
          </ul>
          {cats.length ? (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)", display: "grid", gap: 6 }}>
              {cats.map((c) => (
                <div key={c.categoria} className="flex items-baseline" style={{ gap: 8, fontSize: 11.5 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{c.categoria}</span>
                  <span className="cmd-num text-muted">{posMoney(c.ingreso)}</span>
                  <span className="cmd-num" style={{ width: 70, textAlign: "right", fontWeight: 700 }}>{money(c.utilidad)}</span>
                  <span className="cmd-num" style={{ width: 38, textAlign: "right", color: tonoMargen(c.margen, c.categoria) }}>{c.margen ?? "—"} %</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── utilidad por producto ── */}
      <div style={{ border: "1px solid var(--rule)", background: "var(--paper-lt)" }}>
        <div
          className={`grid text-muted ${COLS}`}
          style={{ gap: 8, padding: "8px 14px", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", borderBottom: "1.5px solid var(--ink)" }}
        >
          <span>Producto</span>
          <span style={{ textAlign: "right" }}>Unid.</span>
          <span className="hidden sm:block" style={{ textAlign: "right" }}>Venta</span>
          <span className="hidden sm:block" style={{ textAlign: "right" }}>Costo</span>
          <span style={{ textAlign: "right" }}>Utilidad</span>
          <span style={{ textAlign: "right" }}>Margen</span>
        </div>
        {r.productos.map((p, i) => (
          <FilaProducto key={p.key} p={p} first={i === 0} />
        ))}
        <div className={`grid ${COLS}`} style={{ gap: 8, padding: "10px 14px", borderTop: "1.5px solid var(--ink)", fontSize: 12.5, fontWeight: 700 }}>
          <span>Total</span>
          <span className="cmd-num" style={{ textAlign: "right" }}>{r.productos.reduce((s, p) => s + p.unidades, 0)}</span>
          <span className="cmd-num hidden sm:block" style={{ textAlign: "right" }}>{posMoney(r.ventas)}</span>
          <span className="cmd-num hidden sm:block" style={{ textAlign: "right" }}>{posMoney(r.costoVenta)}</span>
          <span className="cmd-num" style={{ textAlign: "right" }}>{money(r.utilidadBruta)}</span>
          <span className="cmd-num" style={{ textAlign: "right" }}>{r.margenBruto ?? "—"} %</span>
        </div>
      </div>
    </div>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_36px_84px_52px] sm:grid-cols-[minmax(0,1fr)_44px_88px_88px_92px_58px]";

function tonoMargen(margen: number | null, categoria: string | null): string {
  if (margen == null) return "var(--muted)";
  if ((categoria ?? "").toLowerCase() === "postres") return "var(--muted)";
  return margen >= MARGEN_OBJETIVO ? "var(--green)" : "var(--amber)";
}

function FilaProducto({ p, first }: { p: ProductoRentable; first: boolean }) {
  return (
    <div className={`grid items-baseline ${COLS}`} style={{ gap: 8, padding: "8px 14px", borderTop: first ? "none" : "1px solid var(--rule-soft)", fontSize: 12.5 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{p.name}</span>
        <span className="text-muted" style={{ fontSize: 10.5 }}>
          {p.categoria ?? "sin categoría"}
          {p.unidades > 0 ? ` · deja ${posMoney(Math.round(p.utilidad / p.unidades))} c/u` : ""}
          {p.sinCosto ? <b style={{ color: "var(--red)" }}> · sin costo</b> : null}
        </span>
      </span>
      <span className="cmd-num" style={{ textAlign: "right" }}>{p.unidades}</span>
      <span className="cmd-num hidden sm:block" style={{ textAlign: "right" }}>{posMoney(p.ingreso)}</span>
      <span className="cmd-num text-muted hidden sm:block" style={{ textAlign: "right" }}>{posMoney(p.costo)}</span>
      <span className="cmd-num" style={{ textAlign: "right", fontWeight: 700 }}>{money(p.utilidad)}</span>
      <span className="cmd-num" style={{ textAlign: "right", fontWeight: 700, color: p.sinCosto ? "var(--red)" : tonoMargen(p.margen, p.categoria) }}>
        {p.sinCosto ? "?" : `${p.margen ?? "—"} %`}
      </span>
    </div>
  );
}

function Fila({ label, hint, value, strong, tone }: { label: string; hint?: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: 12, padding: "7px 0", borderTop: strong ? "1px dashed var(--rule)" : "none" }}>
      <span style={{ fontSize: 12.5, fontWeight: strong ? 700 : 400, minWidth: 0 }}>
        {label}
        {hint ? <span className="text-muted" style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 1 }}>{hint}</span> : null}
      </span>
      <span className="cmd-num" style={{ fontSize: strong ? 15 : 13, fontWeight: 700, whiteSpace: "nowrap", color: tone }}>{value}</span>
    </div>
  );
}
