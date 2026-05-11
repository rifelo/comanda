"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Single sign-in surface for the app: kicks off the Supabase OAuth PKCE
 * flow against Google. Supabase auto-navigates to Google's consent page;
 * Google bounces back to its Supabase callback; Supabase finally redirects
 * to our `/auth/callback` route with `?code=…`, which exchanges the code
 * for a session and lands the user on the right home.
 */
export function GoogleSignInButton({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (next) redirectTo.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) setError(error.message);
      // success path: the browser is already navigating to Google.
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="cmd-btn w-full"
        style={{
          padding: "14px",
          fontSize: 13,
          background: "var(--paper-lt)",
          color: "var(--ink)",
          borderColor: "var(--ink)",
          gap: 10,
        }}
      >
        <GoogleGlyph />
        {pending ? "Conectando…" : "Continuar con Google"}
      </button>

      {error ? (
        <p
          role="alert"
          style={{ color: "var(--red)", fontSize: 12, letterSpacing: "0.04em" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.69-3.89 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.71H.92v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.71A5.41 5.41 0 0 1 3.7 9c0-.59.1-1.17.28-1.71V4.96H.92a9 9 0 0 0 0 8.08l3.06-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .92 4.96l3.06 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
