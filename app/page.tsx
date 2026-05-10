import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Landing route — bounce to the right home depending on role.
 * Middleware already enforces an authenticated session here.
 */
export default async function Index() {
  const { profile } = await requireUser();
  if (profile.role === "admin") redirect("/dashboard");
  redirect("/today");
}
