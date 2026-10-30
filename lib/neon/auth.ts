import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { neonSql } from "./sql";

/**
 * Login on Neon: Better Auth with its tables in our database (ba_*). User ids
 * are the same uuids Supabase used, so profiles and every FK stay as they are;
 * passwords are bcrypt like Supabase's, so imported hashes keep working.
 * `auth.users` stays as the user list our SQL knows about: a new Better Auth
 * user is mirrored there, which fires the existing handle_new_user trigger.
 */
function google() {
  return process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: "select_account" as const } }
    : undefined;
}

function create() {
  return betterAuth({
    database: new Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 3 }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    user: { modelName: "ba_user" },
    session: { modelName: "ba_session", expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 60 * 5 } },
    account: { modelName: "ba_account", accountLinking: { enabled: true, trustedProviders: ["google"] } },
    verification: { modelName: "ba_verification" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      password: {
        hash: (password) => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    socialProviders: google(),
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await neonSql().query(
              `insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role)
               values ($1::uuid, $2, $3::jsonb, now(), now(), 'authenticated', 'authenticated') on conflict (id) do nothing`,
              [user.id, user.email, JSON.stringify({ full_name: user.name })],
            );
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

/** Built on first use, so the Supabase backend never loads or configures Better Auth. */
let _auth: ReturnType<typeof create> | null = null;
export function getAuth() {
  return (_auth ??= create());
}
