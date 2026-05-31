import { headers } from "next/headers";
import { Wordmark } from "@/components/comanda/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tenantFromHeaders } from "@/lib/tenant";
import { GoogleSignInButton } from "./google-signin-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  // On a tenant subdomain, greet by org name (public, pre-auth — safe RPC).
  const tenant = tenantFromHeaders(await headers());
  let tenantName: string | null = null;
  if (tenant) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("org_public_by_slug", {
      p_slug: tenant.slug,
    });
    tenantName = (data as { name: string }[] | null)?.[0]?.name ?? null;
  }
  return (
    <main className="cmd-paper flex min-h-screen flex-col px-6 pt-16 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark size={56} className="tracking-[-0.02em]" />
        <p
          className="text-muted mt-3 leading-relaxed"
          style={{ fontSize: 12, letterSpacing: "0.04em" }}
        >
          {tenantName
            ? `Inicia sesión en ${tenantName}.`
            : "Lista de actividades de cajero, en el bolsillo."}
        </p>

        <div className="mt-14">
          <GoogleSignInButton next={sp.next} />
        </div>

        {sp.error ? (
          <p
            role="alert"
            className="mt-5 text-center"
            style={{
              color: "var(--red)",
              fontSize: 12,
              letterSpacing: "0.04em",
            }}
          >
            {decodeURIComponent(sp.error)}
          </p>
        ) : null}

        <p
          className="text-muted mt-6 text-center"
          style={{ fontSize: 11, letterSpacing: "0.04em", lineHeight: 1.5 }}
        >
          Inicia sesión con tu cuenta de Google. Si tu administrador te asignó
          a un restaurante, usa el mismo correo que te dio.
        </p>

        <div
          className="mt-auto pt-12 text-center text-muted"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          <span>co-manda · operación interna</span>
        </div>
      </div>
    </main>
  );
}
