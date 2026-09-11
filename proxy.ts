import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed `middleware` -> `proxy`. The hook function name must be `proxy`
// for the framework to pick it up.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Skip proxy for static files and Next internals. `.webmanifest` covers the
  // POS app manifest (app/pos/manifest.ts) — a manifest fetch must never hit
  // the auth round-trip or a login redirect.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.svg$|.*\\.png$|.*\\.webmanifest$).*)",
  ],
};
