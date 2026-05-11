import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * OAuth callback for Supabase Google sign-in (PKCE flow).
 *
 * Flow:
 *   1. Client opens Supabase OAuth URL → Google consent
 *   2. Google → Supabase auth callback
 *   3. Supabase → here with `?code=<one-time-code>` (+ optional `next`)
 *   4. We exchange `code` for a session, which sets the auth cookies, and
 *      redirect to `next` (default `/`).
 *
 * Errors bounce back to /login with a readable message.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const errorDesc =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (errorDesc) {
    return redirectToLoginWithError(request, errorDesc);
  }
  if (!code) {
    return redirectToLoginWithError(request, "Falta el código de OAuth.");
  }

  const next = safeNext(url.searchParams.get("next"));

  // Build a response we can attach cookies to as the supabase client writes
  // them — the cookies must travel with the redirect.
  const response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToLoginWithError(request, error.message);
  }

  return response;
}

function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function redirectToLoginWithError(request: NextRequest, msg: string) {
  const u = new URL("/login", request.url);
  u.searchParams.set("error", msg);
  return NextResponse.redirect(u);
}
