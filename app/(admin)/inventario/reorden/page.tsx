import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { calcularParOrg, parPanel, type ParPanelFila } from "@/lib/inventario/agente/db";
import { MASIVO_DIAS, SEGURIDAD_MASIVO, SEGURIDAD_NORMAL } from "@/lib/inventario/agente/par";
import { PageHeader } from "@/components/ui/top-bar";
import { todayInTz } from "@/lib/utils";
import { cantidad } from "../conteos/_lib/formato";
import { Recalcular } from "./recalcular";

export const dynamic = "force-dynamic";
export const metadata = { title: "Punto de reorden · Comanda" };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", padding: "14px 16px" };
const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const th: React.CSSProperties = { ...kicker, textAlign: "left", padding: "0 10px 10px", whiteSpace: "nowrap", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px 10px", borderTop: "1px solid var(--line)", fontSize: 14, verticalAlign: "top" };
const pill = (bg: string, fg: string): React.CSSProperties => ({ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: bg, color: fg, whiteSpace: "nowrap" });

type Ver = "pedir" | "mejorar" | "masivos" | "todos";
const FILTROS: { v: Ver; label: string }[] = [
  { v: "pedir", label: "Para pedir" },
  { v: "mejorar", label: "Por mejorar" },
  { v: "masivos", label: "Compra masiva" },
  { v: "todos", label: "Todos" },
];

const dias = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} d`);

/**
 * «Punto de reorden»: when each item should be ordered. PAR = consumo diario ×
 * (días de entrega + días de seguridad). The assistant recomputes it every
 * night; for now it only calculates and warns — orders are still placed by
 * the owner (Pedidos).
 */
export default async function ReordenPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const orgId = profile.organization_id;
  let filas = await parPanel(supabase, orgId);
  if (!filas.length) {
    await calcularParOrg(supabase, orgId, todayInTz(sede?.tz ?? "America/Bogota"));
    filas = await parPanel(supabase, orgId);
  }
  const ver: Ver = sp.ver === "masivos" || sp.ver === "todos" || sp.ver === "mejorar" ? sp.ver : "pedir";
  const conConsumo = filas.filter((f) => f.consumoDiario > 0);
  const pedir = conConsumo.filter((f) => f.pedir);
  const masivos = filas.filter((f) => f.masivo);
  const sinProveedor = conConsumo.filter((f) => f.sinProveedor).length;
  const confiables = conConsumo.filter((f) => f.confiabilidad === "alta").length;
  const mejorar = conConsumo.filter((f) => f.confiabilidad !== "alta");
  const lista = (ver === "pedir" ? pedir : ver === "mejorar" ? mejorar : ver === "masivos" ? masivos : filas).sort(
    (a, b) => Number(b.pedir) - Number(a.pedir) || (a.coberturaDias ?? 9e9) - (b.coberturaDias ?? 9e9) || a.name.localeCompare(b.name, "es"),
  );
  const conteo: Record<Ver, number> = { pedir: pedir.length, mejorar: mejorar.length, masivos: masivos.length, todos: filas.length };
  const actualizado = filas[0]?.updatedAt;

  return (
    <div>
      <PageHeader
        back="/inventario"
        title="Punto de reorden"
        sub="Cuándo pedir cada insumo: consumo diario × (días de entrega + días de seguridad). El control de inventario lo recalcula cada noche; por ahora solo avisa."
        actions={<Recalcular />}
      />
      <div className="px-4 sm:px-7 pb-10 flex flex-col gap-5" style={{ maxWidth: 1200 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <div style={card}>
            <div style={kicker}>Para pedir</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: pedir.length ? "var(--red)" : "var(--text)" }}>{pedir.length}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>en o bajo su punto de reorden</div>
          </div>
          <div style={card}>
            <div style={kicker}>Compra masiva</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{masivos.length}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>el lote alcanza {MASIVO_DIAS}+ días</div>
          </div>
          <div style={card}>
            <div style={kicker}>PAR confiable</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: confiables === conConsumo.length ? "var(--ok)" : "var(--text)" }}>
              {confiables} <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 600 }}>de {conConsumo.length}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>insumos con consumo, listos para automatizar la compra</div>
          </div>
          <div style={card}>
            <div style={kicker}>Sin proveedor</div>
            <div className="cmd-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: sinProveedor ? "var(--amber)" : "var(--text)" }}>{sinProveedor}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>se asume 1 día de entrega</div>
          </div>
        </div>

        <nav aria-label="Filtro" className="flex flex-wrap" style={{ gap: 4, padding: 4, borderRadius: 12, background: "var(--surface-2)", alignSelf: "flex-start" }}>
          {FILTROS.map((f) => (
            <Link
              key={f.v}
              href={`/inventario/reorden?ver=${f.v}`}
              aria-current={ver === f.v ? "page" : undefined}
              style={{ padding: "8px 14px", borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: "none", color: ver === f.v ? "var(--text)" : "var(--muted)", background: ver === f.v ? "var(--surface)" : "transparent", boxShadow: ver === f.v ? "var(--shadow-1)" : "none" }}
            >
              {f.label} · {conteo[f.v]}
            </Link>
          ))}
        </nav>

        <section style={{ ...card, padding: "16px 6px 6px" }}>
          {lista.length === 0 ? (
            <p style={{ margin: "0 10px 12px", color: "var(--muted)", fontSize: 14 }}>
              {ver === "pedir" ? "Nada está en su punto de reorden. Bien." : ver === "mejorar" ? "Todos los PAR son confiables." : "No hay insumos en esta vista."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={th}>Insumo</th>
                    <th style={{ ...th, textAlign: "right" }}>Consumo / día</th>
                    <th style={{ ...th, textAlign: "right" }}>Entrega</th>
                    <th style={{ ...th, textAlign: "right" }}>Seguridad</th>
                    <th style={{ ...th, textAlign: "right" }}>Punto de reorden</th>
                    <th style={{ ...th, textAlign: "right" }}>Stock</th>
                    <th style={{ ...th, textAlign: "right" }}>Alcanza</th>
                    <th style={{ ...th, textAlign: "right" }}>Lote</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Confiabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f) => (
                    <Fila key={f.ingredienteId} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
          Confiabilidad: Alta si el stock se verificó hace poco y no está en negativo, el insumo tiene proveedor (lead time real), hay 14 días o más de ventas y no tiene un conteo esperando revisión. Si falla una cosa es Media; si fallan dos o más, Baja. Consumo: ventas y mermas de los últimos 28 días, por día con ventas. Seguridad: {SEGURIDAD_NORMAL} días ({SEGURIDAD_MASIVO} en compra masiva); se cambia en la ficha del insumo. Lote: lo que se suele comprar de una vez (compras de los últimos 6 meses) o la presentación. Compra masiva: el lote alcanza {MASIVO_DIAS} días o más; se cuenta una vez por semana por cajas cerradas y se sugiere el lote completo. Entrega: días del proveedor en Proveedores.
          {actualizado ? ` Calculado ${actualizado.slice(0, 10)}.` : ""}
        </p>
      </div>
    </div>
  );
}

const CONF: Record<ParPanelFila["confiabilidad"], { label: string; style: React.CSSProperties }> = {
  alta: { label: "Alta", style: pill("var(--ok-soft)", "var(--ok)") },
  media: { label: "Media", style: pill("var(--brand-soft)", "var(--text)") },
  baja: { label: "Baja", style: pill("var(--late-soft)", "var(--late)") },
  sin_datos: { label: "Sin datos", style: pill("var(--surface-2)", "var(--muted)") },
};

function Fila({ f }: { f: ParPanelFila }) {
  const q = (n: number) => cantidad(n, { unit: f.unit, pieza: f.pieza, packLabel: f.packLabel });
  const sinConsumo = f.consumoDiario <= 0;
  return (
    <tr style={{ background: f.pedir ? "var(--late-soft)" : undefined }}>
      <td style={td}>
        <Link href={`/inventario/kardex/${f.ingredienteId}`} style={{ fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>
          {f.name}
        </Link>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          {[f.ubicacion, f.proveedor ?? "sin proveedor"].filter(Boolean).join(" · ")}
          {f.masivo ? <span style={{ ...pill("var(--brand-soft)", "var(--text)"), marginLeft: 6, fontSize: 11 }}>Compra masiva</span> : null}
        </div>
      </td>
      <td className="cmd-num" style={{ ...td, textAlign: "right" }}>{sinConsumo ? "—" : q(f.consumoDiario)}</td>
      <td className="cmd-num" style={{ ...td, textAlign: "right", color: f.sinProveedor ? "var(--muted)" : undefined }}>{dias(f.entregaDias)}</td>
      <td className="cmd-num" style={{ ...td, textAlign: "right" }}>
        {dias(f.seguridadDias)}
        {f.seguridadManual ? <div style={{ fontSize: 11, color: "var(--muted)" }}>fijado</div> : null}
      </td>
      <td className="cmd-num" style={{ ...td, textAlign: "right", fontWeight: 700 }}>{sinConsumo ? "—" : q(f.puntoReorden)}</td>
      <td className="cmd-num" style={{ ...td, textAlign: "right", color: f.stock < 0 ? "var(--red)" : undefined }}>{q(f.stock)}</td>
      <td className="cmd-num" style={{ ...td, textAlign: "right" }}>{dias(f.coberturaDias)}</td>
      <td className="cmd-num" style={{ ...td, textAlign: "right" }}>
        {f.lote != null ? q(f.lote) : "—"}
        {f.loteOrigen ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{f.loteOrigen === "compras" ? "según compras" : "presentación"}</div> : null}
      </td>
      <td style={td}>
        {sinConsumo ? (
          <span style={pill("var(--surface-2)", "var(--muted)")}>Sin consumo</span>
        ) : f.pedir ? (
          <>
            <span style={pill("var(--late-soft)", "var(--late)")}>Pedir</span>
            {f.cantidadSugerida ? <div className="cmd-num" style={{ fontSize: 12.5, marginTop: 4 }}>Sugerido: <b>{q(f.cantidadSugerida)}</b></div> : null}
          </>
        ) : (
          <span style={pill("var(--ok-soft)", "var(--ok)")}>Bien</span>
        )}
      </td>
      <td style={{ ...td, minWidth: 190 }}>
        <span style={CONF[f.confiabilidad].style}>{CONF[f.confiabilidad].label}</span>
        {f.faltan.length && f.confiabilidad !== "alta" ? (
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
            {f.faltan.map((x) => (
              <li key={x}>· {x}</li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  );
}
