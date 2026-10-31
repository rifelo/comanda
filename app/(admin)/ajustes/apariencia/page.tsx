import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Tema } from "./_components/tema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apariencia · Ajustes · Comanda" };

/**
 * Ajustes → Apariencia (ex /configuracion/preferencias): Claro / Oscuro /
 * Automático for this device (cookie `comanda-theme`, lib/theme.ts). The
 * five paper themes are gone; old values map to claro/oscuro.
 */
export default async function AparienciaPage() {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <PageHeader title="Apariencia" back="/ajustes" />
      <div className="px-4 sm:px-7">
        <Card>
          <div>
            <h2 className="ui-title m-0">Tema de la app</h2>
            <p className="ui-sub m-0 mt-1">
              Automático sigue el modo del teléfono o la tablet. Se guarda en este dispositivo; cada tablet o teléfono puede tener el suyo.
            </p>
          </div>
          <Tema />
        </Card>
      </div>
    </div>
  );
}
