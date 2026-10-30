import { neonSql } from "./sql";

/**
 * Catalog metadata the PostgREST-compatible builder needs: column types,
 * primary keys, foreign keys (for embedding) and function signatures (rpc).
 * Loaded once per server process; the schema only changes with a deploy.
 */
export type Fk = { name: string; table: string; cols: string[]; ref: string; refCols: string[] };
export type Fn = { args: { name: string; type: string }[]; retset: boolean; ret: string };
export type Meta = {
  columns: Map<string, Map<string, string>>; // table -> column -> format_type
  pk: Map<string, string[]>;
  fks: Fk[];
  fns: Map<string, Fn>;
};

let _meta: Promise<Meta> | null = null;

export function getMeta(): Promise<Meta> {
  if (!_meta) _meta = loadMeta().catch((e) => ((_meta = null), Promise.reject(e)));
  return _meta;
}

async function loadMeta(): Promise<Meta> {
  const sql = neonSql();
  const [cols, pks, fks, fns] = await Promise.all([
    sql.query(`select c.relname t, a.attname c, format_type(a.atttypid, a.atttypmod) ty
      from pg_attribute a join pg_class c on c.oid=a.attrelid
      where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','p') and a.attnum>0 and not a.attisdropped`),
    sql.query(`select c.relname t, array_agg(a.attname::text order by k.ord) cols
      from pg_constraint x join pg_class c on c.oid=x.conrelid
      cross join lateral unnest(x.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid=x.conrelid and a.attnum=k.attnum
      where x.contype='p' and c.relnamespace='public'::regnamespace group by 1`),
    sql.query(`select x.conname name, c.relname t, r.relname ref,
        (select array_agg(a.attname::text order by k.ord) from unnest(x.conkey) with ordinality k(n, ord) join pg_attribute a on a.attrelid=x.conrelid and a.attnum=k.n) cols,
        (select array_agg(a.attname::text order by k.ord) from unnest(x.confkey) with ordinality k(n, ord) join pg_attribute a on a.attrelid=x.confrelid and a.attnum=k.n) refcols
      from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_class r on r.oid=x.confrelid
      where x.contype='f' and c.relnamespace='public'::regnamespace and r.relnamespace='public'::regnamespace`),
    sql.query(`select p.proname n, p.proretset rs, format_type(p.prorettype, null) ret,
        coalesce(p.proargnames, '{}')::text[] names, coalesce((select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes) with ordinality u(t, o)), '{}') types
      from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`),
  ]);
  const columns = new Map<string, Map<string, string>>();
  for (const r of cols as { t: string; c: string; ty: string }[]) {
    if (!columns.has(r.t)) columns.set(r.t, new Map());
    columns.get(r.t)!.set(r.c, r.ty);
  }
  const pk = new Map<string, string[]>();
  for (const r of pks as { t: string; cols: string[] }[]) pk.set(r.t, r.cols);
  const fnMap = new Map<string, Fn>();
  for (const r of fns as { n: string; rs: boolean; ret: string; names: string[]; types: string[] }[])
    fnMap.set(r.n, { retset: r.rs, ret: r.ret, args: r.types.map((type, i) => ({ name: r.names[i], type })) });
  return {
    columns,
    pk,
    fks: (fks as { name: string; t: string; ref: string; cols: string[]; refcols: string[] }[]).map((r) => ({
      name: r.name, table: r.t, cols: r.cols, ref: r.ref, refCols: r.refcols,
    })),
    fns: fnMap,
  };
}
