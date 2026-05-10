import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 * Used for browser-only flows (e.g. Storage uploads from the photo capture).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
