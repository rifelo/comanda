import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { getPosCatalog } from "@/lib/pos/catalog";
import { PERIODOS, PERIODO_LABEL, parsePeriodo, rangoPeriodo, resumenBaristas, type FilaBarista } from "@/lib/baristas/baristas";
import { calificacionesDelPeriodo, nombresBaristas, ordenesDelPeriodo } from "@/lib/baristas/baristas-db";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../_components/turnos-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Baristas · co-manda" };

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const estrellas = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const prom = (p: number | null) => (p === null ? "—" : p.toFixed(1).replace(".", ","));

/**
 * Drinks each barista made and how customers rated those cups. The POS
 * credits every order to whoever is on the bar («Barista: …»); a prepared
 * drink is anything that prints a cup label. Read-only.
 */
export default async function BaristasPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const [{ profile, supabase }, sede, sp] = await Promise.all([requireAdmin(), getActiveSede(), searchParams]);
  const tz = sede?.tz ?? "America/Bogota";
  const orgId = profile.organization_id;
  const periodo = parsePeriodo(sp.periodo);
  const { desde, hasta } = rangoPeriodo(periodo, todayInTz(tz));

  const [catalog, ordenes, calificaciones] = await Promise.all([
    getPosCatalog({ organizationId: orgId, userId: null, orgName: "" }),
    ordenesDelPeriodo(supabase, orgId, desde, hasta),
    calificacionesDelPeriodo(supabase, orgId, desde, hasta),
  ]);
  const bebidas = new Set(catalog.menu.filter((p) => p.printsLabel).map((p) => p.id));
  const ids = [...new Set(ordenes.map((o) => o.baristaId).filter((x): x is string => !!x))];
  const nombres = await nombresBaristas(supabase, ids);
  const filas = resumenBaristas(
    ordenes,
    (id) => bebidas.has(id),
    (id) => (catalog.comboById[id]?.items ?? []).filter((p) => bebidas.has(p)).length,
    calificaciones,
    (id) => nombres.get(id) ?? "Sin nombre",
  );
  const conBarista = filas.filter((f) => f.id !== null);
  const sinBarista = filas.find((f) => f.id === null);
  const total = filas.reduce((s, f) => s + f.bebidas, 0);
  const rango = desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;

  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · EQUIPO" title="Baristas" />
      <div style={{ padding: "20px 16px 48px", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }} className="md:px-8">
        <nav aria-label="Periodo" className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`/baristas?periodo=${p}`}
              aria-current={p === periodo ? "page" : undefined}
              style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, textDecoration: "none", border: `1.5px solid ${p === periodo ? "var(--ink)" : "var(--rule)"}`, background: p === periodo ? "var(--ink)" : "transparent", color: p === periodo ? "var(--paper-lt)" : "var(--ink)" }}
            >
              {PERIODO_LABEL[p]}
            </Link>
          ))}
          <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>{rango} · {total} {total === 1 ? "bebida" : "bebidas"}</span>
        </nav>

        <section aria-label="Bebidas por barista" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {conBarista.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, gridColumn: "1 / -1", margin: 0 }}>
              Todavía no hay bebidas con barista en este periodo. En el POS, el barista que entra a turno toca «¿Quién prepara?» arriba y se elige; desde ahí cada bebida que se venda se cuenta para esa persona.
            </p>
          )}
          {conBarista.map((f) => <Tarjeta key={f.id} f={f} />)}
        </section>

        {sinBarista && (
          <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0, borderLeft: "3px solid var(--rule)", paddingLeft: 10 }}>
            <strong style={{ color: "var(--ink)" }}>{sinBarista.bebidas} {sinBarista.bebidas === 1 ? "bebida" : "bebidas"} sin barista</strong> ({sinBarista.pedidos} {sinBarista.pedidos === 1 ? "pedido" : "pedidos"}{sinBarista.calificadas ? `, ${sinBarista.calificadas} calificadas · ${prom(sinBarista.promedio)} ★` : ""}): se vendieron sin nadie elegido en «Barista» del POS, o antes del 21 de octubre, cuando empezó el conteo.
          </p>
        )}

        <section aria-label="Calificaciones del periodo">
          <div style={label}>Calificaciones de estas bebidas · {calificaciones.length}</div>
          {calificaciones.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Ningún cliente ha calificado todavía una bebida de este periodo.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {calificaciones.map((c) => (
              <article key={c.id} style={{ border: `1.5px solid ${c.estrellas <= 2 ? "var(--red)" : "var(--rule)"}`, borderRadius: 6, background: "var(--paper-lt)", padding: "10px 14px" }}>
                <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span aria-label={`${c.estrellas} de 5 estrellas`} style={{ fontSize: 16, letterSpacing: 1, color: c.estrellas <= 2 ? "var(--red)" : "var(--ink)" }}>{estrellas(c.estrellas)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.bebida}</span>
                  <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 999, border: "1px solid var(--rule)" }}>{c.baristaId ? nombres.get(c.baristaId) ?? "Sin nombre" : "Sin barista"}</span>
                  <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>
                    {fechaCorta(todayInTz(tz, new Date(c.usadaAt)))} {formatTime(c.usadaAt, tz)}{c.folio ? ` · ${c.folio}` : ""}{c.customerName ? ` · ${c.customerName}` : ""}
                  </span>
                </div>
                {c.sugerencia && <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>«{c.sugerencia}»</p>}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Tarjeta({ f }: { f: FilaBarista }) {
  const max = Math.max(1, ...f.estrellas);
  const pct = f.bebidas ? Math.round((f.calificadas / f.bebidas) * 100) : 0;
  return (
    <article aria-label={f.name} style={{ border: "1.5px solid var(--ink)", borderRadius: 6, background: "var(--paper-lt)", padding: "14px 16px" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{f.name}</div>
      <div className="flex items-end" style={{ gap: 18, marginTop: 8 }}>
        <div>
          <div className="cmd-num font-slab" style={{ fontSize: 40, lineHeight: 1 }}>{f.bebidas}</div>
          <div style={label}>{f.bebidas === 1 ? "bebida" : "bebidas"}</div>
        </div>
        <div>
          <div className="cmd-num font-slab" style={{ fontSize: 28, lineHeight: 1 }}>{prom(f.promedio)}<span style={{ fontSize: 14 }}> ★</span></div>
          <div style={label}>{f.calificadas} {f.calificadas === 1 ? "calificada" : "calificadas"}{f.calificadas ? ` · ${pct} %` : ""}</div>
        </div>
      </div>
      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>{f.pedidos} {f.pedidos === 1 ? "pedido" : "pedidos"}</div>
      {f.calificadas > 0 && (
        <div style={{ marginTop: 8 }}>
          {[5, 4, 3, 2, 1].map((e) => (
            <div key={e} className="flex items-center" style={{ gap: 8, marginTop: 4, fontSize: 11 }}>
              <span className="cmd-num" style={{ width: 20 }}>{e}★</span>
              <span style={{ flex: 1, height: 6, background: "var(--rule-soft)", borderRadius: 3, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(f.estrellas[e - 1] / max) * 100}%`, background: e <= 2 ? "var(--red)" : "var(--ink)" }} />
              </span>
              <span className="cmd-num" style={{ width: 20, textAlign: "right" }}>{f.estrellas[e - 1]}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
