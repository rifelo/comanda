import "./login.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionPerson } from "@/lib/auth";
import { landingFor, listRosterForSede, resolveSedeId, safeNext } from "@/lib/auth-person";
import { getPosDeviceFromCookie, type PosDevice } from "@/lib/pos/devices";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { todayIdxOf } from "@/lib/turno/state";
import { nowInTz, todayInTz } from "@/lib/utils";
import { signOutLocal } from "./actions";
import { LoginClock } from "./clock";
import { GoogleSignInButton } from "./google-signin-button";
import { PasswordForm } from "./password-form";
import { TeamLogin } from "./team-login";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · Comanda" };

type SP = { next?: string; error?: string; switch?: string; device?: string };

/**
 * The single login, for every person and every device.
 *   · Already signed in → straight to their landing (`landingFor`), unless
 *     `?switch=1` forces the screen (a gate found the session can't use this
 *     sede and sent it here with the reason in `?error=`).
 *   · Paired device (pos cookie) → «¿Quién eres?»: the sede's roster as
 *     tiles + password, Google, «Otra cuenta».
 *   · Otherwise → Google + email/password. Names are never listed without a
 *     device cookie.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const forced = sp.switch === "1";
  const [device, session] = await Promise.all([getPosDeviceFromCookie(), getSessionPerson()]);

  if (session && !forced) redirect(landingFor(session.profile.role === "admin" ? "admin" : "staff", !!device, next));

  const error = sp.error ? sp.error.slice(0, 300) : null;
  const signedInAs = session ? session.profile.full_name || session.user.email || "otra cuenta" : null;

  if (device) {
    const admin = createSupabaseAdminClient();
    const [roster, intro] = await Promise.all([
      listRosterForSede(admin, device.organizationId, device.restaurantId),
      deviceIntro(admin, device),
    ]);
    return (
      <main className="lg-app">
        <section className="lg-card" aria-labelledby="lg-title">
          <div className="lg-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
            <img src="/brand/payo-mark.svg" alt={device.orgName} className="lg-logo" />
            <div className="lg-grow">
              <h1 id="lg-title" className="lg-h1">
                ¿Quién eres?
              </h1>
              <p className="lg-sub">{intro.line}</p>
            </div>
            <LoginClock tz={intro.tz} serverNow={nowInTz(intro.tz)} />
          </div>
          <Notices error={error} signedInAs={signedInAs} />
          <TeamLogin roster={roster.map(({ id, name, initials }) => ({ id, name, initials }))} next={next} />
        </section>
      </main>
    );
  }

  const showPair = sp.device === "1";
  return (
    <main className="lg-app">
      <section className="lg-card narrow" aria-labelledby="lg-title">
        <div className="lg-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
          <img src="/brand/payo-mark.svg" alt="" className="lg-logo" />
          <div className="lg-grow">
            <h1 id="lg-title" className="lg-h1">
              Entrar
            </h1>
            <p className="lg-sub">Con la cuenta que te dio el administrador.</p>
          </div>
        </div>
        <Notices error={error} signedInAs={signedInAs} />
        <GoogleSignInButton next={next} />
        <div className="lg-sep">o con contraseña</div>
        <PasswordForm next={next} />
        {/* Pairing is for the shop's tablet / register: hidden on phones unless asked for (?device=1). */}
        <Link href="/emparejar" className={`lg-link ${showPair ? "inline-flex" : "hidden md:inline-flex"}`}>
          ¿Es una tablet o la caja? Emparejar este dispositivo
        </Link>
      </section>
    </main>
  );
}

function Notices({ error, signedInAs }: { error: string | null; signedInAs: string | null }) {
  return (
    <>
      {error ? (
        <p role="alert" className="lg-alert">
          {error}
        </p>
      ) : null}
      {signedInAs ? (
        <div className="lg-note">
          <span className="lg-grow">
            Sesión abierta: <b>{signedInAs}</b>
          </span>
          {/* Its own form: never nested inside a login form. */}
          <form action={signOutLocal}>
            <button type="submit" className="lg-btn ghost sm">
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}

/**
 * «PAYO · Matutino empieza a las 6:00»: the sede plus the next turno of
 * today (or the one in progress). Best-effort — any failure leaves the name.
 */
async function deviceIntro(admin: SupabaseClient, device: PosDevice): Promise<{ line: string; tz: string }> {
  const sedeId = await resolveSedeId(admin, device.organizationId, device.restaurantId);
  if (!sedeId) return { line: device.orgName, tz: "America/Bogota" };
  const [{ data: sede }, { data: tpls }] = await Promise.all([
    admin.from("restaurants").select("name, timezone").eq("id", sedeId).maybeSingle<{ name: string; timezone: string | null }>(),
    admin.from("checklist_templates").select("name, inicio, fin, dias").eq("restaurant_id", sedeId).eq("active", true),
  ]);
  const tz = sede?.timezone ?? "America/Bogota";
  const name = sede?.name ?? device.orgName;
  const now = nowInTz(tz);
  const idx = todayIdxOf(todayInTz(tz));
  const today = ((tpls ?? []) as Array<{ name: string; inicio: string | null; fin: string | null; dias: boolean[] | null }>)
    .filter((t) => t.inicio && (!Array.isArray(t.dias) || t.dias[idx] !== false))
    .map((t) => ({ name: t.name, inicio: t.inicio!.slice(0, 5), fin: (t.fin ?? "").slice(0, 5) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const current = today.find((t) => t.inicio <= now && (!t.fin || now < t.fin));
  const upcoming = today.find((t) => t.inicio > now);
  const hm = (s: string) => s.replace(/^0(\d)/, "$1");
  if (current?.fin) return { line: `${name} · ${current.name} hasta las ${hm(current.fin)}`, tz };
  if (upcoming) return { line: `${name} · ${upcoming.name} empieza a las ${hm(upcoming.inicio)}`, tz };
  return { line: name, tz };
}
