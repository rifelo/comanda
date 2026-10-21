import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { CATEGORIA_GASTO, CUENTA_GASTO, moneyGasto, resumenGastos } from "@/lib/gastos/gastos";
import { listGastos } from "@/lib/gastos/gastos-db";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { SectionCrumb } from "../_components/shared";
import { BorrarGasto, NuevoGasto } from "./gastos-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Gastos · co-manda" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mesDe(mes: string): { desde: string; hasta: string; prev: string; next: string; label: string } {
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (d: number) => {
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return { desde: `${mes}-01`, hasta: `${mes}-${String(dias).padStart(2, "0")}`, prev: shift(-1), next: shift(1), label: `${MESES[m - 1]} ${y}` };
}

/**
 * Gastos for the owner: what it costs to run the place that isn't inventory
 * or cash from the drawer — the Bold fee on transfers, rent, utilities,
 * payroll. Register one, see the month by category and by day, delete a
 * mistake. /numeros shows the day's total.
 */
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const [{ profile, supabase }, sede, sp] = await Promise.all([requireAdmin(), getActiveSede(), searchParams]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const mesHoy = today.slice(0, 7);
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) && sp.mes <= mesHoy ? sp.mes : mesHoy;
  const r = mesDe(mes);
  const gastos = await listGastos(supabase, profile.organization_id, r.desde, r.hasta);
  const t = resumenGastos(gastos);
  const porDia = new Map<string, typeof gastos>();
  for (const g of gastos) porDia.set(g.fecha, [...(porDia.get(g.fecha) ?? []), g]);

  return (
    <div>
      <SectionCrumb section="gastos" />
      <div style={{ padding: "20px 28px 48px", fontFamily: "var(--font-mono)" }}>
        <NuevoGasto today={today} />

        <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 28 }}>
          <Link href={`/gastos?mes=${r.prev}`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>‹</Link>
          <span className="font-slab" style={{ fontSize: 20, textTransform: "capitalize", minWidth: 170, textAlign: "center" }}>{r.label}</span>
          {mes < mesHoy ? <Link href={`/gastos?mes=${r.next}`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>›</Link> : null}
          <span className="flex-1" />
          <span style={{ fontSize: 12 }}>
            <span className="text-muted" style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", marginRight: 8 }}>Total del mes</span>
            <b className="cmd-num" style={{ fontSize: 18 }}>{moneyGasto(t.total)}</b>
          </span>
        </div>

        {t.porCategoria.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }}>
            {t.porCategoria.map((c) => (
              <div key={c.categoria} style={{ padding: "8px 12px", border: "1px solid var(--rule)", background: "var(--paper-lt)", minWidth: 140 }}>
                <div className="text-muted" style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase" }}>{CATEGORIA_GASTO[c.categoria].label} · {c.n}</div>
                <div className="cmd-num font-slab" style={{ fontSize: 18, marginTop: 2 }}>{moneyGasto(c.monto)}</div>
              </div>
            ))}
          </div>
        )}

        <section style={{ marginTop: 20 }}>
          {gastos.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12.5, padding: "8px 0" }}>Sin gastos registrados en {r.label}.</div>
          ) : (
            [...porDia.entries()].map(([fecha, gs]) => (
              <div key={fecha} style={{ marginTop: 14 }}>
                <div className="flex items-center" style={{ gap: 10, fontSize: 11, borderBottom: "1px solid var(--ink)" }}>
                  <Link href={fecha === today ? "/numeros" : `/numeros/${fecha}`} className="cmd-link" style={{ fontWeight: 700, display: "inline-flex", alignItems: "center" }}>{fechaCorta(fecha)}</Link>
                  <b className="cmd-num" style={{ marginLeft: "auto" }}>{moneyGasto(resumenGastos(gs).total)}</b>
                </div>
                {gs.map((g) => (
                  <div key={g.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0", borderBottom: "1px dashed var(--rule)", fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{g.concepto}</b>
                      <span className="text-muted"> · {CATEGORIA_GASTO[g.categoria].label} · {CUENTA_GASTO[g.cuenta]}{g.by ? ` · ${g.by}` : ""}</span>
                      {g.note ? <span className="text-muted" style={{ display: "block", fontSize: 11, marginTop: 2 }}>{g.note}</span> : null}
                    </span>
                    <span className="cmd-num" style={{ fontWeight: 700, whiteSpace: "nowrap", color: "var(--red)" }}>−{moneyGasto(g.monto)}</span>
                    <BorrarGasto id={g.id} concepto={g.concepto} />
                  </div>
                ))}
              </div>
            ))
          )}
        </section>

        <p className="text-muted" style={{ fontSize: 11, marginTop: 22, lineHeight: 1.5, maxWidth: 760 }}>
          Aquí va lo que cuesta operar y no sale del cajón. Lo que se paga con el efectivo de la caja se anota como salida en la tablet (Caja → Ingresos y salidas) para que el arqueo cuadre; las compras de insumos van por Compras.
        </p>
      </div>
    </div>
  );
}
