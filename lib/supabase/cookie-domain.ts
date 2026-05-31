import { ROOT_HOST } from "@/lib/tenant";

/**
 * Auth-cookie domain so the Supabase session is shared across the apex and
 * every `<slug>.<root>` subdomain.
 *
 * - Prod (`co-manda.com`) → `.co-manda.com`
 * - Local `lvh.me` → `.lvh.me` (resolves `*.lvh.me` to 127.0.0.1, so the
 *   session is shared across subdomains in dev too)
 * - Plain `localhost` → undefined (browsers reject a leading-dot localhost
 *   cookie; use `lvh.me:3000` for multi-subdomain local testing)
 */
const COOKIE_DOMAIN =
  ROOT_HOST === "localhost" || ROOT_HOST.endsWith(".localhost")
    ? undefined
    : `.${ROOT_HOST}`;

/** Merge the shared cookie `domain` into a Supabase cookie-options object. */
export function withCookieDomain<T extends Record<string, unknown> | undefined>(
  options?: T,
): NonNullable<T> & { domain?: string } {
  const base = (options ?? {}) as NonNullable<T>;
  if (!COOKIE_DOMAIN) return base;
  return { ...base, domain: COOKIE_DOMAIN };
}
