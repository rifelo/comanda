import { Palette, Store, TabletSmartphone } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { LinkCard, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes · Comanda" };

/** Ajustes (ex /configuracion): Sede, Apariencia and Dispositivos. */
export default async function AjustesPage() {
  const [{ supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const { count } = await supabase.from("pos_devices").select("id", { count: "exact", head: true }).is("revoked_at", null);
  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <PageHeader title="Ajustes" back="/mas" />
      <div className="px-4 sm:px-7 flex flex-col gap-2.5">
        <LinkCard href="/ajustes/sede" title="Sede" sub={sede ? `${sede.name} · nombre, logo, zona horaria` : "Nombre, logo, zona horaria"} icon={<Store size={22} aria-hidden />} />
        <LinkCard href="/ajustes/apariencia" title="Apariencia" sub="Claro, oscuro o automático" icon={<Palette size={22} aria-hidden />} />
        <LinkCard
          href="/ajustes/dispositivos"
          title="Dispositivos"
          sub={`${count ?? 0} ${count === 1 ? "dispositivo emparejado" : "dispositivos emparejados"} · tablet y caja`}
          icon={<TabletSmartphone size={22} aria-hidden />}
        />
      </div>
    </div>
  );
}
