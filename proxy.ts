import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** The café's own domain serves only the customers' menu (app/menu). */
const MENU_HOSTS = new Set(["cafepayo.com", "www.cafepayo.com"]);

// Next 16 renamed `middleware` -> `proxy`. The hook function name must be `proxy`
// for the framework to pick it up.
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (MENU_HOSTS.has(host)) {
    // No session on this domain: "/" is the menu, and nothing else of the app
    // (panel, POS, login) answers here — any other page goes back to it.
    const path = request.nextUrl.pathname;
    if (path === "/" || path === "/menu") {
      const url = request.nextUrl.clone();
      url.pathname = "/menu";
      return path === "/" ? NextResponse.rewrite(url) : NextResponse.next();
    }
    if (path.startsWith("/menu/") || path.startsWith("/_next")) return NextResponse.next();
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return await updateSession(request);
}

export const config = {
  // Skip proxy for static files and Next internals. `.webmanifest` covers the
  // POS app manifest (app/pos/manifest.ts) — a manifest fetch must never hit
  // the auth round-trip or a login redirect.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.webmanifest$).*)",
  ],
};
