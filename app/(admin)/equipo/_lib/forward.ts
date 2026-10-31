import { redirect } from "next/navigation";

type Params = Record<string, string | string[] | undefined>;

/**
 * Old owner URLs (/turnos/*, /configuracion/*, /numeros, /calificaciones,
 * /baristas, /dashboard) moved in the redesign (docs/redesign/PLAN.md §2.4).
 * Each old page is a tiny server component that calls this: redirect to the
 * new path keeping the query string, so bookmarks and filters survive.
 */
export function forward(to: string, searchParams?: Params): never {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
  }
  const q = qs.toString();
  redirect(q ? `${to}${to.includes("?") ? "&" : "?"}${q}` : to);
}

/** Next 16 page props: `searchParams` is a promise. */
export type ForwardProps = { searchParams: Promise<Params> };
