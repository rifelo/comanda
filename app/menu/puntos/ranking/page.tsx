import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { miles, ranking, type PeriodoRanking } from "@/lib/clientes/mi-payo";
import { cargarCliente, cargarRanking } from "@/lib/clientes/mi-payo-db";
import { instagramDeSesion } from "@/lib/clientes/sesion";
import { menuContent } from "@/lib/menu/data";
import { BASE, Pantalla } from "../shell";
import "../mi-payo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ranking · Café Pa' Yo",
  robots: { index: false, follow: false },
};

const PERIODOS: { id: PeriodoRanking; label: string }[] = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "todo", label: "Histórico" },
];
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function nota(periodo: PeriodoRanking): string {
  const b = new Date(Date.now() - 5 * 3600_000);
  if (periodo === "mes")
    return `${MESES[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  if (periodo === "semana") return "De lunes a domingo";
  return "Desde que empezamos a sumar";
}
const inicial = (h: string) => h.replace(/^@/, "").charAt(0) || "@";

/** «Ranking Pa'Yo»: points per customer by week, month or all time; other people's @ are masked. */
export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const instagram = await instagramDeSesion();
  if (!instagram) redirect(BASE);
  const p = (await searchParams).p;
  const periodo: PeriodoRanking = p === "semana" || p === "todo" ? p : "mes";
  const org = menuContent.organizationId;
  const [cliente, filas] = await Promise.all([
    cargarCliente(org, instagram),
    cargarRanking(org, periodo),
  ]);
  const r = ranking(filas, cliente?.id ?? null);
  // Podium order on screen: 2nd, 1st, 3rd.
  const podio = [r.podio[1], r.podio[0], r.podio[2]];

  return (
    <Pantalla instagram={instagram} tab="ranking" tono="oscuro">
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="pyy-h2" style={{ fontSize: 26, lineHeight: "28px" }}>
          Ranking Pa&apos;Yo
        </h1>
        <span className="pyy-meta">{nota(periodo)}</span>
      </header>

      <nav aria-label="Periodo" className="pyy-seg">
        {PERIODOS.map((x) => (
          <a
            key={x.id}
            href={
              x.id === "mes" ? `${BASE}/ranking` : `${BASE}/ranking?p=${x.id}`
            }
            aria-current={x.id === periodo ? "true" : undefined}
          >
            {x.label}
          </a>
        ))}
      </nav>

      {r.podio.length === 0 ? (
        <p className="pyy-vacio" style={{ borderColor: "var(--crema)" }}>
          Nadie ha sumado puntos en este periodo todavía. ¡El primer lugar es
          tuyo si escaneas hoy!
        </p>
      ) : (
        <>
          <section aria-label="Podio" className="pyy-podio">
            {podio.map((x, i) =>
              !x ? (
                <div key={`vacio-${i}`} aria-hidden="true" />
              ) : (
                <div key={x.pos} className={`p${x.pos}${x.yo ? " yo" : ""}`}>
                  <div className="ava" aria-hidden="true">
                    {inicial(x.handle)}
                  </div>
                  <span className="h">
                    {x.handle}
                    {x.yo ? " (tú)" : ""}
                  </span>
                  <div className="bloque">
                    <b>{x.pos}</b>
                    <span>{miles(x.puntos)} pts</span>
                  </div>
                </div>
              ),
            )}
          </section>

          {r.filas.length > 0 && (
            <ol aria-label="Posiciones" className="pyy-pos">
              {r.filas.map((x) => (
                <li key={x.pos} className={x.yo ? "yo" : undefined}>
                  <span className="n">{x.pos}</span>
                  <div className="ava" aria-hidden="true">
                    {inicial(x.handle)}
                  </div>
                  <div>
                    <b>
                      {x.handle}
                      {x.yo ? " (tú)" : ""}
                    </b>
                    <span
                      className="pyy-meta"
                      style={{ fontSize: 12, lineHeight: "16px" }}
                    >
                      {x.bebidas} {x.bebidas === 1 ? "bebida" : "bebidas"}
                    </span>
                  </div>
                  <span className="pts">{miles(x.puntos)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <div className="pyy-yo">
        {r.yo ? (
          <>
            <b>#{r.yo.pos}</b>
            <div>
              <b>Estás en el puesto #{r.yo.pos}</b>
              <span>
                {r.yo.faltan === null
                  ? "¡Vas de primero! Que nadie te alcance."
                  : `Te ${r.yo.faltan === 1 ? "falta 1 pt" : `faltan ${r.yo.faltan} pts`} para el #${r.yo.pos - 1}`}
              </span>
            </div>
          </>
        ) : (
          <div>
            <b>Aún no estás en este ranking</b>
            <span>
              Escanea el QR de tu vaso con tu usuario y empieza a subir.
            </span>
          </div>
        )}
      </div>
    </Pantalla>
  );
}
