import { requireAdmin } from "@/lib/auth";
import { getModificadores } from "@/lib/db/modificadores";
import { ModificadoresClient } from "./modificadores-client";

export const metadata = { title: "Productos · Modificadores · co-manda" };
export const dynamic = "force-dynamic";

export default async function ModificadoresPage() {
  const { profile } = await requireAdmin();
  const groups = await getModificadores(profile.organization_id);
  return <ModificadoresClient groups={groups} />;
}
