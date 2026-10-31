import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { getActiveSede } from "@/lib/data/sede";
import { AVANZADO_ITEMS, DUENO_TABS, MAS_ITEMS, MAS_MATCH } from "@/lib/nav/items";
import { AppShell } from "@/components/ui/app-shell";

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
  // name the sede in the header / rail.
  const [{ profile }, sede] = await Promise.all([requireAdmin(), getActiveSede()]);

  return (
    <AppShell
      variant="dueno"
      nav={DUENO_TABS}
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
