import Link from "next/link";
import { ensureTodayInstances, getTurnoBoard, loadTurnoGate } from "@/lib/turno/server";
import { nowInTz, todayInTz } from "@/lib/utils";
import { TurnoLogin } from "./_components/turno-login";
import { TurnoBoard } from "./turno-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turno · co-manda" };

/**
 * Shared shift tablet. A paired device (POS pairing cookie) fixes the sede;
 * the person in charge signs in with email + password and works today's
 * checklist under their own name. A signed-in admin on a laptop lands here
 * too, with their org's first sede.
 */
export default async function TurnoPage() {
  const gate = await loadTurnoGate();
  if (gate.kind === "unpaired") return <TurnoUnpaired />;
  if (gate.kind === "needs_login") return <TurnoLogin sedeName={gate.sede.name} error={gate.error} />;
  const { ctx } = gate;
  await ensureTodayInstances(ctx, todayInTz(ctx.sede.tz));
  const data = await getTurnoBoard(ctx);
  return <TurnoBoard data={data} actor={ctx.actor} serverNow={nowInTz(ctx.sede.tz)} />;
}

function TurnoUnpaired() {
  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 440, border: "1.5px solid var(--ink)", borderRadius: 10, padding: "28px 28px 24px", background: "var(--paper-lt)" }}>
        <div className="font-slab" style={{ fontSize: 28 }}>Turno<span style={{ color: "var(--red)" }}>.</span></div>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
          Esta tablet no está emparejada. Empareja el dispositivo con un código desde
          Configuración → Punto de venta, o inicia sesión.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Link href="/pos" className="cmd-btn" style={{ textDecoration: "none" }}>Emparejar en /pos →</Link>
          <Link href="/login?next=/turno" className="cmd-btn ghost" style={{ textDecoration: "none" }}>Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
