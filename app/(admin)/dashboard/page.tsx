import { redirect } from "next/navigation";

/**
 * Legacy `/dashboard` URL — the single-sede redesign moved this surface to
 * `/hoy`. Keep the redirect so old bookmarks + the wordmark Link still work.
 */
export default function DashboardPage() {
  redirect("/hoy");
}
