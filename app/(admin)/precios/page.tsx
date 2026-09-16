import { requireAdmin } from "@/lib/auth";
import { getPreciosView } from "@/lib/db/precios";
import { PreciosClient } from "./precios-client";

export const metadata = { title: "Operación · Precios · co-manda" };
export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const { profile } = await requireAdmin();
  const view = await getPreciosView(profile.organization_id);
  return <PreciosClient view={view} />;
}
