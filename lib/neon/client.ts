import { headers } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getAuth } from "./auth";
import { RestQuery, rpc } from "./rest";
import { neonSql, type Actor } from "./sql";

/**
 * A stand-in for the supabase-js client when BACKEND=neon: `.from()` and
 * `.rpc()` go to Neon through the PostgREST-compatible builder, `.auth` to
 * Better Auth, and `.storage` still to Supabase Storage until the photos move
 * to Vercel Blob. Callers keep using the `SupabaseClient` type.
 */
type User = { id: string; email: string | null; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> };

const ok = <T>(data: T) => ({ data, error: null });
const fail = (message: string, code = "auth_error") => ({ data: { user: null }, error: { message, code, name: "AuthApiError", status: 400 } });

let _storage: SupabaseClient | null = null;
function storage() {
  _storage ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _storage.storage;
}

/** Realtime is not on Neon; screens fall back to polling. */
const channelStub = () => {
  const ch = {
    on: () => ch,
    subscribe: (cb?: (s: string) => void) => (cb?.("CLOSED"), ch),
    unsubscribe: async () => "ok",
    send: async () => "ok",
    httpSend: async () => ({ success: true }),
  };
  return ch;
};

function toUser(u: { id: string; email: string; name?: string | null; image?: string | null }): User {
  return { id: u.id, email: u.email, user_metadata: { full_name: u.name, name: u.name, avatar_url: u.image }, app_metadata: {} };
}

export async function sessionUser(h: Headers): Promise<User | null> {
  try {
    const s = await getAuth().api.getSession({ headers: h });
    return s?.user ? toUser(s.user) : null;
  } catch {
    return null;
  }
}

function makeClient(actor: () => Promise<Actor>, user: () => Promise<User | null>) {
  let actorP: Promise<Actor> | null = null;
  const getActor = () => (actorP ??= actor());
  return {
    from: (table: string) => new RestQuery(getActor(), table),
    rpc: (fn: string, args?: Record<string, unknown>) => rpc(getActor(), fn, args),
    get storage() {
      return storage();
    },
    channel: channelStub,
    removeChannel: async () => "ok",
    auth: {
      getUser: async () => {
        const u = await user();
        return u ? ok({ user: u }) : { data: { user: null }, error: { message: "Auth session missing!", name: "AuthSessionMissingError", status: 400 } };
      },
      getSession: async () => {
        const u = await user();
        return ok({ session: u ? { user: u, access_token: "" } : null });
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        try {
          const r = await getAuth().api.signInEmail({ body: { email: email.toLowerCase(), password }, headers: await headers() });
          return ok({ user: toUser(r.user), session: {} });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          return fail(status === 429 ? "Too many requests (rate limit)" : "Invalid login credentials");
        }
      },
      signOut: async () => {
        try {
          await getAuth().api.signOut({ headers: await headers() });
        } catch {}
        return { error: null };
      },
      exchangeCodeForSession: async () => fail("OAuth runs through /api/auth on Neon"),
      admin: adminApi,
    },
  };
}

/** The supabase `auth.admin` calls the app makes, against auth.users + Better Auth tables. */
const adminApi = {
  async listUsers({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) {
    const rows = (await neonSql().query(
      `select id::text, email, raw_user_meta_data meta, created_at from auth.users order by created_at, id limit $1 offset $2`,
      [perPage, (page - 1) * perPage],
    )) as { id: string; email: string; meta: Record<string, unknown> }[];
    return ok({ users: rows.map((r) => ({ id: r.id, email: r.email, user_metadata: r.meta ?? {}, app_metadata: {} })) });
  },

  async createUser(p: { email: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) {
    const email = p.email.trim().toLowerCase();
    const sql = neonSql();
    const exists = await sql.query(`select 1 from ba_user where lower(email)=$1 union all select 1 from auth.users where lower(email)=$1`, [email]);
    if (exists.length) return fail("A user with this email address has already been registered", "email_exists");
    const id = crypto.randomUUID();
    const meta = p.user_metadata ?? {};
    const name = String(meta.full_name ?? meta.name ?? email);
    const hash = p.password ? await bcrypt.hash(p.password, 10) : null;
    await sql.transaction([
      // The handle_new_user trigger reads this metadata and provisions profile + membership.
      sql.query(
        `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at, aud, role)
         values ($1::uuid, $2, $3::jsonb, case when $4 then now() end, now(), now(), 'authenticated', 'authenticated')`,
        [id, email, JSON.stringify(meta), !!p.email_confirm],
      ),
      sql.query(`insert into ba_user (id, name, email, "emailVerified") values ($1, $2, $3, $4)`, [id, name, email, !!p.email_confirm]),
      ...(hash
        ? [sql.query(`insert into ba_account (id, "accountId", "providerId", "userId", password) values ($1, $2, 'credential', $2, $3)`, [crypto.randomUUID(), id, hash])]
        : []),
    ]);
    return ok({ user: { id, email, user_metadata: meta, app_metadata: {} } });
  },

  /** No invite mail on Neon yet: the account is created and the person signs in with Google. */
  async inviteUserByEmail(email: string, opts?: { data?: Record<string, unknown> }) {
    return adminApi.createUser({ email, email_confirm: true, user_metadata: opts?.data });
  },

  async updateUserById(id: string, attrs: { password?: string }) {
    if (!attrs.password) return ok({ user: { id } });
    const sql = neonSql();
    const hash = await bcrypt.hash(attrs.password, 10);
    await sql.transaction([
      sql.query(
        `insert into ba_user (id, name, email, "emailVerified")
         select id::text, coalesce(raw_user_meta_data->>'full_name', email), lower(email), true from auth.users where id=$1::uuid
         on conflict (id) do nothing`,
        [id],
      ),
      sql.query(`update ba_account set password=$2, "updatedAt"=now() where "userId"=$1 and "providerId"='credential'`, [id, hash]),
      sql.query(
        `insert into ba_account (id, "accountId", "providerId", "userId", password)
         select $3, $1, 'credential', $1, $2 where not exists (select 1 from ba_account where "userId"=$1 and "providerId"='credential')`,
        [id, hash, crypto.randomUUID()],
      ),
    ]);
    return ok({ user: { id } });
  },
};

/** Server Components / Actions: runs as the signed-in user (RLS), or anon. */
export function createNeonServerClient(h?: Headers) {
  let userP: Promise<User | null> | null = null;
  const user = () => (userP ??= (async () => sessionUser(h ?? (await headers())))());
  return makeClient(async () => {
    const u = await user();
    return u ? { sub: u.id, email: u.email } : "anon";
  }, user);
}

/** The service-role equivalent: table owner, no RLS. */
export function createNeonAdminClient() {
  return makeClient(async () => "service", async () => null);
}
