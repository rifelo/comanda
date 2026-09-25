import Link from "next/link";
import type { CajaCierre } from "@/lib/types";
import { posMoney } from "@/lib/pos/types";
import { fraseFaltantes } from "@/lib/inventario/faltantes";

const CAJA_STATUS: Record<CajaCierre["status"], { label: string; color: string }> = {
  pendiente: { label: "enviado · por aprobar", color: "var(--amber)" },
  aprobado: { label: "aprobado", color: "var(--green)" },
  rechazado: { label: "rechazado · contar de nuevo", color: "var(--red)" },
};

/**
 * The two tools a person opens from their shift screen: the arqueo of this
 * turno and the quick inventory of the sede. Each tile shows its current
 * state so the screen doubles as the reminder.
 */
export function ShiftTools({ shiftId, cierre, faltantes, hasCajaTask, basePorValidar }: {
  shiftId: string;
  cierre: CajaCierre | null;
  faltantes: { agotado: number; bajo: number };
  hasCajaTask: boolean;
  /** The base the previous close left, not yet validated by this turno (0039). */
  basePorValidar?: CajaCierre | null;
}) {
  const cajaTone = basePorValidar ? "var(--amber)" : cierre ? (cierre.base_confirmada_at ? CAJA_STATUS[cierre.status].color : "var(--amber)") : hasCajaTask ? "var(--red)" : "var(--muted)";
  const cajaState = basePorValidar
    ? `validar base de apertura: ${posMoney(basePorValidar.base_dejada_cop)}`
    : cierre
      ? `${CAJA_STATUS[cierre.status].label} · contado ${posMoney(cierre.contado_cop)}${cierre.base_confirmada_at ? "" : " · falta confirmar la base"}`
      : hasCajaTask
        ? "pendiente · se hace al cerrar"
        : "sin cierre todavía";
  const faltan = fraseFaltantes(faltantes);
  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px dashed var(--rule)" }}>
      <div className="text-muted mb-2" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>Herramientas del turno</div>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
        <Tile href={`/shift/${shiftId}/caja`} title="Caja · arqueo" state={cajaState} tone={cajaTone} hint={basePorValidar ? "Cuenta la base que dejaron y confirma que está correcta." : "Cuenta el efectivo, deja la base de mañana."} />
        <Tile
          href={`/shift/${shiftId}/inventario`}
          title="Faltantes · inventario rápido"
          state={faltan ? `reportados: ${faltan}` : "nada reportado como faltante"}
          tone={faltantes.agotado ? "var(--red)" : faltantes.bajo ? "var(--amber)" : "var(--muted)"}
          hint="Toca hay / poco / se acabó en los ítems prioritarios."
        />
      </div>
    </div>
  );
}

function Tile({ href, title, state, tone, hint }: { href: string; title: string; state: string; tone: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex items-center"
      style={{ gap: 12, minHeight: 64, padding: "10px 14px", border: "1.5px solid var(--ink)", borderRadius: 6, background: "var(--paper-lt)", textDecoration: "none", color: "var(--ink)" }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: tone, marginTop: 3, fontWeight: 600 }}>{state}</div>
        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>
      </div>
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>→</span>
    </Link>
  );
}
