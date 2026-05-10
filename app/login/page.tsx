import Link from "next/link";
import { Wordmark } from "@/components/comanda/primitives";
import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: "signup" }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: "signup" }>;
}) {
  const sp = await searchParams;
  const isSignup = sp.mode === "signup";
  return (
    <main className="cmd-paper flex min-h-screen flex-col px-6 pt-16 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark size={56} className="tracking-[-0.02em]" />
        <p
          className="text-muted mt-3 leading-relaxed"
          style={{ fontSize: 12, letterSpacing: "0.04em" }}
        >
          {isSignup
            ? "Crea tu organización y empieza a digitalizar la operación de tus restaurantes."
            : "Lista de actividades de cajero, en el bolsillo."}
        </p>

        <div className="mt-12">
          <LoginForm mode={isSignup ? "signup" : "signin"} next={sp.next} />
        </div>

        <p
          className="text-muted mt-8 text-center"
          style={{ fontSize: 11, letterSpacing: "0.04em" }}
        >
          {isSignup ? (
            <>
              ¿Ya tienes cuenta?{" "}
              <Link className="cmd-link" href="/login">
                Inicia sesión
              </Link>
            </>
          ) : (
            <>
              ¿Primera vez?{" "}
              <Link className="cmd-link" href="/login?mode=signup">
                Crea tu organización
              </Link>
            </>
          )}
        </p>

        <div
          className="mt-auto pt-12 text-center text-muted"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          <span>Comanda · operación interna</span>
        </div>
      </div>
    </main>
  );
}
