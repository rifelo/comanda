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
export const metadata: Metadata = { title: "Tus insights · Café Pa' Yo", robots: { index: false, follow: false } };

const PERIODOS: { id: PeriodoInsights; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "6m", label: "6 meses" },
  { id: "todo", label: "Todo" },
];

/** «Tus insights»: what and when the customer drinks. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(BASE);
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
      <header style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="pyy-meta">
            {cliente ? `Cliente desde ${mesAnio(cliente.desde)} · ` : ""}1 punto por cada ${PESOS_POR_PUNTO.toLocaleString("es-CO")}
          </span>
          <h1 className="pyy-h1">Tus insights</h1>
        </div>
        <nav aria-label="Periodo" className="pyy-periodo">
          {PERIODOS.map((x) => (
            <a key={x.id} href={x.id === "todo" ? `${BASE}/insights` : `${BASE}/insights?p=${x.id}`} aria-current={x.id === periodo ? "true" : undefined}>
              {x.label}
            </a>
          ))}
        </nav>
      </header>

      <section aria-label="Resumen" className="pyy-dos">
        <div className="pyy-big pyy-big--amarillo">
          <span className="pyy-n">{r.bebidas}</span>
          <span>{r.bebidas === 1 ? "bebida pedida" : "bebidas pedidas"}</span>
        </div>
        <div className="pyy-big">
          <span className="pyy-n">{miles(r.puntos)}</span>
          <span>puntos ganados</span>
        </div>
        <div className="pyy-big">
          <span className="pyy-n">{pesosCortos(r.gastado)}</span>
          <span>en tu pausa de café</span>
        </div>
        <div className="pyy-big">
          <span className="pyy-n">{r.distintas}</span>
          <span>{r.distintas === 1 ? "bebida distinta" : "bebidas distintas"}</span>
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
              <div key={d.nombre} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="pyy-fila">
                  <b>
                    {i + 1}. {d.nombre}
                  </b>
                  <span className="pyy-meta">
                    {d.veces} · {d.pct}%
                  </span>
                </div>
                <div className="pyy-barra" aria-hidden="true">
                  <div className={i === 0 ? "on" : undefined} style={{ width: `${Math.round((d.veces / maxTop) * 100)}%` }} />
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="pyy-mes" className="pyy-card">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                  <span className="pyy-n" style={{ fontSize: 13 }}>
                    {m.v}
                  </span>
                  <div
                    className={`col${r.mejorMes && m.v === r.mejorMes.v ? " on" : ""}${m.v === 0 ? " cero" : ""}`}
                    style={{ height: `${Math.round((m.v / maxMes) * 110)}px` }}
                  />
                  <span className="pyy-k pyy-meta" style={{ fontSize: 12 }}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="pyy-hora" className="pyy-card pyy-card--cafe">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="pyy-k" style={{ fontSize: 13, color: "var(--amarillo)" }}>
                Tu hora Pa&apos;Yo
              </span>
              <h2 id="pyy-hora" className="pyy-h1">{r.horaPico}</h2>
              <span className="pyy-meta">{r.pctManana}% de tus bebidas son de mañana.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {r.franjas.map((f) => (
                <div key={f.label} className="pyy-franja">
                  <span>{f.label}</span>
                  <div className="pista" aria-hidden="true">
                    <div style={{ width: `${Math.round((f.v / maxFranja) * 100)}%` }} />
                  </div>
                  <span className="pyy-n" style={{ fontSize: 13, textAlign: "right" }}>
                    {f.v}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="pyy-k" style={{ fontSize: 13, color: "var(--amarillo)" }}>
                Por día{r.diaFavorito ? ` · tu día es el ${r.diaFavorito}` : ""}
              </span>
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
                <div className="cal" style={{ width: r.frias ? `${Math.max(30, Math.min(80, Math.round((r.calientes / hechos) * 100)))}%` : "100%" }}>
                  Calientes {r.calientes}
                </div>
              )}
              {r.frias > 0 && <div className="fri">{r.calientes ? r.frias : `Frías ${r.frias}`}</div>}
            </div>
            <span className="pyy-meta">
              {[r.favCaliente && `Tu caliente: ${r.favCaliente}.`, r.favFria && `Tu fría: ${r.favFria}.`].filter(Boolean).join(" ")}
            </span>
          </section>

          <section aria-label="Datos curiosos" className="pyy-card pyy-card--amarillo">
            <span className="pyy-scan__lema" style={{ fontSize: 24 }}>
              Tómalo con calma. O con doble shot.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  <span className="pyy-n">1ª</span>
                  <span>
                    {r.primera.nombre}, el {r.primera.fecha}
                  </span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {r.logros.length > 0 && (
        <section aria-labelledby="pyy-logros" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
