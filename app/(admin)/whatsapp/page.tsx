import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp · Comanda" };

type Estado = "sent" | "delivered" | "read" | "failed";
type Mensaje = {
  id: string;
  conversacion_id: string;
  autor: "cliente" | "agente" | "equipo";
  texto: string;
  created_at: string;
  estado: Estado | null;
  error: string | null;
};
type Conversacion = { id: string; wa_id: string; nombre: string | null; agente_pausado_hasta: string | null };

const DIAS = 7;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Bogotá is UTC−5 all year; formatted by hand so server and browser agree. */
function cuando(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

const ESTADO: Record<Estado | "pendiente", { label: string; color: string }> = {
  pendiente: { label: "Enviado, sin confirmar", color: "var(--muted)" },
  sent: { label: "Enviado ✓", color: "var(--muted)" },
  delivered: { label: "Entregado ✓✓", color: "var(--ok)" },
  read: { label: "Leído ✓✓", color: "var(--ok)" },
  failed: { label: "No se entregó", color: "var(--red)" },
};

/** The request's clock: now and the start of the window shown. */
function ventana() {
  const ahora = Date.now();
  return { ahora, desde: new Date(ahora - DIAS * 86400_000).toISOString() };
}

/**
 * The business WhatsApp as the agent sees it: the last week's conversations
 * and, for every reply we sent, whether WhatsApp delivered it — and Meta's
 * reason when it didn't (the logs don't keep it long enough).
 */
export default async function WhatsappPage() {
  const { profile, supabase } = await requireAdmin();
  const { desde, ahora } = ventana();
  const [{ data: msgs }, { data: convs }] = await Promise.all([
    supabase
      .from("whatsapp_mensajes")
      .select("id, conversacion_id, autor, texto, created_at, estado, error")
      .eq("organization_id", profile.organization_id)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(1000),
    supabase
      .from("whatsapp_conversaciones")
      .select("id, wa_id, nombre, agente_pausado_hasta")
      .eq("organization_id", profile.organization_id),
  ]);
  const mensajes = (msgs ?? []) as Mensaje[];
  const porConv = new Map<string, Mensaje[]>();
  for (const m of mensajes) porConv.set(m.conversacion_id, [...(porConv.get(m.conversacion_id) ?? []), m]);
  const conversaciones = ((convs ?? []) as Conversacion[])
    .filter((c) => porConv.has(c.id))
    .sort((a, b) => porConv.get(b.id)!.at(-1)!.created_at.localeCompare(porConv.get(a.id)!.at(-1)!.created_at));
  const enviados = mensajes.filter((m) => m.autor === "agente");
  const fallidos = enviados.filter((m) => m.estado === "failed");

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="WhatsApp" sub={`Conversaciones y entregas de los últimos ${DIAS} días`} back="/mas" />
      <div className="px-4 sm:px-7 pb-12">
        <div className="flex flex-wrap" style={{ gap: 12 }}>
          <Dato label="Conversaciones" valor={conversaciones.length} />
          <Dato label="Respuestas enviadas" valor={enviados.length} />
          <Dato label="No entregadas" valor={fallidos.length} alerta={fallidos.length > 0} />
        </div>

        {fallidos.length > 0 && (
          <div className="rounded-card border" style={{ marginTop: 20, padding: 16, borderColor: "var(--red)", background: "var(--surface)" }}>
            <div className="font-bold" style={{ color: "var(--red)", marginBottom: 6 }}>Último error de entrega</div>
            <div style={{ fontSize: 15, overflowWrap: "anywhere" }}>{fallidos.at(-1)!.error ?? "Sin detalle"}</div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{cuando(fallidos.at(-1)!.created_at)}</div>
          </div>
        )}

        {conversaciones.length === 0 ? (
          <p className="text-muted" style={{ marginTop: 28 }}>No hay conversaciones en los últimos {DIAS} días.</p>
        ) : (
          conversaciones.map((c) => {
            const pausa = c.agente_pausado_hasta && Date.parse(c.agente_pausado_hasta) > ahora ? c.agente_pausado_hasta : null;
            return (
              <section key={c.id} className="rounded-card border border-line bg-surface" style={{ marginTop: 20, padding: 16 }}>
                <header className="flex flex-wrap items-baseline" style={{ gap: 8, marginBottom: 10 }}>
                  <span className="font-bold" style={{ fontSize: 17 }}>{c.nombre ?? "Sin nombre"}</span>
                  <span className="text-muted cmd-num" style={{ fontSize: 14 }}>+{c.wa_id}</span>
                  {pausa ? (
                    <span style={{ fontSize: 13, color: "var(--late)" }}>· Agente en pausa hasta {cuando(pausa)}</span>
                  ) : null}
                </header>
                <ol className="m-0 p-0" style={{ listStyle: "none", display: "grid", gap: 8 }}>
                  {porConv.get(c.id)!.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-btn"
                      style={{
                        padding: "8px 12px",
                        maxWidth: "85%",
                        justifySelf: m.autor === "cliente" ? "start" : "end",
                        background: m.autor === "cliente" ? "var(--surface-2)" : "var(--brand-soft)",
                      }}
                    >
                      <div className="text-muted" style={{ fontSize: 12, marginBottom: 2 }}>
                        {m.autor === "cliente" ? "Cliente" : m.autor === "agente" ? "Agente" : "Equipo"} · {cuando(m.created_at)}
                      </div>
                      <div style={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.texto}</div>
                      {m.autor === "agente" ? (
                        <div style={{ fontSize: 12, marginTop: 4, color: ESTADO[m.estado ?? "pendiente"].color, fontWeight: 600 }}>
                          {ESTADO[m.estado ?? "pendiente"].label}
                          {m.error ? <span style={{ fontWeight: 400 }}> — {m.error}</span> : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor, alerta = false }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface" style={{ padding: "12px 16px", minWidth: 150 }}>
      <div className="text-muted" style={{ fontSize: 13 }}>{label}</div>
      <div className="cmd-num font-bold" style={{ fontSize: 24, color: alerta ? "var(--red)" : undefined }}>{valor}</div>
    </div>
  );
}
