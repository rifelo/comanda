// Pure tenant / host helpers — safe to import from edge middleware, server
// components, and client components (no next/headers, no node APIs).
//
// Tenant = organization. Each onboarded org claims a `slug` and is served at
// `<slug>.<root-domain>`. The root domain is configurable so the same code
// runs on `co-manda.com` in prod and `lvh.me:3000` (or `*.localhost`) in dev.

/** Root domain incl. port in dev, e.g. "co-manda.com" or "lvh.me:3000". */
export const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

/** Bare host without port, e.g. "co-manda.com" / "lvh.me" / "localhost". */
export const ROOT_HOST = ROOT_DOMAIN.split(":")[0];

const IS_LOCAL =
  ROOT_HOST === "localhost" || ROOT_HOST.endsWith(".localhost");
const PROTO = IS_LOCAL || ROOT_DOMAIN.includes(":") ? "http" : "https";

/** A tenant slug: 3–32 chars, lowercase alphanumerics + internal hyphens.
 *  MUST stay in sync with the SQL CHECK in 0010_tenancy.sql. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s);
}

/** Subdomains that can never be a tenant (marketing / infra surfaces). */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "static",
  "assets",
  "auth",
  "login",
  "onboarding",
  "mail",
  "co-manda",
]);

export type HostKind =
  | { kind: "marketing" }
  | { kind: "tenant"; slug: string };

/** Map a request Host header to a marketing (apex/reserved) or tenant context. */
export function parseHost(host: string | null | undefined): HostKind {
  if (!host) return { kind: "marketing" };
  const h = host.toLowerCase().split(",")[0].trim();
  const root = ROOT_DOMAIN.toLowerCase();

  if (h === root || h === `www.${root}`) return { kind: "marketing" };
  if (h.endsWith(`.${root}`)) {
    const sub = h.slice(0, h.length - root.length - 1);
    // Only single-label, non-reserved subdomains are tenants.
    if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: "marketing" };
    }
    return { kind: "tenant", slug: sub };
  }
  // Vercel preview (*.vercel.app) or any unrecognized host → marketing.
  return { kind: "marketing" };
}

function withSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** Absolute URL on the apex/marketing host. */
export function rootUrl(path = "/"): string {
  return `${PROTO}://${ROOT_DOMAIN}${withSlash(path)}`;
}

/** Absolute URL on a tenant subdomain. */
export function tenantUrl(slug: string, path = "/"): string {
  return `${PROTO}://${slug}.${ROOT_DOMAIN}${withSlash(path)}`;
}

/**
 * Read the tenant context that middleware injected as request headers. Pass a
 * Headers-like object (e.g. `await headers()` in a Server Component, or
 * `request.headers` in a route handler).
 */
export function tenantFromHeaders(h: {
  get(name: string): string | null;
}): { slug: string; orgId: string } | null {
  const slug = h.get("x-tenant-slug");
  const orgId = h.get("x-tenant-org");
  if (!slug || !orgId) return null;
  return { slug, orgId };
}
