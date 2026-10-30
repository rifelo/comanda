import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNeonServerClient } from "@/lib/neon/client";

/**
 * Supabase client for Server Components and Server Actions.
 *
 * Reads the session from request cookies. Mutations refresh the session
 * cookie via the `setAll` callback — required for token rotation.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  // Neon + Better Auth (local dev for now) — same API, see lib/neon/client.ts.
  if (process.env.BACKEND === "neon") return createNeonServerClient() as unknown as SupabaseClient;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component; cookies are read-only there.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
