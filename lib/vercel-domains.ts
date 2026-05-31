// Per-tenant subdomain provisioning on Vercel.
//
// The domain is registered through Cloudflare Registrar, so its nameservers are
// locked to Cloudflare and Vercel can't issue a `*.co-manda.com` wildcard cert
// (wildcards require DNS-01, i.e. nameserver control). Instead we add each
// tenant's `<slug>.co-manda.com` to the Vercel project at onboarding; Vercel
// then issues + auto-renews a per-host cert via HTTP-01 (which works for
// specific hostnames). Cloudflare just needs a DNS-only `* CNAME → cname.
// vercel-dns.com` so the host resolves to Vercel.

const VERCEL_API = "https://api.vercel.com";

/**
 * Attach a hostname to the Vercel project. No-op (returns ok) when the Vercel
 * token isn't configured — e.g. local dev on lvh.me, where there's nothing to
 * provision. Idempotent: a host already on this project counts as success.
 */
export async function addProjectDomain(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  // Not configured (local/dev) → nothing to do.
  if (!token || !projectId) return { ok: true };

  const teamId = process.env.VERCEL_TEAM_ID;
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  try {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/domains${qs}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      },
    );
    if (res.ok) return { ok: true };

    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = body?.error?.code;
    // Already attached to THIS project → fine (idempotent re-onboarding).
    if (res.status === 409 || code === "domain_already_exists") {
      return { ok: true };
    }
    return {
      ok: false,
      error: body?.error?.message ?? `Vercel API responded ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Vercel API request failed",
    };
  }
}
