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
 * The reason on a cancelled order: cancelarPendiente prepends «Cancelado:
 * <motivo>» to the notes (lib/pos/pagos.ts cancelNotes), followed by « · » and
 * the order's own note. "" when the order was cancelled without a reason.
 */
export function cancelMotivo(notes: string | null | undefined): string {
  const m = /^Cancelado: (.+?)(?: · |$)/.exec((notes ?? "").trim());
  return m ? m[1].trim() : "";
}
