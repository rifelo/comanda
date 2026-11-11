import Link from "next/link";
import { todayInTz } from "@/lib/utils";
import { resultadosDelDia, tareasPendientes, type ResultadoTablet } from "@/lib/inventario/agente/db";
import { requireEquipo } from "../../../_components/gate";
import { VERIF_CSS } from "../estilos";
import { legible } from "../formato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificación lista · Comanda" };

const PILL: Record<ResultadoTablet["estado"], { label: string; icon: string }> = {
  aplicado: { label: "Ajustado", icon: "M5 12.5l4.5 4.5L19 7.5" },
  revisar: { label: "Necesita segunda revisión", icon: "M12 3l9 16H3zM12 10v4M12 17h.01" },
  no_encontrado: { label: "No se encontró", icon: "M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" },
};

/**
 * «Listo» after a verification walk: what was counted today next to what
 * the system said (the count is already saved, so the blind part is over),
 * and whether each difference was adjusted on its own or waits for a second
 * check.
 */
export default async function VerificarListoPage() {
  const ctx = await requireEquipo("/turno/inventario/verificar/listo");
  const { admin, organizationId, sede } = ctx;
  const today = todayInTz(sede.tz);
  const [resultados, pendientes] = await Promise.all([resultadosDelDia(admin, organizationId, today, { hechaPor: ctx.actor.profileId }), tareasPendientes(admin, organizationId, today)]);
  const nombre = ctx.actor.fullName.trim().split(/\s+/)[0] || "";
  const n = resultados.length;
  const revisar = resultados.some((r) => r.estado === "revisar");
  return (
    <div className="verif">
      <style>{VERIF_CSS}</style>
      <header className="verif-head">
        <div className="verif-headrow">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="verif-h1">Verificar inventario</h1>
            <p className="verif-sub">{n === 1 ? "1 insumo verificado hoy" : `${n} insumos verificados hoy`}</p>
          </div>
        </div>
        {n > 0 && (
          <div className="verif-bar" role="img" aria-label={`${n} de ${n + pendientes.length} listos`}>
            {resultados.map((_, i) => <span key={`h${i}`} data-s="hecho" />)}
            {pendientes.map((p) => <span key={p.id} />)}
          </div>
        )}
      </header>

      <main className="verif-main">
        {n > 0 && (
          <div className="verif-ok" role="status">
            <span className="verif-ok-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2>{nombre ? `Listo, gracias ${nombre}` : "Listo, gracias"}</h2>
              <p>{n === 1 ? "El insumo quedó verificado." : `Los ${n} insumos quedaron verificados.`} Con esto el inventario es más confiable.</p>
            </div>
          </div>
        )}

        <section className="verif-res" aria-labelledby="verif-res-t">
          <h2 id="verif-res-t">Lo que contaste</h2>
          {n === 0 && <div className="verif-empty">Hoy todavía no se ha verificado nada.</div>}
          {resultados.map((r, i) => {
            const pill = PILL[r.estado];
            return (
              <div key={`${r.name}-${i}`} className="verif-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="verif-row-name">{r.name}</div>
                  <div className="verif-row-meta">
                    {r.estado === "no_encontrado" || r.counted === null ? (
                      "No lo encontraron en su sitio"
                    ) : (
                      <>
                        Contaste <b>{legible(r.counted, r)}</b>
                        {r.expected !== null && <> · el sistema decía {legible(r.expected, r)}</>}
                      </>
                    )}
                  </div>
                </div>
                <span className="verif-pill" data-e={r.estado}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={pill.icon} /></svg>
                  {pill.label}
                </span>
              </div>
            );
          })}
          {n > 0 && (
            <p className="verif-note">
              Las diferencias normales se ajustan solas.
              {revisar ? " Lo que se salió de lo normal necesita una segunda revisión antes de ajustarse." : ""}
            </p>
          )}
        </section>

        <div className="verif-fin">
          {pendientes.length > 0 && (
            <Link href="/turno/inventario/verificar" className="verif-ghost verif-link">
              {pendientes.length === 1 ? "Falta 1 insumo · seguir verificando" : `Faltan ${pendientes.length} insumos · seguir verificando`}
            </Link>
          )}
          <Link href="/turno/inventario" className="verif-solid verif-fija">Volver a inventario</Link>
        </div>
      </main>
    </div>
  );
}
