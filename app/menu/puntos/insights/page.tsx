import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { insights, mesAnio, miles, pesosCortos, type PeriodoInsights } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarEscaneos } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { BASE, Pantalla } from "../shell";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tus estadísticas · Café Pa' Yo", robots: { index: false, follow: false } };

const MOSTRAR_LOGROS = false;

const PERIODOS: { id: PeriodoInsights; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "6m", label: "6 meses" },
  { id: "todo", label: "Todo" },
];

/** «Tus estadísticas»: what and when the customer drinks. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(`${BASE}?ir=insights`);
  const p = (await searchParams).p;
  const periodo: PeriodoInsights = p === "mes" || p === "6m" ? p : "todo";
  const org = menuContent.organizationId;
  const cliente = await cargarCliente(org, instagram);
  const escaneos = cliente ? await cargarEscaneos(org, cliente.id) : [];
  const r = insights(escaneos, periodo);
  const maxTop = Math.max(1, ...r.top.map((d) => d.veces));
  const maxMes = Math.max(1, ...r.meses.map((m) => m.v));
  const maxFranja = Math.max(1, ...r.franjas.map((f) => f.v));
  const maxDia = Math.max(...r.dias.map((d) => d.v));
  const hechos = r.bebidas;

  return (
    <Pantalla instagram={instagram} tab="insights">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="pyy-col">
          <h1 className="pyy-h1">Tus estadísticas</h1>
          <span className="pyy-meta">
            {cliente ? `Cliente desde ${mesAnio(cliente.desde)} · ` : ""}1 punto por cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")}
          </span>
        </div>
        <nav aria-label="Periodo" className="pyy-periodo">
          {PERIODOS.map((x) => (
            <a key={x.id} href={x.id === "todo" ? `${BASE}/insights` : `${BASE}/insights?p=${x.id}`} aria-current={x.id === periodo ? "true" : undefined}>
              {x.label}
            </a>
          ))}
        </nav>
      </div>

      <section aria-label="Resumen" className="pyy-dos">
        <div className="pyy-tile pyy-tile--pale">
          <span className="pyy-n">{r.bebidas}</span>
          <span className="pyy-meta">{r.bebidas === 1 ? "bebida pedida" : "bebidas pedidas"}</span>
        </div>
        <div className="pyy-tile">
          <span className="pyy-n">{miles(r.puntos)}</span>
          <span className="pyy-meta">puntos ganados</span>
        </div>
        <div className="pyy-tile">
          <span className="pyy-n">{pesosCortos(r.gastado)}</span>
          <span className="pyy-meta">en tu pausa de café</span>
        </div>
        <div className="pyy-tile">
          <span className="pyy-n">{r.distintas}</span>
          <span className="pyy-meta">{r.distintas === 1 ? "bebida distinta" : "bebidas distintas"}</span>
        </div>
      </section>

      {hechos === 0 ? (
        <p className="pyy-vacio">
          {periodo === "todo"
            ? "Aún no hay bebidas con tu usuario. Escanea el QR de tu vaso la próxima vez y aquí verás qué y cuándo tomas."
            : "En este periodo no hay bebidas con tu usuario. Mira «Todo» para ver tu historia completa."}
        </p>
      ) : (
        <>
          <section aria-labelledby="pyy-top" className="pyy-card">
            <h2 id="pyy-top" className="pyy-h2">Lo que más tomas</h2>
            {r.top.map((d, i) => (
              <div key={d.nombre} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div className="pyy-fila">
                  <b>{d.nombre}</b>
                  <span className="pyy-meta--s">
                    {d.veces} · {d.pct}%
                  </span>
                </div>
                <div className="pyy-barra" aria-hidden="true">
                  <div className={i === 0 ? "on" : undefined} style={{ width: `${Math.round((d.veces / maxTop) * 100)}%` }} />
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="pyy-mes" className="pyy-card" style={{ gap: 14 }}>
            <div className="pyy-col">
              <h2 id="pyy-mes" className="pyy-h2">Mes a mes</h2>
              {r.mejorMes && (
                <span className="pyy-meta">
                  {r.mejorMes.nombre.charAt(0).toUpperCase() + r.mejorMes.nombre.slice(1)} fue tu mes más cafetero: {r.mejorMes.v} {r.mejorMes.v === 1 ? "bebida" : "bebidas"}
                </span>
              )}
            </div>
            <div role="img" aria-label={`Bebidas por mes: ${r.meses.map((m) => `${m.label} ${m.v}`).join(", ")}`} className="pyy-meses">
              {r.meses.map((m) => (
                <div key={m.label}>
                  <span style={{ fontWeight: 700, fontSize: 12, lineHeight: "16px" }}>{m.v}</span>
                  <div
                    className={`col${r.mejorMes && m.v === r.mejorMes.v ? " on" : ""}${m.v === 0 ? " cero" : ""}`}
                    style={{ height: `${Math.round((m.v / maxMes) * 96)}px` }}
                  />
                  <span className="pyy-meta--s">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="pyy-hora" className="pyy-card pyy-card--pale" style={{ gap: 14 }}>
            <div className="pyy-col">
              <span className="pyy-meta--s">Tu hora Pa&apos;Yo</span>
              <h2 id="pyy-hora" className="pyy-n" style={{ margin: 0, fontSize: 26, lineHeight: "30px" }}>
                {r.horaPico}
              </h2>
              <span style={{ fontSize: 13, lineHeight: "18px" }}>{r.pctManana}% de tus bebidas son de mañana.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {r.franjas.map((f) => (
                <div key={f.label} className="pyy-franja">
                  <span>{f.label}</span>
                  <div className="pyy-barra" aria-hidden="true">
                    <div style={{ width: `${Math.round((f.v / maxFranja) * 100)}%`, minWidth: f.v ? 8 : 0 }} />
                  </div>
                  <span>{f.v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="pyy-meta--s">Por día{r.diaFavorito ? ` · tu día es el ${r.diaFavorito}` : ""}</span>
              <div className="pyy-dias" role="img" aria-label={`Bebidas por día: ${r.dias.map((d) => `${d.label} ${d.v}`).join(", ")}`}>
                {r.dias.map((d) => (
                  <div key={d.label}>
                    <div className={`pyy-dia${maxDia > 0 && d.v >= maxDia * 0.75 ? " on" : ""}`}>{d.v}</div>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="pyy-temp" className="pyy-card">
            <h2 id="pyy-temp" className="pyy-h2">Caliente o frío</h2>
            <div role="img" aria-label={`${r.calientes} bebidas calientes y ${r.frias} frías`} className="pyy-mezcla">
              {r.calientes > 0 && (
                <div className="cal" style={{ width: r.frias ? `${Math.max(34, Math.min(80, Math.round((r.calientes / hechos) * 100)))}%` : "100%" }}>
                  Calientes · {r.calientes}
                </div>
              )}
              {r.frias > 0 && <div className="fri">{r.calientes ? r.frias : `Frías · ${r.frias}`}</div>}
            </div>
            <span className="pyy-meta">
              {[r.favCaliente && `Tu caliente: ${r.favCaliente}.`, r.favFria && `Tu fría: ${r.favFria}.`].filter(Boolean).join(" ")}
            </span>
          </section>

          <section aria-labelledby="pyy-datos" className="pyy-card">
            <h2 id="pyy-datos" className="pyy-h2">Datos curiosos</h2>
            <div className="pyy-dato">
              <span className="pyy-n">{r.rachaMasLarga}</span>
              <span>{r.rachaMasLarga === 1 ? "semana con visita, tu racha más larga" : "semanas seguidas, tu racha más larga"}</span>
            </div>
            <div className="pyy-dato">
              <span className="pyy-n">{r.distintas}</span>
              <span>{r.distintas === 1 ? "bebida del menú probada" : "bebidas del menú probadas"}</span>
            </div>
            {r.primera && (
              <div className="pyy-dato">
                <span className="pyy-n">1ra</span>
                <span>
                  {r.primera.nombre}, el {r.primera.fecha}
                </span>
              </div>
            )}
          </section>
        </>
      )}

      {/* «Tus logros» hidden on the owner's request (2026-11-09); insights() still computes them. */}
      {MOSTRAR_LOGROS && r.logros.length > 0 && (
        <section aria-labelledby="pyy-logros" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="pyy-logros" className="pyy-h2">Tus logros</h2>
          <div className="pyy-logros">
            {r.logros.map((l) => (
              <span key={l.label} className={l.hecho ? undefined : "falta"}>
                {l.label}
              </span>
            ))}
          </div>
        </section>
      )}
    </Pantalla>
  );
}
