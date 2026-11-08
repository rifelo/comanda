import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import type { ItemCalificado } from "@/lib/calificaciones/calificaciones";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";
import { Card, EmptyState, LinkCard, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes · Comanda" };

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
 * Clientes → Reseñas (ex /calificaciones): what customers answered behind
 * the QR on their cup — the average, how the stars spread and each rating
 * with its suggestion. Points live on /clientes/puntos, baristas on
 * /clientes/baristas. Read-only: a rating is the customer's.
 */
export default async function ClientesPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const orgId = profile.organization_id;
  const { hace7, hace30 } = ventanas();
  const [{ data: rows }, { count: impresas }, { count: conPuntos }] = await Promise.all([
    supabase
      .from("calificaciones")
      .select("id, usada_at, estrellas, sugerencia, customer_name, puntos, items, orden:ordenes(folio), cliente:clientes(instagram)")
      .eq("organization_id", orgId)
      .not("usada_at", "is", null)
      .not("estrellas", "is", null) // «solo sumar mis puntos» answers have no review
      .gte("usada_at", hace30)
      .order("usada_at", { ascending: false })
      .limit(300),
    supabase.from("calificaciones").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", hace30),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gt("puntos", 0),
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
  const conSugerencia = filas.filter((f) => f.sugerencia).length;

  return (
    <div className="mx-auto w-full max-w-[980px] pb-12">
      <PageHeader title="Reseñas" sub="Lo que responden los clientes con el QR del vaso" />
      <div className="px-4 sm:px-7 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_2fr]">
          <Kpi k="Promedio · 7 días" v={prom(r7.prom)} sub={`${r7.n} ${r7.n === 1 ? "reseña" : "reseñas"}`} />
          <Kpi k="Promedio · 30 días" v={prom(r30.prom)} sub={`${r30.n} de ${impresas ?? 0} QR impresos`} />
          <Card tight className="col-span-2 lg:col-span-1" aria-label="Estrellas, últimos 30 días">
            <span className="ui-label">Últimos 30 días</span>
            <div className="flex flex-col gap-1.5">
              {porEstrella.map((x) => (
                <div key={x.e} className="flex items-center gap-2.5 text-[15px]">
                  <span className="ui-num w-7">{x.e}★</span>
                  <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <span className={cn("block h-full rounded-full", x.e <= 2 ? "bg-late" : "bg-strong opacity-70")} style={{ width: `${(x.n / max) * 100}%` }} />
                  </span>
                  <span className="ui-num w-8 text-right">{x.n}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <LinkCard
          href="/clientes/puntos"
          title={`Clientes con puntos · ${conPuntos ?? 0}`}
          sub="Quién junta puntos con su @ de Instagram"
        />

        <section aria-labelledby="recientes" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="recientes" className="ui-h2 m-0">
              Recientes · {filas.length}
            </h2>
            {conSugerencia ? <span className="ui-sub">{conSugerencia} con comentario</span> : null}
          </div>
          {filas.length === 0 ? (
            <EmptyState
              title="Todavía no hay reseñas"
              text="Cada pedido con una bebida preparada imprime una etiqueta «Califícanos» con su propio QR; lo que respondan los clientes aparece aquí."
            />
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {filas.map((f) => {
                const mala = f.estrellas <= 2;
                return (
                  <li key={f.id} className={cn("rounded-card border px-4 py-3", mala ? "bg-late-soft border-transparent" : "bg-surface border-line")}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span aria-label={`${f.estrellas} de 5 estrellas`} className={cn("text-[17px] tracking-[1px]", mala ? "text-late" : "text-text")}>
                        {estrellas(f.estrellas)}
                      </span>
                      <span className="text-[15px] font-semibold min-w-0">
                        {f.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.name}${i.opciones.length ? ` (${i.opciones.join(", ").toLowerCase()})` : ""}`).join(" · ") ||
                          "Pedido"}
                      </span>
                      <span className="ui-sub text-[13px] sm:ml-auto">
                        {fechaCorta(todayInTz(tz, new Date(f.usada_at)))} {formatTime(f.usada_at, tz)}
                        {f.folio ? ` · ${f.folio}` : ""}
                        {f.customer_name ? ` · ${f.customer_name}` : ""}
                      </span>
                    </div>
                    {f.sugerencia ? <p className="m-0 mt-1.5 text-[15px] leading-snug">«{f.sugerencia}»</p> : null}
                    {f.instagram ? (
                      <p className="m-0 mt-1 ui-sub text-[13px]">
                        @{f.instagram} · +{f.puntos} {f.puntos === 1 ? "punto" : "puntos"}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <Card tight>
      <span className="ui-label">{k}</span>
      <span className="ui-num font-bold text-[34px] leading-none">
        {v}
        <span className="text-[17px]"> ★</span>
      </span>
      <span className="ui-sub text-[13px]">{sub}</span>
    </Card>
  );
}
