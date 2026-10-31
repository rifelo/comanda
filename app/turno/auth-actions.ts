"use server";

import { signOutLocal } from "@/app/login/actions";

/**
 * Sign out only *this* tablet — the person, never the pairing. Kept for the
 * tablet screens that already post to it (shell, close receipt, caja); it is
 * the single login's `signOutLocal`, which lands on /login (the team's tiles
 * on a paired device). The tablet's own email form is gone: sign-in is
 * `signInAsMember` / `signInWithPassword` in app/login/actions.ts.
 */
export async function signOutTurno(): Promise<void> {
  await signOutLocal();
}
