import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import type { ItemCalificado } from "@/lib/calificaciones/calificaciones";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { TurnosHeader } from "../_components/turnos-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operación · Calificaciones · co-manda" };

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };
const estrellas = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** The two windows the page reports on, from now: epoch ms and ISO. */
function ventanas(): { hace7: number; hace30: string } {
  const ahora = Date.now();
  return { hace7: ahora - 7 * 86_400_000, hace30: new Date(ahora - 30 * 86_400_000).toISOString() };
}

interface Fila {
  id: string;
  usada_at: string;
  estrellas: number;
  sugerencia: string | null;
  customer_name: string | null;
  puntos: number;
  items: ItemCalificado[];
  folio: string | null;
  instagram: string | null;
}

/**
 * What customers answered behind the QR on their cup: the average, how the
 * stars spread, each rating with its suggestion, and who is collecting
 * points. Read-only — a rating is the customer's, nobody edits it.
 */
export default async function CalificacionesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const orgId = profile.organization_id;
  const { hace7, hace30 } = ventanas();
  const [{ data: rows }, { data: clientes }, { count: impresas }] = await Promise.all([
    supabase
      .from("calificaciones")
      .select("id, usada_at, estrellas, sugerencia, customer_name, puntos, items, orden:ordenes(folio), cliente:clientes(instagram)")
      .eq("organization_id", orgId)
      .not("usada_at", "is", null)
      .gte("usada_at", hace30)
      .order("usada_at", { ascending: false })
      .limit(300),
    supabase.from("clientes").select("id, instagram, puntos, ultima_visita_at").eq("organization_id", orgId).order("puntos", { ascending: false }).limit(50),
    supabase.from("calificaciones").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", hace30),
  ]);
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const filas: Fila[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    usada_at: r.usada_at as string,
    estrellas: Number(r.estrellas),
    sugerencia: (r.sugerencia as string | null) ?? null,
    customer_name: (r.customer_name as string | null) ?? null,
    puntos: Number(r.puntos ?? 0),
    items: (r.items as ItemCalificado[] | null) ?? [],
    folio: uno(r.orden as unknown as { folio: string } | { folio: string }[] | null)?.folio ?? null,
    instagram: uno(r.cliente as unknown as { instagram: string } | { instagram: string }[] | null)?.instagram ?? null,
  }));
  const resumen = (fs: Fila[]) => ({ n: fs.length, prom: fs.length ? fs.reduce((s, f) => s + f.estrellas, 0) / fs.length : null });
  const r7 = resumen(filas.filter((f) => new Date(f.usada_at).getTime() >= hace7));
  const r30 = resumen(filas);
  const porEstrella = [5, 4, 3, 2, 1].map((e) => ({ e, n: filas.filter((f) => f.estrellas === e).length }));
  const max = Math.max(1, ...porEstrella.map((x) => x.n));
  const prom = (p: number | null) => (p === null ? "—" : p.toFixed(1).replace(".", ","));

  return (
    <div>
      <TurnosHeader kicker="OPERACIÓN · CLIENTES" title="Calificaciones" />
      <div style={{ padding: "20px 16px 48px", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }} className="md:px-8">
        <section aria-label="Resumen" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Kpi k="Promedio · 7 días" v={prom(r7.prom)} sub={`${r7.n} ${r7.n === 1 ? "calificación" : "calificaciones"}`} />
          <Kpi k="Promedio · 30 días" v={prom(r30.prom)} sub={`${r30.n} de ${impresas ?? 0} códigos impresos`} />
          <div style={{ flex: "2 1 260px", border: "1.5px solid var(--rule)", borderRadius: 6, background: "var(--paper-lt)", padding: "12px 14px" }}>
            <div style={label}>Últimos 30 días</div>
            {porEstrella.map((x) => (
              <div key={x.e} className="flex items-center" style={{ gap: 8, marginTop: 6, fontSize: 12 }}>
                <span className="cmd-num" style={{ width: 22 }}>{x.e}★</span>
                <span style={{ flex: 1, height: 8, background: "var(--rule-soft)", borderRadius: 4, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${(x.n / max) * 100}%`, background: x.e <= 2 ? "var(--red)" : "var(--ink)" }} />
                </span>
                <span className="cmd-num" style={{ width: 28, textAlign: "right" }}>{x.n}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Calificaciones recientes">
          <div style={label}>Recientes · {filas.length}</div>
          {filas.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Todavía no hay calificaciones. Cada pedido con una bebida preparada imprime una etiqueta «Califícanos» con su propio QR; lo que respondan los clientes aparece aquí.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {filas.map((f) => (
              <article key={f.id} style={{ border: `1.5px solid ${f.estrellas <= 2 ? "var(--red)" : "var(--rule)"}`, borderRadius: 6, background: "var(--paper-lt)", padding: "10px 14px" }}>
                <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span aria-label={`${f.estrellas} de 5 estrellas`} style={{ fontSize: 16, letterSpacing: 1, color: f.estrellas <= 2 ? "var(--red)" : "var(--ink)" }}>{estrellas(f.estrellas)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{f.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.name}${i.opciones.length ? ` (${i.opciones.join(", ").toLowerCase()})` : ""}`).join(" · ") || "Pedido"}</span>
                  <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>
                    {fechaCorta(todayInTz(tz, new Date(f.usada_at)))} {formatTime(f.usada_at, tz)}{f.folio ? ` · ${f.folio}` : ""}{f.customer_name ? ` · ${f.customer_name}` : ""}
                  </span>
                </div>
                {f.sugerencia && <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>«{f.sugerencia}»</p>}
                {f.instagram && <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>@{f.instagram} · +{f.puntos} {f.puntos === 1 ? "punto" : "puntos"}</div>}
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Clientes con puntos">
          <div style={label}>Clientes con puntos · {(clientes ?? []).length}</div>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "6px 0 4px" }}>Un punto por cada $1.000 de lo que pidió quien califica y deja su @. El usuario no se verifica: antes de canjear, confirma que la cuenta es de la persona.</p>
          {(clientes ?? []).map((c) => (
            <div key={c.id as string} className="flex items-center" style={{ gap: 10, padding: "8px 0", borderTop: "1px dashed var(--rule)", fontSize: 13 }}>
              <a href={`https://www.instagram.com/${c.instagram}`} target="_blank" rel="noreferrer" className="cmd-link" style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>@{c.instagram as string}</a>
              <span className="text-muted" style={{ fontSize: 11.5 }}>última vez {fechaCorta(todayInTz(tz, new Date(c.ultima_visita_at as string)))}</span>
              <span className="cmd-num" style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{Number(c.puntos)} pts</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div style={{ flex: "1 1 170px", border: "1.5px solid var(--ink)", borderRadius: 6, background: "var(--paper-lt)", padding: "12px 14px" }}>
      <div style={label}>{k}</div>
      <div className="cmd-num font-slab" style={{ fontSize: 34, lineHeight: 1.1, marginTop: 4 }}>{v}<span style={{ fontSize: 16 }}> ★</span></div>
      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
