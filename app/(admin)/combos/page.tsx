import { requireAdmin } from "@/lib/auth";
import { getCombosView } from "@/lib/db/combos";
import { CombosClient } from "./combos-client";

export const metadata = { title: "Productos · Combos · co-manda" };
export const dynamic = "force-dynamic";

export default async function CombosPage() {
  const { profile } = await requireAdmin();
  const view = await getCombosView(profile.organization_id);
  return <CombosClient view={view} />;
}
