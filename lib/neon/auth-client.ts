import { createAuthClient } from "better-auth/react";

/** Browser side of Better Auth (Google sign-in) when NEXT_PUBLIC_BACKEND=neon. */
export const authClient = createAuthClient();
