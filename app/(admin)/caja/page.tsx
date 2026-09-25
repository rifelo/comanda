import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { baseSugerida, listCierres } from "@/lib/caja/cierres";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { SectionCrumb } from "../_components/shared";
import { CajaCard } from "../hoy/[date]/caja-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Caja · co-manda" };

const money = (n: number) => (n < 0 ? `-${posMoney(-n)}` : posMoney(n));
const STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "var(--amber)" },
  aprobado: { label: "Aprobado", color: "var(--green)" },
  rechazado: { label: "Rechazado", color: "var(--red)" },
};

/**
 * Caja for the owner: the cierres the team sent (pending ones first, with
 * Aprobar / Rechazar), the base currently in the drawer and the trail of
 * base inicial → base que queda across days.
 */
export default async function CajaAdminPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const today = todayInTz(tz);
  const [cierres, base] = await Promise.all([
    listCierres(supabase, profile.organization_id, 60),
    sede ? baseSugerida(supabase, sede.id) : Promise.resolve({ monto: 0, fecha: null, turno: null, counted_by_name: null }),
  ]);
  const pendientes = cierres.filter((c) => c.status === "pendiente");
  const aprobados = cierres.filter((c) => c.status === "aprobado");
  const diffTotal = aprobados.reduce((s, c) => s + (c.pagos_count > 0 ? c.diferencia_cop : 0), 0);
  const entregas = aprobados.reduce((s, c) => s + (c.contado_cop - c.base_dejada_cop), 0);

  const stat = (label: string, value: string, color?: string, hint?: string) => (
    <div style={{ padding: "10px 12px", border: "1px solid var(--rule)", background: "var(--paper-lt)", minWidth: 150 }}>
      <div className="text-muted" style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase" }}>{label}</div>
      <div className="cmd-num font-slab" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2, color: color ?? "var(--ink)" }}>{value}</div>
      {hint && <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );

  return (
    <div>
      <SectionCrumb
        section="caja"
        right={
          <>
            <Link href={`/hoy/${today}`} className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>Detalle de hoy</Link>
            <Link href="/turno/caja" className="cmd-btn sm" style={{ textDecoration: "none" }}>Contar ahora →</Link>
          </>
        }
      />
      <div style={{ padding: "20px 28px 48px", fontFamily: "var(--font-mono)" }}>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {stat("Base en caja", posMoney(base.monto), undefined, base.fecha ? `dejada el ${fechaCorta(base.fecha)}${base.turno ? ` · ${base.turno}` : ""}${base.counted_by_name ? ` · ${base.counted_by_name}` : ""}` : "sin cierres todavía")}
          {stat("Por aprobar", String(pendientes.length), pendientes.length ? "var(--amber)" : undefined)}
          {stat("Diferencia acumulada", money(diffTotal), diffTotal < 0 ? "var(--red)" : diffTotal > 0 ? "var(--amber)" : "var(--green)", `${aprobados.length} cierre${aprobados.length === 1 ? "" : "s"} aprobado${aprobados.length === 1 ? "" : "s"}`)}
          {stat("Entregado", posMoney(entregas), undefined, "suma de las entregas aprobadas")}
        </div>

        {pendientes.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <div className="text-muted" style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 10 }}>Por aprobar · {pendientes.length}</div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {pendientes.map((c) => (
                <div key={c.id}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <b>{c.shift_date ? fechaCorta(c.shift_date) : fechaCorta(c.submitted_at.slice(0, 10))}</b> · {c.shift_name ?? "sin turno"} · enviado {formatTime(c.submitted_at, tz)}
                  </div>
                  <CajaCard cierre={c} window={`${formatTime(c.ventana_desde, tz)} – ${formatTime(c.ventana_hasta, tz)}`} hasCajaTask={false} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <div className="text-muted" style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 6 }}>Historial de cierres · base que entra y base que queda</div>
          {cierres.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13, padding: "12px 0" }}>Todavía no hay cierres. El equipo los envía desde el tablet (Turno → Caja) o desde su turno (Caja · arqueo).</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr className="text-muted" style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px 6px 0", fontWeight: 500 }}>Fecha</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500 }}>Turno</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500 }}>Contó</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Base inicial</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Efectivo POS</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Contado</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Diferencia</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Base que queda</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500, textAlign: "right" }}>Entrega</th>
                    <th style={{ padding: "6px 0 6px 8px", fontWeight: 500 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((c) => {
                    const st = STATUS[c.status];
                    const noPos = c.pagos_count === 0;
                    const tone = c.diferencia_cop < 0 ? "var(--red)" : c.diferencia_cop > 0 ? "var(--amber)" : "var(--green)";
                    const entrega = c.contado_cop - c.base_dejada_cop;
                    const dim = c.status === "rechazado";
                    return (
                      <tr key={c.id} style={{ borderTop: "1px solid var(--rule-soft, var(--rule))", opacity: dim ? 0.55 : 1 }}>
                        <td className="cmd-num" style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>
                          {c.shift_date ? (
                            <Link href={`/hoy/${c.shift_date}${c.shift_instance_id ? `?turno=${c.shift_instance_id}` : ""}`} className="cmd-link">{fechaCorta(c.shift_date)}</Link>
                          ) : fechaCorta(c.submitted_at.slice(0, 10))}
                          <span className="text-muted"> {formatTime(c.submitted_at, tz)}</span>
                        </td>
                        <td style={{ padding: "8px" }}>{c.shift_name ?? "—"}</td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{c.counted_by_name ?? "—"}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right" }}>{posMoney(c.base_inicial_cop)}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right", color: noPos ? "var(--muted)" : undefined }}>{noPos ? "—" : posMoney(c.efectivo_cop)}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right" }}>{posMoney(c.contado_cop)}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right", color: noPos ? "var(--muted)" : tone, fontWeight: 700 }}>{noPos ? "—" : money(c.diferencia_cop)}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{posMoney(c.base_dejada_cop)}</td>
                        <td className="cmd-num" style={{ padding: "8px", textAlign: "right", color: entrega < 0 ? "var(--red)" : undefined }}>{money(entrega)}</td>
                        <td style={{ padding: "8px 0 8px 8px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: st.color, fontWeight: 700 }}>{st.label}</span>
                          {c.note && <span className="text-muted" title={c.note} style={{ marginLeft: 6 }}>✎</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
            La base que queda de un cierre es la base inicial sugerida del siguiente. Entrega = contado − base que queda. Diferencia = contado − (base inicial + efectivo del POS en la ventana del turno); los cierres sin pagos en el POS no se comparan.
          </p>
        </section>
      </div>
    </div>
  );
}
