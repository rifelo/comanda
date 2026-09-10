import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POS device pairing.
 *
 * A terminal (tablet at the register) has no user session. Instead it is
 * paired once with a registration code generated in Configuración → Punto de
 * venta, after which it holds an opaque secret in an httpOnly cookie. Every
 * request to /pos resolves that secret → `pos_devices` row (by sha256 hash)
 * with the service-role client, and from there the org whose catalog to show.
 */

export const POS_DEVICE_COOKIE = "comanda_pos_device";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year; revocation is server-side
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/** Unambiguous alphabet (no 0/O, 1/I) — codes are read aloud + typed on tablets. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export type PosDevice = {
  id: string;
  organizationId: string;
  restaurantId: string | null;
  name: string;
  orgName: string;
};

export function generateRegistrationCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** "abcd-1234" / "ABCD 1234" → "ABCD1234". Returns null if not a plausible code. */
export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== CODE_LENGTH) return null;
  return c;
}

/** Display form: "ABCD-1234". */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

async function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export async function setDeviceCookie(token: string) {
  const store = await cookies();
  store.set(POS_DEVICE_COOKIE, token, await cookieOptions());
}

export async function clearDeviceCookie() {
  const store = await cookies();
  store.set(POS_DEVICE_COOKIE, "", { ...(await cookieOptions()), maxAge: 0 });
}

/**
 * Resolve the paired device for this request from its cookie, or null when
 * the cookie is missing, unknown, or revoked. Bumps `last_seen_at` at most
 * once every few minutes so the settings screen can show activity without
 * a write on every keystroke of the terminal.
 */
export async function getPosDeviceFromCookie(): Promise<PosDevice | null> {
  const store = await cookies();
  const token = store.get(POS_DEVICE_COOKIE)?.value;
  if (!token) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("pos_devices")
    .select(
      "id, organization_id, restaurant_id, name, last_seen_at, revoked_at, organizations(name)",
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;

  const lastSeen = Date.parse(data.last_seen_at as string);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > LAST_SEEN_THROTTLE_MS) {
    // Fire-and-forget; a failed heartbeat must never block the terminal.
    void admin
      .from("pos_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => undefined, () => undefined);
  }

  const org = data.organizations as { name: string } | { name: string }[] | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;

  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    restaurantId: (data.restaurant_id as string | null) ?? null,
    name: data.name as string,
    orgName: orgName ?? "comanda",
  };
}

export type RegisterDeviceResult =
  | { ok: true; device: PosDevice }
  | { ok: false; error: string };

/**
 * Redeem a registration code: validates it (exists · not used · not cancelled ·
 * not expired), creates the `pos_devices` row, marks the code consumed, and
 * sets the device cookie. Runs with the service role because the caller has
 * no session — the code itself is the credential.
 */
export async function registerPosDevice(
  rawCode: string,
  requestedName?: string | null,
): Promise<RegisterDeviceResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "El código debe tener 8 caracteres." };

  const admin = createSupabaseAdminClient();
  const { data: reg, error } = await admin
    .from("pos_registration_codes")
    .select(
      "id, organization_id, restaurant_id, label, expires_at, used_at, cancelled_at, organizations(name)",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[registerPosDevice] lookup failed:", error);
    return { ok: false, error: "No se pudo validar el código." };
  }
  if (!reg) return { ok: false, error: "Código no válido." };
  if (reg.used_at) return { ok: false, error: "Este código ya fue usado." };
  if (reg.cancelled_at) return { ok: false, error: "Este código fue anulado." };
  if (Date.parse(reg.expires_at as string) < Date.now()) {
    return { ok: false, error: "Este código expiró. Genera uno nuevo en Configuración." };
  }

  const token = newDeviceToken();
  const name =
    (requestedName ?? "").trim().slice(0, 60) ||
    (reg.label as string | null)?.trim() ||
    "Caja";

  const { data: device, error: devErr } = await admin
    .from("pos_devices")
    .insert({
      organization_id: reg.organization_id,
      restaurant_id: reg.restaurant_id,
      name,
      token_hash: hashToken(token),
    })
    .select("id")
    .single();
  if (devErr || !device) {
    console.error("[registerPosDevice] insert device failed:", devErr);
    return { ok: false, error: "No se pudo registrar el dispositivo." };
  }

  // Consume the code atomically against a race: only the first claimant wins.
  const { data: claimed, error: useErr } = await admin
    .from("pos_registration_codes")
    .update({ used_at: new Date().toISOString(), device_id: device.id })
    .eq("id", reg.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (useErr || !claimed) {
    await admin.from("pos_devices").delete().eq("id", device.id);
    return { ok: false, error: "Este código ya fue usado." };
  }

  await setDeviceCookie(token);

  const org = reg.organizations as { name: string } | { name: string }[] | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  return {
    ok: true,
    device: {
      id: device.id as string,
      organizationId: reg.organization_id as string,
      restaurantId: (reg.restaurant_id as string | null) ?? null,
      name,
      orgName: orgName ?? "comanda",
    },
  };
}

/** Revoke this request's device (if any) and drop its cookie. */
export async function unlinkCurrentPosDevice(): Promise<void> {
  const store = await cookies();
  const token = store.get(POS_DEVICE_COOKIE)?.value;
  if (token) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("pos_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token))
      .is("revoked_at", null);
  }
  await clearDeviceCookie();
}
