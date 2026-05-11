import { Wordmark } from "@/components/comanda/primitives";
import { GoogleSignInButton } from "./google-signin-button";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
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

        <p
          className="text-muted mt-6 text-center"
          style={{ fontSize: 11, letterSpacing: "0.04em", lineHeight: 1.5 }}
        >
          Inicia sesión con tu cuenta de Google. Si tu administrador te asignó
          a un restaurante, usa el mismo correo que te dio.
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
