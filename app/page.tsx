import { redirect } from "next/navigation";
import { landingFor, requireUser } from "@/lib/auth";
import { getPosDeviceFromCookie } from "@/lib/pos/devices";

/**
 * Landing route (and the PWA's start_url / Google's callback). The proxy
 * already enforces a session here. A paired device always opens the shift
 * app — the owner too; otherwise the owner gets the panel and the team the
 * shift app (`landingFor`).
 */
export default async function Index() {
  const [{ profile }, device] = await Promise.all([requireUser(), getPosDeviceFromCookie()]);
  redirect(landingFor(profile.role === "admin" ? "admin" : "staff", !!device));
}
