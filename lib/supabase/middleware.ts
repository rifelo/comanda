import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware-side Supabase session refresh.
 *
 * Runs on every request (see middleware.ts) so the auth token cookie stays
 * fresh, and so server-rendered pages read a valid session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the auth token if expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate: anyone hitting an app route without a session bounces to /login.
  // Public paths: /login, /auth/* (OAuth callback), /api/cron/*, static assets.
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/_next") ||
    path.startsWith("/icons") ||
    path === "/manifest.json" ||
    path === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Role gate: staff may only reach the staff routes (`/today`, `/shift`).
  // Every other authenticated app route is admin-only, so a staff user who
  // lands on one is bounced to `/today`. The role-aware `/` landing page and
  // the `requireAdmin` layout guard still apply — this just makes the
  // boundary explicit and central, and turns the old `/ → /today` double
  // bounce into a single redirect.
  if (user && !isPublic && !isStaffPath(path)) {
    // Skip the lookup on prefetch requests — they never render, and the real
    // navigation (plus the layout guard) still enforces the boundary.
    const isPrefetch =
      request.headers.get("next-router-prefetch") === "1" ||
      (request.headers.get("sec-purpose") ?? "").includes("prefetch");
    if (!isPrefetch) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      if (profile?.role === "staff") {
        const url = request.nextUrl.clone();
        url.pathname = "/today";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

/**
 * The routes a staff member is allowed to reach. `/` is included because it's
 * the role-aware landing page that immediately bounces them to `/today`.
 */
function isStaffPath(path: string): boolean {
  return (
    path === "/" ||
    // The org selector must be reachable by any authenticated user. A no-org
    // user defaults to role 'staff', which would otherwise bounce them off the
    // selector and loop /organizaciones → /today → …
    path === "/organizaciones" ||
    path === "/today" ||
    path.startsWith("/today/") ||
    path === "/shift" ||
    path.startsWith("/shift/")
  );
}
