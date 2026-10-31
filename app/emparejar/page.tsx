import "../login/login.css";
import Link from "next/link";
import { getPosDeviceFromCookie } from "@/lib/pos/devices";
import { EmparejarForm } from "./emparejar-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emparejar dispositivo · Comanda" };

/**
 * Pair the shop's tablet or register with a sede (code of 8 characters from
 * Ajustes → Dispositivos). Public: the code is the credential. Pairing only
 * says *which sede*; who is working is always chosen on /login afterwards.
 */
export default async function EmparejarPage() {
  const device = await getPosDeviceFromCookie();
  return (
    <main className="lg-app">
      <section className="lg-card narrow" aria-labelledby="em-title">
        <div className="lg-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/brand/payo-mark.svg" alt="" className="lg-logo" />
          <div className="lg-grow">
            <h1 id="em-title" className="lg-h1">
              Emparejar este dispositivo
            </h1>
            <p className="lg-sub">Para la tablet del turno o la caja.</p>
          </div>
        </div>
        {device ? (
          <div className="lg-note">
            <span className="lg-grow">
              Ya está emparejado como <b>{device.name}</b> ({device.orgName}). Un código nuevo lo cambia.
            </span>
            <Link href="/login" className="lg-btn ghost sm">
              Ir a entrar
            </Link>
          </div>
        ) : null}
        <EmparejarForm />
        <Link href="/login" className="lg-link inline-flex">
          ← Volver a entrar
        </Link>
      </section>
    </main>
  );
}
