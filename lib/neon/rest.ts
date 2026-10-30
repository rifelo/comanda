import { getMeta, type Fk, type Meta } from "./meta";
import { runAs, type Actor, type Stmt } from "./sql";

/**
 * A PostgREST-compatible query builder over Postgres, covering the subset of
 * supabase-js the app uses: select with embedded resources (aliases, !inner,
 * !left, !fkey hints, nested, `(count)`), the filter operators, order/limit/
 * range, single/maybeSingle, count, insert/upsert/update/delete with
 * returning, and rpc. Results are built with json_agg in Postgres, so numbers,
 * dates and timestamps come back in the same JSON shape PostgREST produced.
 */

export type PgError = { message: string; code: string; details: string | null; hint: string | null };
type Result = { data: unknown; error: PgError | null; count: number | null; status: number; statusText: string };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

// ---------- select grammar ----------
type Node =
  | { kind: "star" }
  | { kind: "col"; name: string; alias: string; cast?: string }
  | { kind: "count" }
  | { kind: "embed"; name: string; alias: string; hint?: string; inner: boolean; children: Node[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s: string): Node[] {
  return splitTop(s.replace(/\s+/g, " ")).map((item): Node => {
    if (item === "*") return { kind: "star" };
    const e = item.match(/^(?:(\w+)\s*:\s*)?(\w+)((?:\s*!\s*\w+)*)\s*\(([\s\S]*)\)$/);
    if (e) {
      const hints = e[3].split("!").map((h) => h.trim()).filter(Boolean);
      const inner = hints.includes("inner");
      const hint = hints.find((h) => h !== "inner" && h !== "left");
      return { kind: "embed", alias: e[1] ?? e[2], name: e[2], hint, inner, children: parseSelect(e[4] || "*") };
    }
    if (item === "count" || item === "count()") return { kind: "count" };
    const c = item.match(/^(?:(\w+)\s*:\s*)?(\w+)(?:::(\w+))?$/);
    if (!c) throw new RestError(`unsupported select item: ${item}`, "PGRST100");
    return { kind: "col", alias: c[1] ?? c[2], name: c[2], cast: c[3] };
  });
}

class RestError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

// ---------- filters ----------
type Cond =
  | { kind: "op"; path: string[]; col: string; op: string; value: unknown; negate?: boolean }
  | { kind: "or" | "and"; path: string[]; items: Cond[]; negate?: boolean };

const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

/** Parses PostgREST's logic-tree syntax: `a.eq.1,and(b.is.null,c.in.(x,y))`. */
function parseLogic(s: string, path: string[]): Cond[] {
  return splitTop(s).map((part): Cond => {
    const g = part.match(/^(not\.)?(and|or)\(([\s\S]*)\)$/);
    if (g) return { kind: g[2] as "and" | "or", path, items: parseLogic(g[3], path), negate: !!g[1] };
    const m = part.match(/^([\w.]+?)\.(not\.)?(\w+)\.([\s\S]*)$/);
    if (!m) throw new RestError(`unsupported logic filter: ${part}`, "PGRST100");
    return { kind: "op", path, col: m[1], op: m[3], value: parseTextValue(m[3], m[4]), negate: !!m[2] };
  });
}

function parseTextValue(op: string, v: string): unknown {
  if (op === "is") return v === "null" ? null : v === "true" ? true : v === "false" ? false : v;
  if (op === "in") return splitTop(v.replace(/^\(|\)$/g, "")).map((x) => x.replace(/^"|"$/g, ""));
  return v;
}

// ---------- SQL compiler ----------
class Compiler {
  params: unknown[] = [];
  n = 0;
  constructor(public meta: Meta) {}

  param(v: unknown, type?: string): string {
    this.params.push(v);
    return `$${this.params.length}${type ? `::${type}` : ""}`;
  }
  alias() { return `t${this.n++}`; }
  colType(table: string, col: string) { return this.meta.columns.get(table)?.get(col); }

  cond(table: string, a: string, c: Cond): string {
    if (c.kind !== "op") {
      const inner = c.items.map((i) => this.cond(table, a, i)).join(c.kind === "or" ? " or " : " and ");
      return `${c.negate ? "not " : ""}(${inner || "true"})`;
    }
    const ty = this.colType(table, c.col);
    if (!ty) throw new RestError(`column ${table}.${c.col} does not exist`, "42703");
    const col = `${a}.${q(c.col)}`;
    let sql: string;
    const v = c.value;
    switch (c.op) {
      case "is":
        sql = `${col} is ${v === null ? "null" : v === true ? "true" : v === false ? "false" : "unknown"}`;
        break;
      case "in":
        sql = `${col} = any(${this.param(Array.isArray(v) ? v : [v], `${ty}[]`)})`;
        break;
      case "like": case "ilike":
        sql = `${col} ${OPS[c.op]} ${this.param(String(v).replace(/\*/g, "%"), "text")}`;
        break;
      case "cs": case "contains":
        sql = `${col} @> ${this.param(/json/.test(ty) ? JSON.stringify(v) : v, ty)}`;
        break;
      default:
        if (!OPS[c.op]) throw new RestError(`unsupported operator ${c.op}`, "PGRST100");
        sql = `${col} ${OPS[c.op]} ${this.param(/json/.test(ty) && typeof v === "object" ? JSON.stringify(v) : v, ty)}`;
    }
    return c.negate ? `not (${sql})` : sql;
  }

  resolve(parent: string, node: Extract<Node, { kind: "embed" }>): { fk: Fk; toOne: boolean; target: string } {
    const target = node.name;
    if (!this.meta.columns.has(target)) throw new RestError(`Could not find a relationship between '${parent}' and '${target}'`, "PGRST200");
    let cands = [
      ...this.meta.fks.filter((f) => f.table === parent && f.ref === target).map((fk) => ({ fk, toOne: true, target })),
      ...this.meta.fks.filter((f) => f.table === target && f.ref === parent).map((fk) => ({ fk, toOne: false, target })),
    ];
    if (node.hint) cands = cands.filter((c) => c.fk.name === node.hint || c.fk.cols[0] === node.hint);
    // Self-references show up twice; prefer the many-to-one reading like PostgREST.
    if (cands.length > 1 && parent === target) cands = cands.filter((c) => c.toOne);
    if (cands.length !== 1)
      throw new RestError(
        cands.length ? `Could not embed because more than one relationship was found for '${parent}' and '${target}'` : `Could not find a relationship between '${parent}' and '${target}'`,
        cands.length ? "PGRST201" : "PGRST200",
      );
    return cands[0];
  }

  /** WHERE conditions for one table level: its own filters plus !inner existence checks. */
  where(table: string, a: string, nodes: Node[], conds: Cond[], depth: number): string[] {
    const own = conds.filter((c) => c.path.length === depth).map((c) => this.cond(table, a, c));
    for (const node of nodes) {
      if (node.kind !== "embed" || !node.inner) continue;
      const { fk, toOne, target } = this.resolve(table, node);
      const b = this.alias();
      const sub = this.subConds(conds, node, depth);
      const w = [this.join(a, b, fk, toOne), ...this.where(target, b, node.children, sub, depth + 1)];
      own.push(`exists (select 1 from ${q(target)} ${b} where ${w.join(" and ")})`);
    }
    return own;
  }

  subConds(conds: Cond[], node: Extract<Node, { kind: "embed" }>, depth: number) {
    return conds.filter((c) => c.path.length > depth && (c.path[depth] === node.alias || c.path[depth] === node.name));
  }

  join(a: string, b: string, fk: Fk, toOne: boolean): string {
    // toOne: parent a holds the fk columns pointing at b; else b points at a.
    return fk.cols
      .map((col, i) => (toOne ? `${b}.${q(fk.refCols[i])} = ${a}.${q(col)}` : `${b}.${q(col)} = ${a}.${q(fk.refCols[i])}`))
      .join(" and ");
  }

  selectList(table: string, a: string, nodes: Node[], conds: Cond[], depth: number): string {
    const parts: string[] = [];
    for (const node of nodes) {
      if (node.kind === "star") parts.push(`${a}.*`);
      else if (node.kind === "col") {
        if (!this.colType(table, node.name)) throw new RestError(`column ${table}.${node.name} does not exist`, "42703");
        parts.push(`${a}.${q(node.name)}${node.cast ? `::${node.cast}` : ""} as ${q(node.alias)}`);
      } else if (node.kind === "count") parts.push(`count(*) as "count"`);
      else {
        const { fk, toOne, target } = this.resolve(table, node);
        const b = this.alias();
        const sub = this.subConds(conds, node, depth);
        const w = [this.join(a, b, fk, toOne), ...this.where(target, b, node.children, sub, depth + 1)].join(" and ");
        if (node.children.length === 1 && node.children[0].kind === "count") {
          parts.push(`(select json_build_array(json_build_object('count', count(*))) from ${q(target)} ${b} where ${w}) as ${q(node.alias)}`);
          continue;
        }
        const list = this.selectList(target, b, node.children, sub, depth + 1);
        const inner = `select ${list} from ${q(target)} ${b} where ${w}`;
        parts.push(
          toOne
            ? `(select row_to_json(_e) from (${inner} limit 1) _e) as ${q(node.alias)}`
            : `coalesce((select json_agg(_e) from (${inner}) _e), '[]'::json) as ${q(node.alias)}`,
        );
      }
    }
    return parts.join(", ") || `${a}.*`;
  }
}

// ---------- builder ----------
type Op = "select" | "insert" | "upsert" | "update" | "delete";

export class RestQuery implements PromiseLike<Result> {
  private op: Op = "select";
  private columns: string | null = null; // null = no returning for mutations
  private conds: Cond[] = [];
  private orders: { path: string[]; col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim: number | null = null;
  private off: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countMode: string | null = null;
  private head = false;
  private body: unknown = null;
  private onConflict: string | null = null;
  private ignoreDup = false;
  private throws = false;

  constructor(private actor: Actor | Promise<Actor>, private table: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.columns = columns;
    else this.columns = columns;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: unknown, opts?: { count?: string }) {
    this.op = "insert"; this.body = values;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  upsert(values: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: string }) {
    this.op = "upsert"; this.body = values;
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }
  update(values: unknown, opts?: { count?: string }) {
    this.op = "update"; this.body = values;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  delete(opts?: { count?: string }) {
    this.op = "delete";
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  private add(col: string, op: string, value: unknown, negate = false) {
    const parts = col.split(".");
    this.conds.push({ kind: "op", path: parts.slice(0, -1), col: parts[parts.length - 1], op, value, negate });
    return this;
  }
  eq(c: string, v: unknown) { return this.add(c, "eq", v); }
  neq(c: string, v: unknown) { return this.add(c, "neq", v); }
  gt(c: string, v: unknown) { return this.add(c, "gt", v); }
  gte(c: string, v: unknown) { return this.add(c, "gte", v); }
  lt(c: string, v: unknown) { return this.add(c, "lt", v); }
  lte(c: string, v: unknown) { return this.add(c, "lte", v); }
  like(c: string, v: string) { return this.add(c, "like", v); }
  ilike(c: string, v: string) { return this.add(c, "ilike", v); }
  is(c: string, v: unknown) { return this.add(c, "is", v); }
  in(c: string, v: unknown[]) { return this.add(c, "in", v); }
  contains(c: string, v: unknown) { return this.add(c, "cs", v); }
  match(obj: Record<string, unknown>) { for (const [k, v] of Object.entries(obj)) this.add(k, "eq", v); return this; }
  not(c: string, op: string, v: unknown) {
    return this.add(c, op, typeof v === "string" ? parseTextValue(op, v) : v, true);
  }
  filter(c: string, op: string, v: unknown) {
    if (op.startsWith("not.")) return this.not(c, op.slice(4), v);
    return this.add(c, op, typeof v === "string" ? parseTextValue(op, v) : v);
  }
  or(filters: string, opts?: { foreignTable?: string; referencedTable?: string }) {
    const ref = opts?.referencedTable ?? opts?.foreignTable;
    const path = ref ? ref.split(".") : [];
    this.conds.push({ kind: "or", path, items: parseLogic(filters, path) });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    const ref = opts?.referencedTable ?? opts?.foreignTable;
    if (ref) throw new RestError("order on embedded resources is not supported", "PGRST100");
    this.orders.push({ path: [], col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  returns() { return this; }
  overrideTypes() { return this; }
  abortSignal() { return this; }
  throwOnError() { this.throws = true; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.run().then(ok, err);
  }

  private async run(): Promise<Result> {
    try {
      const meta = await getMeta();
      if (!meta.columns.has(this.table))
        throw new RestError(`Could not find the table 'public.${this.table}' in the schema cache`, "PGRST205");
      const stmts = this.compile(meta);
      const rows = await runAs(await this.actor, stmts);
      let data: unknown = this.head ? null : (rows[0]?.[0] as { data?: unknown } | undefined)?.data ?? null;
      const count = this.countMode ? Number((rows[rows.length - 1]?.[0] as { n?: unknown })?.n ?? 0) : null;
      const isMutation = this.op !== "select";
      if (isMutation && this.columns === null) data = null;
      if (Array.isArray(data) && this.mode !== "many") {
        if (data.length > 1 || (data.length === 0 && this.mode === "single"))
          return this.fail({ message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `The result contains ${data.length} rows`, hint: null }, 406);
        data = data[0] ?? null;
      }
      return { data, error: null, count, status: this.op === "insert" ? 201 : 200, statusText: "OK" };
    } catch (e) {
      const x = e as { message?: string; code?: string; detail?: string; hint?: string };
      return this.fail({ message: x.message ?? String(e), code: x.code ?? "PGRST000", details: x.detail ?? null, hint: x.hint ?? null }, 400);
    }
  }

  private fail(error: PgError, status: number): Result {
    if (process.env.NODE_ENV !== "production" && error.code !== "PGRST116")
      console.error(`[neon] ${this.op} ${this.table}: ${error.code} ${error.message}`);
    if (this.throws) throw Object.assign(new Error(error.message), error);
    return { data: null, error, count: null, status, statusText: "Error" };
  }

  private compile(meta: Meta): Stmt[] {
    const c = new Compiler(meta);
    const t = this.table;
    const a = c.alias();
    const nodes = parseSelect(this.columns ?? "*");
    const where = c.where(t, a, nodes, this.conds, 0);
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    const orderSql = this.orders.length
      ? ` order by ${this.orders.map((o) => `${a}.${q(o.col)} ${o.asc ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`).join(", ")}`
      : "";
    const limSql = `${this.lim !== null ? ` limit ${Math.floor(this.lim)}` : ""}${this.off !== null ? ` offset ${Math.floor(this.off)}` : ""}`;
    const agg = (from: string) => `select coalesce(json_agg(_r), '[]'::json) as data from (${from}) _r`;

    if (this.op === "select") {
      const list = c.selectList(t, a, nodes, this.conds, 0);
      const out: Stmt[] = [];
      const params = c.params;
      out.push({ text: agg(`select ${list} from ${q(t)} ${a}${whereSql}${orderSql}${limSql}`), params });
      if (this.countMode) {
        // Own compiler: the count must not carry the embeds' parameters.
        const k = new Compiler(meta);
        const ka = k.alias();
        const kw = k.where(t, ka, nodes, this.conds, 0);
        out.push({ text: `select count(*) as n from ${q(t)} ${ka}${kw.length ? ` where ${kw.join(" and ")}` : ""}`, params: k.params });
      }
      return out;
    }

    // Mutations: the row source is a CTE `_m` with the affected rows.
    let mutation: string;
    const rows = Array.isArray(this.body) ? (this.body as Record<string, unknown>[]) : this.body ? [this.body as Record<string, unknown>] : [];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    for (const k of keys) if (!c.colType(t, k)) throw new RestError(`Could not find the '${k}' column of '${t}' in the schema cache`, "PGRST204");
    const cols = keys.map(q).join(", ");
    if (this.op === "insert" || this.op === "upsert") {
      if (!rows.length) return [{ text: "select '[]'::json as data", params: [] }];
      const src = c.param(JSON.stringify(rows), "json");
      mutation = `insert into ${q(t)} as ${a} (${cols}) select ${cols} from json_populate_recordset(null::${q(t)}, ${src})`;
      if (this.op === "upsert") {
        const target = this.onConflict ? this.onConflict.split(",").map((s) => q(s.trim())) : (meta.pk.get(t) ?? []).map(q);
        const conflictCols = new Set(target);
        const sets = keys.map(q).filter((k) => !conflictCols.has(k));
        mutation += ` on conflict (${target.join(", ")}) ${this.ignoreDup || !sets.length ? "do nothing" : `do update set ${sets.map((k) => `${k} = excluded.${k}`).join(", ")}`}`;
      }
    } else if (this.op === "update") {
      if (!keys.length) return [{ text: "select '[]'::json as data", params: [] }];
      const src = c.param(JSON.stringify(rows[0]), "json");
      mutation = `update ${q(t)} ${a} set ${keys.map((k) => `${q(k)} = _v.${q(k)}`).join(", ")} from json_populate_record(null::${q(t)}, ${src}) _v${whereSql}`;
    } else {
      mutation = `delete from ${q(t)} ${a}${whereSql}`;
    }
    const list = c.selectList(t, a, nodes, [], 0);
    const text = `with _m as (${mutation} returning ${a}.*) ${agg(`select ${list} from _m ${a}${orderSql}`)}`;
    const out: Stmt[] = [{ text, params: c.params }];
    return out;
  }
}

/** supabase.rpc(fn, args) — scalar results come back as the value, set-returning ones as an array. */
export async function rpc(actorRef: Actor | Promise<Actor>, fn: string, args: Record<string, unknown> = {}): Promise<Result> {
  try {
    const meta = await getMeta();
    const f = meta.fns.get(fn);
    if (!f) throw new RestError(`Could not find the function public.${fn} in the schema cache`, "PGRST202");
    const params: unknown[] = [];
    const named = Object.entries(args).map(([k, v]) => {
      const ty = f.args.find((x) => x.name === k)?.type;
      params.push(ty && /json/.test(ty) ? JSON.stringify(v) : v);
      return `${q(k)} => $${params.length}${ty ? `::${ty}` : ""}`;
    });
    const call = `public.${q(fn)}(${named.join(", ")})`;
    const text = f.retset
      ? `select coalesce(json_agg(_r), '[]'::json) as data from ${call} _r`
      : f.ret === "void"
        ? `select ${call} is null as data`
        : `select to_json(${call}) as data`;
    const [rows] = await runAs(await actorRef, [{ text, params }]);
    const data = f.ret === "void" ? null : (rows[0] as { data: unknown }).data;
    return { data, error: null, count: null, status: 200, statusText: "OK" };
  } catch (e) {
    const x = e as { message?: string; code?: string; detail?: string; hint?: string };
    if (process.env.NODE_ENV !== "production") console.error(`[neon] rpc ${fn}: ${x.code} ${x.message}`);
    return { data: null, error: { message: x.message ?? String(e), code: x.code ?? "PGRST000", details: x.detail ?? null, hint: x.hint ?? null }, count: null, status: 400, statusText: "Error" };
  }
}
