import "server-only";
import { redirect } from "next/navigation";
import { loadTurnoGate, turnoLoginHref, type TurnoContext } from "@/lib/turno/server";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a search param. */
export function param(sp: Record<string, string | string[] | undefined>, key: string): string | null {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/** `path` + the given params, for the login's `next` (keeps ?turno= etc. across the sign-in). */
export function withQuery(path: string, sp: Record<string, string | string[] | undefined>, keys: string[]): string {
  const q = new URLSearchParams();
  for (const k of keys) {
    const v = param(sp, k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** The team app's gate: a ready context, or off to the single login coming back to `next`. */
export async function requireEquipo(next: string): Promise<TurnoContext> {
  const gate = await loadTurnoGate();
  if (gate.kind !== "ready") redirect(turnoLoginHref(gate, next));
  return gate.ctx;
}

export function actorOf(ctx: TurnoContext) {
  return { name: ctx.actor.fullName, role: ctx.actor.role, viaDevice: ctx.actor.viaDevice };
}

/** Server render time (ms) for the live clocks — seeds SSR and hydration with the same minute. */
export function ahoraMs(): number {
  return Date.now();
}
