import Link from "next/link";
import { loadTurnoGate } from "@/lib/turno/server";
import { formatTime, todayInTz } from "@/lib/utils";
import { loadRutina } from "@/lib/inventario/conteos";
import { fraseFaltantes } from "@/lib/inventario/faltantes";
import { countFaltantesAbiertos } from "@/lib/inventario/faltantes-db";
import { nivelDe } from "@/lib/inventario/niveles";
import { DIAS_LARGOS, NOMBRE_CONTEO } from "@/lib/inventario/rutina";
import { TurnoLogin } from "../_components/turno-login";
import { TurnoUnpaired } from "../unpaired";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario · co-manda" };

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 };

/**
 * Inventory on the shared tablet: what the routine owes today (the quick
 * count at close, the full one on its weekday), what the owner sent back,
 * and the doors to each tool (count, stock, requisition, faltantes). The screen is the reminder — nobody has to
 * remember which count is due.
 */
export default async function TurnoInventarioPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired next="/turno/inventario" />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  const { admin, organizationId, sede } = ctx;
  const [estado, faltantes, { data: ings }, { count: solicitudes }] = await Promise.all([
    loadRutina(admin, organizationId, sede.tz),
    countFaltantesAbiertos(admin, organizationId),
    admin.from("ingredientes").select("stock_current, stock_critico, stock_min").eq("organization_id", organizationId).eq("archived", false),
    admin.from("inventario_solicitudes").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("estado", "abierta"),
  ]);
  const { rutina, hoy } = estado;
  const niveles = { rojo: 0, amarillo: 0, verde: 0 };
  for (const i of ings ?? []) niveles[nivelDe(Number(i.stock_current), Number(i.stock_critico ?? 0), Number(i.stock_min ?? 0))] += 1;
  const enviado = hoy.find((c) => c.status !== "rechazado") ?? null;
  const rechazado = hoy.find((c) => c.status === "rechazado") ?? null;
  const diaCompleto = DIAS_LARGOS[estado.completoDia];
  const isAdmin = ctx.actor.role === "admin" && !ctx.actor.viaDevice;
  const faltan = fraseFaltantes(faltantes);
  // Rough size of the shopping list: what is short by level plus what the team asked for.
  const porPedir = niveles.rojo + niveles.amarillo + (solicitudes ?? 0);

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Inventario<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sede.name} · {todayInTz(sede.tz)}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={ctx.actor.fullName}>{ctx.actor.fullName}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/turno" style={chip}>← Turno</Link>
          {isAdmin && <Link href="/inventario" style={chip}>Panel</Link>}
        </div>
      </div>

      <div style={{ padding: "22px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <section aria-label="Hoy">
          <div style={kicker}>Hoy</div>
          <div style={{ border: `1.5px solid ${rutina.hecho ? "var(--rule)" : "var(--ink)"}`, borderRadius: 8, background: "var(--paper-lt)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="font-slab" style={{ fontSize: 22, lineHeight: 1.15 }}>{NOMBRE_CONTEO[rutina.toca]}</div>
              {rutina.hecho && enviado ? (
                <div style={{ fontSize: 12.5, marginTop: 5, color: "var(--green)", fontWeight: 600 }}>
                  ✓ Enviado a las {formatTime(new Date(enviado.submitted_at), sede.tz)}{enviado.counted_by_name ? ` · ${enviado.counted_by_name}` : ""}
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {enviado.status === "aprobado" ? (enviado.auto ? "inventario corregido" : "aprobado") : "lo revisa el dueño"}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, marginTop: 5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  {rutina.toca === "completo"
                    ? `Hoy es ${diaCompleto}: se cuenta todo, zona por zona, antes de cerrar. Empieza media hora antes.`
                    : "Se hace al cierre, antes de la caja: lo crítico, unos cinco minutos."}
                </div>
              )}
            </div>
            <Link href="/turno/conteo" className={rutina.hecho ? "cmd-btn ghost" : "cmd-btn red"} style={{ textDecoration: "none", height: 52, padding: "0 22px", display: "inline-flex", alignItems: "center", fontSize: 13 }}>
              {rutina.hecho ? "Contar de nuevo" : "Contar ahora →"}
            </Link>
          </div>
          {rechazado && !rutina.hecho && (
            <div role="alert" style={{ marginTop: 10, border: "1.5px solid var(--red)", borderRadius: 6, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: "var(--red)" }}>El dueño devolvió el conteo de hoy.</b> {rechazado.review_note ? `«${rechazado.review_note}»` : "Hay que contar de nuevo."}
            </div>
          )}
          {rutina.completoAtrasado && (
            <div style={{ marginTop: 10, border: "1px dashed var(--rule)", borderRadius: 6, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
              {rutina.diasDesdeCompleto === null
                ? `Todavía no se ha hecho el primer conteo completo: hasta entonces las cantidades del sistema no son confiables. Toca el ${diaCompleto} al cierre.`
                : `El último conteo completo fue hace ${rutina.diasDesdeCompleto} días. Toca el ${diaCompleto} al cierre.`}
            </div>
          )}
        </section>

        <section aria-label="Herramientas">
          <div style={kicker}>Herramientas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            <Tile href="/turno/conteo" title="Contar" hint="Conteo rápido de cada noche o completo de la semana." state={`completo: ${diaCompleto} al cierre`} />
            <Tile
              href="/turno/inventario/existencias"
              title="Existencias"
              hint="Qué hay, qué queda poco y qué se acabó."
              state={niveles.rojo || niveles.amarillo ? `${niveles.rojo} se acabó · ${niveles.amarillo} poco` : "todo en verde"}
              tone={niveles.rojo ? "var(--red)" : niveles.amarillo ? "var(--amber)" : "var(--green)"}
            />
            <Tile href="/turno/inventario/pedir" title="Pedir" hint="Lo que ya está en la lista de compras, y pedir algo más." state={porPedir ? `${porPedir} por pedir` : "nada por pedir"} tone={porPedir ? "var(--amber)" : undefined} />
            <Tile
              href="/turno/inventario/faltantes"
              title="Avisar faltante"
              hint="Algo se acabó en pleno turno: un toque y el dueño se entera."
              state={faltan ? `reportados: ${faltan}` : "nada reportado"}
              tone={faltantes.agotado ? "var(--red)" : faltantes.bajo ? "var(--amber)" : undefined}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ href, title, hint, state, tone }: { href: string; title: string; hint: string; state: string; tone?: string }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 96, padding: "14px 16px", border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", textDecoration: "none", color: "var(--ink)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="font-slab" style={{ display: "block", fontSize: 20, lineHeight: 1.15 }}>{title}</span>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginTop: 4, color: tone ?? "var(--muted)" }}>{state}</span>
        <span style={{ display: "block", fontSize: 11.5, marginTop: 3, color: "var(--muted)", lineHeight: 1.45 }}>{hint}</span>
      </span>
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>→</span>
    </Link>
  );
}
