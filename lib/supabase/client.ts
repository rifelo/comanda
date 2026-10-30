import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for Client Components.
 * Used for browser-only flows (e.g. Storage uploads from the photo capture).
 * With NEXT_PUBLIC_BACKEND=neon there is no Supabase in the browser: realtime
 * channels become no-ops (the screens already poll) and there's no session.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_BACKEND === "neon") return neonBrowserStub();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function neonBrowserStub(): SupabaseClient {
  const ch = {
    on: () => ch,
    subscribe: () => ch,
    send: async () => "ok",
    unsubscribe: async () => "ok",
  };
  const stub = {
    channel: () => ch,
    removeChannel: async () => "ok",
    realtime: { setAuth: () => {} },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: new Error("Subida directa no disponible en Neon") }),
        createSignedUrl: async () => ({ data: null, error: new Error("Subida directa no disponible en Neon") }),
      }),
    },
  };
  return stub as unknown as SupabaseClient;
}
