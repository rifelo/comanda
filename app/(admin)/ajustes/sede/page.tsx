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
    .select("recibo_encabezado, recibo_pie, transferencia_llave, transferencia_titular, datafono_liquidacion")
    .eq("id", profile.organization_id)
    .maybeSingle();
  const o = (org ?? {}) as Record<string, string | null | undefined>;
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
      <h2 className="ui-label mx-4 sm:mx-7 mt-8 mb-3">Recibo y cobros</h2>
      <Card className="mx-4 sm:mx-7">
        <ReciboForm
          initial={{
            recibo_encabezado: o.recibo_encabezado ?? "",
            recibo_pie: o.recibo_pie ?? "",
            transferencia_llave: o.transferencia_llave ?? "",
            transferencia_titular: o.transferencia_titular ?? "",
            datafono_liquidacion: o.datafono_liquidacion ?? "",
          }}
        />
      </Card>
    </div>
  );
}
