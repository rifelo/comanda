import Link from "next/link";
import { ensureTodayInstances, getTurnoBoard, loadTurnoContext } from "@/lib/turno/server";
import { TurnoBoard } from "./turno-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turno · co-manda" };

/**
 * Shared shift tablet: today's turnos of the sede, one card per puesto, each
 * person taps their name and works their checklist. Reachable by a paired
 * device (POS pairing cookie) or a signed-in user.
 */
export default async function TurnoPage() {
  const ctx = await loadTurnoContext();
  if (!ctx) return <TurnoUnpaired />;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.sede.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await ensureTodayInstances(ctx, date);
  const data = await getTurnoBoard(ctx);
  return <TurnoBoard data={data} mode={ctx.actor.kind} />;
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
