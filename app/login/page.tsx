import { Wordmark } from "@/components/comanda/primitives";
import { GoogleSignInButton } from "./google-signin-button";
import { PasswordForm } from "./password-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="cmd-paper flex min-h-screen flex-col px-6 pt-16 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark size={56} className="tracking-[-0.02em]" />
        <p
          className="text-muted mt-3 leading-relaxed"
          style={{ fontSize: 12, letterSpacing: "0.04em" }}
        >
          Lista de actividades de cajero, en el bolsillo.
        </p>

        <div className="mt-14">
          <GoogleSignInButton next={sp.next} />
        </div>

        {sp.error ? (
          <p
            role="alert"
            className="mt-5 text-center"
            style={{
              color: "var(--red)",
              fontSize: 12,
              letterSpacing: "0.04em",
            }}
          >
            {decodeURIComponent(sp.error)}
          </p>
        ) : null}

        <div className="mt-8 flex items-center gap-3" aria-hidden>
          <span style={{ flex: 1, borderTop: "1px solid var(--rule)" }} />
          <span className="text-muted" style={{ fontSize: 10, letterSpacing: "0.16em" }}>O CON CONTRASEÑA</span>
          <span style={{ flex: 1, borderTop: "1px solid var(--rule)" }} />
        </div>
        <div className="mt-4">
          <PasswordForm next={sp.next} />
        </div>

        <p
          className="text-muted mt-6 text-center"
          style={{ fontSize: 11, letterSpacing: "0.04em", lineHeight: 1.5 }}
        >
          Usa el mismo correo que te dio tu administrador: con Google, o con
          la contraseña que te entregó.
        </p>

        <div
          className="mt-auto pt-12 text-center text-muted"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          <span>co-manda · operación interna</span>
        </div>
      </div>
    </main>
  );
}
