import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { Card, PageHeader } from "@/components/ui";
import { SedeForm } from "./_components/sede-form";
import { ReciboForm } from "./_components/recibo-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sede · Ajustes · Comanda" };

export default async function ConfigSedePage() {
  const [{ supabase, profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const { data: org } = await supabase
    .from("organizations")
    .select("recibo_nombre, recibo_encabezado, recibo_pie, transferencia_llave, transferencia_titular, datafono_liquidacion, meta_diaria_cop, aprobaciones_whatsapp")
    .eq("id", profile.organization_id)
    .maybeSingle();
  const o = (org ?? {}) as Record<string, string | number | null | undefined>;
  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <PageHeader title="Sede" back="/ajustes" />
      <Card className="mx-4 sm:mx-7">
        <SedeForm
          initial={{
            name: sede?.name ?? "",
            logo_url: sede?.logo_url ?? null,
            timezone: sede?.tz ?? "America/Bogota",
            currency: sede?.currency ?? "COP",
          }}
        />
      </Card>
      <h2 className="ui-label mx-4 sm:mx-7 mt-8 mb-3">Recibo, cobros y meta</h2>
      <Card className="mx-4 sm:mx-7">
        <ReciboForm
          initial={{
            recibo_nombre: String(o.recibo_nombre ?? ""),
            recibo_encabezado: String(o.recibo_encabezado ?? ""),
            recibo_pie: String(o.recibo_pie ?? ""),
            transferencia_llave: String(o.transferencia_llave ?? ""),
            transferencia_titular: String(o.transferencia_titular ?? ""),
            datafono_liquidacion: String(o.datafono_liquidacion ?? ""),
            meta_diaria: o.meta_diaria_cop ? String(o.meta_diaria_cop) : "",
            aprobaciones_whatsapp: (o.aprobaciones_whatsapp as string | null) ?? "",
          }}
        />
      </Card>
    </div>
  );
}
