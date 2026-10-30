import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Who a query runs as — the same three roles PostgREST used on Supabase:
 *  - `service`: the table owner, so RLS doesn't apply (the old service_role key).
 *  - `{ sub }`: role `authenticated` with request.jwt.claims set, so every RLS
 *    policy and SQL function sees `auth.uid()` exactly as before.
 *  - `anon`: no session.
 */
export type Actor = "service" | "anon" | { sub: string; email?: string | null };

let _sql: NeonQueryFunction<false, false> | null = null;
export function neonSql() {
  if (!_sql) _sql = neon(process.env.NEON_DATABASE_URL!);
  return _sql;
}

export type Stmt = { text: string; params: unknown[] };

/**
 * Runs the statements in ONE HTTP round trip and one transaction, prefixed by
 * the role/claims setup. Returns the rows of each caller statement.
 */
export async function runAs(actor: Actor, stmts: Stmt[]): Promise<Record<string, unknown>[][]> {
  const sql = neonSql();
  const pre: Stmt[] = [{ text: "select set_config('timezone', 'UTC', true)", params: [] }];
  if (actor !== "service") {
    const claims =
      actor === "anon" ? { role: "anon" } : { sub: actor.sub, email: actor.email ?? undefined, role: "authenticated" };
    pre.push(
      { text: `set local role ${actor === "anon" ? "anon" : "authenticated"}`, params: [] },
      { text: "select set_config('request.jwt.claims', $1, true)", params: [JSON.stringify(claims)] },
    );
  }
  const all = [...pre, ...stmts];
  const res = (await sql.transaction(all.map((s) => sql.query(s.text, s.params)))) as Record<string, unknown>[][];
  return res.slice(pre.length);
}
