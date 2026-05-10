import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client running with the `service_role` key.
 * Bypasses RLS, so only call it from Server Actions / Route Handlers after
 * the request has already been authenticated AND authorized.
 *
 * Today this is used by the admin "add staff" flow, where we need to call
 * `auth.admin.createUser` (which is gated to service_role).
 */
let _admin: SupabaseClient | null = null;
export function createSupabaseAdminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return _admin;
}
