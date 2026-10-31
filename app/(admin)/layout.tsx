import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { AVANZADO_ITEMS, DUENO_TABS, MAS_ITEMS, MAS_MATCH } from "@/lib/nav/items";
import { AppShell } from "@/components/ui/app-shell";
import { contarPorRevisarInventario, withBadges } from "@/lib/nav/badges";

/**
 * Owner panel frame: AppShell `dueno` — bottom tabs on phone/tablet, a rail
 * on a real desktop (docs/redesign/PLAN.md §2.3). Pages render inside the
 * shell's scrolling <main>.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireAdmin gates auth + admin role; getActiveSede runs alongside to
  // name the sede in the header / rail; the Inventario tab carries the
  // «Por revisar» count (negatives + counts to approve).
  const [{ profile, supabase }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);
  const porRevisar = await contarPorRevisarInventario(supabase, profile.organization_id);

  return (
    <AppShell
      variant="dueno"
      nav={withBadges(DUENO_TABS, { inventario: porRevisar })}
      extraMatch={{ mas: MAS_MATCH }}
      moreItems={MAS_ITEMS}
      advancedItems={AVANZADO_ITEMS}
      profile={{ name: profile.full_name || "Dueño", role: profile.role }}
      sedeName={sede?.name ?? undefined}
      actions={{ signOut }}
    >
      {children}
    </AppShell>
  );
}
