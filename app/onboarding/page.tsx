import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { tenantUrl } from "@/lib/tenant";
import { Wordmark } from "@/components/comanda/primitives";
import { OnboardingForm } from "./_components/onboarding-form";

export const dynamic = "force-dynamic";

/**
 * Self-serve tenant onboarding (apex host). The `handle_new_user` trigger has
 * already created the admin's org (no slug, no restaurant); here they claim
 * their subdomain + create the first sede. Already-onboarded admins are sent
 * straight to their app.
 */
export default async function OnboardingPage() {
  const { profile, supabase } = await requireAdmin();

  const { data: org } = await supabase
    .from("organizations")
    .select("slug, name")
    .eq("id", profile.organization_id)
    .single<{ slug: string | null; name: string }>();

  if (org?.slug) redirect(tenantUrl(org.slug, "/"));

  return (
    <main className="cmd-paper flex min-h-screen flex-col px-6 pt-16 pb-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <Wordmark size={48} className="tracking-[-0.02em]" />
        <h1
          className="font-slab"
          style={{ fontSize: 26, marginTop: 18, lineHeight: 1.1 }}
        >
          Crea tu espacio
        </h1>
        <p
          className="text-muted"
          style={{ fontSize: 12, letterSpacing: "0.02em", marginTop: 6, lineHeight: 1.5 }}
        >
          Elige el subdominio donde vivirá tu restaurante y crea tu primera sede.
          Podrás invitar a tu equipo después.
        </p>

        <div className="mt-10">
          <OnboardingForm defaultRestaurantName={org?.name ?? ""} />
        </div>
      </div>
    </main>
  );
}
