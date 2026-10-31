import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { PESOS_POR_PUNTO } from "@/lib/calificaciones/calificaciones";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { Banner, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Puntos · Clientes · Comanda" };

/**
 * Clientes → Puntos: who is collecting points with their Instagram @ (one
 * point per $1.000 of what they ordered when they rate). Read-only.
 */
export default async function PuntosPage() {
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const tz = sede?.tz ?? "America/Bogota";
  const { data } = await supabase
    .from("clientes")
    .select("id, instagram, puntos, ultima_visita_at")
    .eq("organization_id", profile.organization_id)
    .order("puntos", { ascending: false })
    .limit(200);
  const clientes = (data ?? []).map((c) => ({
    id: c.id as string,
    instagram: c.instagram as string,
    puntos: Number(c.puntos ?? 0),
    ultima: (c.ultima_visita_at as string | null) ?? null,
  }));
  const total = clientes.reduce((s, c) => s + c.puntos, 0);

  return (
    <div className="mx-auto w-full max-w-[880px] pb-12">
      <PageHeader title="Puntos" back="/clientes" sub={`${clientes.length} clientes · ${total} puntos en total`} />
      <div className="px-4 sm:px-7 flex flex-col gap-4">
        <Banner tone="neutral">
          Un punto por cada {posMoney(PESOS_POR_PUNTO)} de lo que pidió quien califica y deja su @. El usuario no se verifica: antes de
          canjear, confirma que la cuenta es de la persona.
        </Banner>
        {clientes.length === 0 ? (
          <EmptyState title="Nadie junta puntos todavía" text="Aparecen cuando un cliente califica con el QR y deja su @." />
        ) : (
          <ol className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
            {clientes.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 min-h-16 px-4 sm:px-5 border-b border-line last:border-b-0">
                <span className="ui-num text-muted w-6 text-right text-[13px]">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <a
                    href={`https://www.instagram.com/${c.instagram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[16px] font-semibold text-text truncate"
                  >
                    @{c.instagram}
                  </a>
                  {c.ultima ? <span className="ui-sub block text-[13px]">última vez {fechaCorta(todayInTz(tz, new Date(c.ultima)))}</span> : null}
                </span>
                <span className="ui-num font-bold text-[17px] whitespace-nowrap">{c.puntos} pts</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
