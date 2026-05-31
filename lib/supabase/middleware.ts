import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseHost, rootUrl, tenantUrl } from "@/lib/tenant";
import { withCookieDomain } from "./cookie-domain";

/**
 * Middleware-side Supabase session refresh + multi-tenant host routing.
 *
 * Runs on every request (see proxy.ts). Responsibilities:
 *   1. Refresh the auth token cookie (scoped to the apex domain so the session
 *      is shared across `<slug>.<root>` subdomains).
 *   2. Resolve the request Host → tenant, and inject `x-tenant-slug` /
 *      `x-tenant-org` request headers so Server Components/Actions can read the
 *      active tenant (see lib/tenant.ts `tenantFromHeaders`).
 *   3. Gate: unauth → /login; wrong-tenant subdomain → the user's own home;
 *      not-onboarded admin → /onboarding; staff → staff routes only.
 */

// slug -> orgId cache. Slugs are immutable once claimed, so positive results
// are safe to memoize across invocations on a warm instance. Negatives are NOT
// cached, so a freshly-registered slug resolves on its first request.
const slugOrgCache = new Map<string, string>();

export async function updateSession(request: NextRequest) {
  const host = parseHost(request.headers.get("host"));

  // Downstream request headers: strip any spoofed tenant headers up front; the
  // genuine ones are injected after we resolve the slug below.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-tenant-slug");
  requestHeaders.delete("x-tenant-org");

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, withCookieDomain(options)),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the auth token if expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate baseline. Public paths: /login, /auth/* (OAuth callback),
  // /api/cron/*, static assets.
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/_next") ||
    path.startsWith("/icons") ||
    path === "/manifest.json" ||
    path === "/favicon.ico";

  // Prefetch requests never render, so they must never trigger an enforcement
  // redirect (it would poison the router cache for the real navigation).
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch");

  // ── Tenant host: resolve <slug> → org id, inject tenant headers ──
  let tenantOrgId: string | null = null;
  if (host.kind === "tenant") {
    tenantOrgId = slugOrgCache.get(host.slug) ?? null;
    if (!tenantOrgId) {
      const { data } = await supabase.rpc("org_id_for_slug", {
        p_slug: host.slug,
      });
      tenantOrgId = (data as string | null) ?? null;
      if (tenantOrgId) slugOrgCache.set(host.slug, tenantOrgId);
    }
    if (!tenantOrgId) {
      // Unknown subdomain → apex (don't reveal whether it exists).
      if (isPrefetch) return response;
      return NextResponse.redirect(rootUrl("/"));
    }
    requestHeaders.set("x-tenant-slug", host.slug);
    requestHeaders.set("x-tenant-org", tenantOrgId);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Auth gate: unauth on a private route → /login (same host) ──
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // ── Authed enforcement (never on prefetch / public routes) ──
  if (user && !isPublic && !isPrefetch) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, organization_id, org:organizations!inner(slug)")
      .eq("id", user.id)
      .single<{
        role: string;
        organization_id: string;
        org: { slug: string | null } | null;
      }>();

    // No profile row yet → let requireUser() sign them out (avoid a loop).
    if (prof) {
      const userSlug = prof.org?.slug ?? null;

      if (host.kind === "tenant") {
        // Wrong tenant → send the user to their own home.
        if (prof.organization_id !== tenantOrgId) {
          return NextResponse.redirect(
            userSlug ? tenantUrl(userSlug, "/") : rootUrl("/onboarding"),
          );
        }
        // Correct tenant: staff may only reach the staff routes.
        if (prof.role === "staff" && !isStaffPath(path)) {
          const url = request.nextUrl.clone();
          url.pathname = "/today";
          url.search = "";
          return NextResponse.redirect(url);
        }
      } else {
        // Marketing / apex host.
        if (!userSlug) {
          // Only an admin can finish onboarding; staff in an un-onboarded org
          // (a pathological state) are left alone to avoid a redirect loop.
          if (prof.role === "admin" && path !== "/onboarding") {
            return NextResponse.redirect(rootUrl("/onboarding"));
          }
        } else {
          // Onboarded users have no app on the apex → their own subdomain.
          return NextResponse.redirect(tenantUrl(userSlug, "/"));
        }
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
    path === "/today" ||
    path.startsWith("/today/") ||
    path === "/shift" ||
    path.startsWith("/shift/")
  );
}
