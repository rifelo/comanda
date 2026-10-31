import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { Card, PageHeader } from "@/components/ui";
import { SedeForm } from "./_components/sede-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sede · Ajustes · Comanda" };

export default async function ConfigSedePage() {
  const [, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
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
    </div>
  );
}
