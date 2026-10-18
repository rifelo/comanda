import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { bogotaDay, bogotaTime, dayLabel } from "@/lib/pos/pending";
import { posMoney } from "@/lib/pos/types";
import { MOTIVO_MERMA, resumenMermas } from "@/lib/inventario/mermas";
import { inicioDia, listMermas } from "@/lib/inventario/mermas-db";
import { TurnosHeader } from "../../_components/turnos-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Mermas · co-manda" };

const PERIODOS = [
  { dias: 1, label: "Hoy" },
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
] as const;

const kicker: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 0", borderBottom: "1px solid var(--ink)", marginBottom: 6 };
const card: React.CSSProperties = { border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--paper-lt)", padding: "14px 16px" };

/**
 * Mermas for the owner: what the team registered as lost (drinks that fell,
 * cakes that went bad, expired milk), what it cost, by reason and by person,
 * and every line with its justification. Read-only — the stock already went
 * down when it was registered on the tablet.
 */
export default async function MermasPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const [{ profile, supabase }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const dias = PERIODOS.find((p) => String(p.dias) === sp.dias)?.dias ?? 7;
  const today = bogotaDay();
  const rows = await listMermas(supabase, profile.organization_id, inicioDia(today, dias - 1));
  const r = resumenMermas(rows);

  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · INVENTARIO" title="Mermas">
        <Link href="/inventario" className="cmd-btn ghost sm" style={{ textDecoration: "none" }}>← Inventario</Link>
        <Link href="/turno/inventario/merma" className="cmd-btn sm" style={{ textDecoration: "none" }}>Registrar →</Link>
      </TurnosHeader>
      <div style={{ padding: "18px 24px 40px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 22, fontFamily: "var(--font-mono)" }}>
        {/* Plain links: a same-route router.push with only the query changed is a no-op in Next 16. */}
        <nav aria-label="Periodo" style={{ display: "flex", gap: 8 }}>
          {PERIODOS.map((p) => (
            <a key={p.dias} href={`/inventario/mermas?dias=${p.dias}`} aria-current={p.dias === dias ? "page" : undefined} className={p.dias === dias ? "cmd-btn sm" : "cmd-btn ghost sm"} style={{ textDecoration: "none" }}>{p.label}</a>
          ))}
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={card}>
            <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Costo perdido</div>
            <div className="cmd-num font-slab" style={{ fontSize: 30, marginTop: 4, color: r.costo ? "var(--red)" : "var(--ink)" }}>{posMoney(r.costo)}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>{r.n} {r.n === 1 ? "merma" : "mermas"} · {PERIODOS.find((p) => p.dias === dias)?.label.toLowerCase()}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Por motivo</div>
            {r.porMotivo.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>—</div>}
            {r.porMotivo.map((m) => (
              <div key={m.motivo} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
                <span>{MOTIVO_MERMA[m.motivo].label} <span style={{ color: "var(--muted)" }}>· {m.n}</span></span>
                <span className="cmd-num" style={{ fontWeight: 700 }}>{posMoney(m.costo)}</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Por persona</div>
            {r.porPersona.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>—</div>}
            {r.porPersona.map((p) => (
              <div key={p.quien} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
                <span>{p.quien} <span style={{ color: "var(--muted)" }}>· {p.n}</span></span>
                <span className="cmd-num" style={{ fontWeight: 700 }}>{posMoney(p.costo)}</span>
              </div>
            ))}
          </div>
        </div>

        <section aria-label="Detalle">
          <div style={kicker}>Detalle · {rows.length}</div>
          {rows.length === 0 && <div style={{ padding: "14px 0", fontSize: 13, color: "var(--muted)" }}>No se registraron mermas en este periodo.</div>}
          {rows.map((m) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 140px) 1fr auto", gap: 14, alignItems: "baseline", padding: "10px 0", borderBottom: "1px dashed var(--rule)", fontSize: 13 }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{dayLabel(bogotaDay(Date.parse(m.reportedAt)), today)}<br /><span className="cmd-num">{bogotaTime(m.reportedAt)}</span> · {m.reportedBy ?? "—"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{String(m.qty).replace(".", ",")} {m.kind === "producto" ? "×" : m.unidad} {m.nombre}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--red)", border: "1px solid var(--red)", borderRadius: 3, padding: "1px 6px", marginLeft: 8 }}>{MOTIVO_MERMA[m.motivo].label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-2)", marginTop: 3 }}>«{m.justificacion}»</span>
              </span>
              <span className="cmd-num" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{posMoney(m.costo)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
