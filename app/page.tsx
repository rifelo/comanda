import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Landing route — bounce to the right home depending on role. Middleware
 * enforces auth + host routing before this runs; the onboarding gate here is a
 * defensive backstop (an admin whose org hasn't claimed a slug yet).
 */
export default async function Index() {
  const { profile, supabase } = await requireUser();
  if (profile.role === "admin") {
    const { data: org } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", profile.organization_id)
      .single<{ slug: string | null }>();
    if (!org?.slug) redirect("/onboarding");
    redirect("/hoy");
  }
  redirect("/today");
}
