import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui/top-bar";
import { costoTanda, fmtTandas, porcionHabitual } from "@/lib/inventario/preparaciones";
import { listPreparaciones, listTandas, usosDePreparaciones } from "@/lib/inventario/preparaciones-db";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { getActiveSede } from "@/lib/data/sede";
import { fechaCorta, fmtCOP, todayInTz } from "@/lib/utils";
import { NuevaPreparacion } from "./nueva-preparacion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparaciones · Comanda" };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: "16px 18px", display: "grid", gap: 14 };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const pesos = (n: number) => `$${fmtCOP(Math.round(n))}`;
const pesos2 = (n: number) => `$${fmtCOP(Math.round(n * 100) / 100)}`;
const cant = (n: number) => fmtCOP(Math.round(n * 100) / 100);
const corto = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
const DIAS_TANDAS = 30;
/** Bogotá date of an ISO timestamp, without ICU (SSR and the browser print the same). */
const diaBogota = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);

/**
 * Preparaciones: what the bar makes from inventory insumos and then puts in
 * the drinks (Cold foam tradicional → 30 g in every cold drink). Each card
 * shows one batch (ingredients, yield, cost), the portion and what it costs
 * in a drink, the stock, the last batches made on the tablet and the
 * products that use it. The batch is edited on the insumo's page.
 */
export default async function PreparacionesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  const desde = inicioDia(todayInTz(sede?.tz ?? "America/Bogota"), DIAS_TANDAS);
  const preps = await listPreparaciones(supabase, orgId);
  const [usos, tandas] = await Promise.all([
    usosDePreparaciones(supabase, orgId, preps.map((p) => p.id)),
    listTandas(supabase, orgId, desde, 300),
  ]);

  return (
    <div>
      <PageHeader back="/productos" title="Preparaciones" sub="Lo que preparamos en barra con insumos del inventario y luego va en las bebidas." />
      <div className="px-4 sm:px-7 pb-10 flex flex-col gap-5" style={{ maxWidth: 1000 }}>
        <NuevaPreparacion />
        {preps.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Aún no hay preparaciones. Crea la primera con el botón de arriba.</p>
        ) : null}
        {preps.map((p) => {
          const lista = usos.get(p.id) ?? [];
          const porcion = porcionHabitual(lista);
          const tanda = costoTanda(p.lineas);
          const suyas = tandas.filter((t) => t.preparacionId === p.id);
          const ultima = suyas[0];
          const hechas = suyas.reduce((s, t) => s + t.tandas, 0);
          const sinCosto = p.lineas.filter((l) => !(l.costo > 0)).map((l) => corto(l.name));
          return (
            <section key={p.id} style={card} aria-label={p.name}>
              <div className="flex justify-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{p.name}</h2>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                    Una tanda rinde {cant(p.rinde)} {p.unit}
                    {porcion ? ` · ${Math.floor(p.rinde / porcion)} porciones de ${cant(porcion)} ${p.unit}` : ""}
                  </div>
                </div>
                <Link href={`/inventario/${p.id}`} className="cmd-btn ghost" style={{ minHeight: 40, borderRadius: 10, fontSize: 14 }}>
                  Editar la tanda
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <div>
                  <div style={kicker}>Costo de la tanda</div>
                  <div className="cmd-num" style={{ fontSize: 20, fontWeight: 700 }}>{pesos(tanda)}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{pesos2(p.costo)} por {p.unit}</div>
                </div>
                <div>
                  <div style={kicker}>En cada bebida</div>
                  <div className="cmd-num" style={{ fontSize: 20, fontWeight: 700 }}>{porcion ? pesos(porcion * p.costo) : "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{porcion ? `${cant(porcion)} ${p.unit}` : "ninguna bebida la usa"}</div>
                </div>
                <div>
                  <div style={kicker}>Existencias</div>
                  <div className="cmd-num" style={{ fontSize: 20, fontWeight: 700, color: p.stock < 0 ? "var(--red)" : "var(--text)" }}>{cant(p.stock)} {p.unit}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.stock < 0 ? "se vendió más de lo preparado" : "preparado y sin vender"}</div>
                </div>
                <div>
                  <div style={kicker}>Tandas · {DIAS_TANDAS} días</div>
                  <div className="cmd-num" style={{ fontSize: 20, fontWeight: 700 }}>{fmtTandas(hechas)}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {ultima ? `última: ${fechaCorta(diaBogota(ultima.at))}${ultima.quien ? ` · ${ultima.quien.split(" ")[0]}` : ""}` : "ninguna registrada en la tablet"}
                  </div>
                </div>
              </div>

              <div>
                <div style={kicker}>Una tanda lleva</div>
                {p.lineas.length === 0 ? (
                  <p style={{ fontSize: 14, color: "var(--red)", margin: "6px 0 0" }}>Sin ingredientes: agrégalos en «Editar la tanda».</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "grid", gap: 4 }}>
                    {p.lineas.map((l) => (
                      <li key={l.ingredienteId} className="flex justify-between" style={{ gap: 12, fontSize: 14 }}>
                        <span>{cant(l.qty)} {l.unit} · {corto(l.name)}</span>
                        <span className="cmd-num" style={{ color: l.costo > 0 ? "var(--muted)" : "var(--red)" }}>{l.costo > 0 ? pesos(l.qty * l.costo) : "sin costo"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {sinCosto.length ? <p style={{ fontSize: 12, color: "var(--red)", margin: "6px 0 0" }}>Sin costo en el inventario: {sinCosto.join(", ")}. El costo real es mayor.</p> : null}
              </div>

              <div>
                <div style={kicker}>Va en {lista.length} {lista.length === 1 ? "producto" : "productos"}</div>
                {lista.length ? (
                  <div className="flex" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {lista.map((u) => (
                      <Link
                        key={u.productoId}
                        href={`/productos/${u.productoId}`}
                        style={{ display: "inline-flex", alignItems: "center", minHeight: 34, fontSize: 13, border: "1px solid var(--line)", borderRadius: 999, padding: "0 12px", color: "var(--text)", textDecoration: "none" }}
                      >
                        {u.name}
                        {u.qty !== porcion ? <span style={{ color: "var(--muted)" }}> · {cant(u.qty)} {p.unit}</span> : null}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>Agrégala a una receta como cualquier insumo (Productos › receta).</p>
                )}
              </div>
            </section>
          );
        })}
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Cada vez que el equipo hace una tanda la registra en la tablet (Inventario › Preparaciones): salen los ingredientes y entra lo preparado. Al vender, cada bebida descuenta su porción.
        </p>
      </div>
    </div>
  );
}
