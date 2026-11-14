/**
 * Pure helpers for the «Ver detalle» of a Pedidos card (app/pos/_components/
 * ordenes.tsx): order type words, the options chosen on a line, and the
 * reason a cancelled order carries in its notes. Unit-tested in detalle.test.ts.
 */
import type { ModSelection, OrderType, PosModGroup } from "./types";

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  aqui: "Para tomar aquí",
  llevar: "Para llevar",
  domicilio: "Domicilio",
};

/**
 * The options chosen on a stored line, as «Grupo: opción» («Leche:
 * Deslactosada»), several options of one group joined with commas. A group no
 * longer in the catalog still shows its option names, without the group.
 */
export function modLabels(mods: ModSelection | null | undefined, groups: Readonly<Record<string, Pick<PosModGroup, "name"> | undefined>>): string[] {
  const out: string[] = [];
  for (const [gid, sel] of Object.entries(mods ?? {})) {
    const names = (Array.isArray(sel) ? sel : sel ? [sel] : []).map((n) => n.trim()).filter(Boolean);
    if (!names.length) continue;
    const g = groups[gid]?.name?.trim();
    out.push(g ? `${g}: ${names.join(", ")}` : names.join(", "));
  }
  return out;
}

/**
 * The options line of a cup's drink label: only what departs from the usual
 * drink — a single choice that is not its group's first (default) option, and
 * every extra — joined
 * with « · » («Deslactosada · En leche»). The barista and the customer see
 * what makes this cup different; a plain drink prints nothing.
 */
export function cupOptionsLine(
  mods: ModSelection | null | undefined,
  groups: Readonly<Record<string, Pick<PosModGroup, "options"> | undefined>>,
): string {
  const out: string[] = [];
  for (const [gid, sel] of Object.entries(mods ?? {})) {
    // a single choice has a default (the group's first option); extras (a list) never do
    const first = Array.isArray(sel) ? undefined : groups[gid]?.options?.[0]?.name?.trim();
    for (const n of Array.isArray(sel) ? sel : sel ? [sel] : []) {
      const name = n.trim();
      if (name && name !== first) out.push(name);
    }
  }
  return out.join(" · ");
}

/**
 * The reason on a cancelled order: cancelarPendiente prepends «Cancelado:
 * <motivo>» to the notes (lib/pos/pagos.ts cancelNotes), followed by « · » and
 * the order's own note. "" when the order was cancelled without a reason.
 */
export function cancelMotivo(notes: string | null | undefined): string {
  const m = /^Cancelado: (.+?)(?: · |$)/.exec((notes ?? "").trim());
  return m ? m[1].trim() : "";
}
