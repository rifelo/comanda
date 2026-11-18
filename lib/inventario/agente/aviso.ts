/**
 * The WhatsApp the tablet opens for the admin when a verification needs a
 * second check: who counted, each item with what they counted against what
 * the system said, and the link to decide (otro conteo · lo conté yo ·
 * aceptar).
 */
export function mensajeSegundaRevision(a: { quien: string; items: { name: string; contado: string; sistema: string | null }[]; link: string }): string {
  const lineas = a.items.map((i) => `• ${i.name}: contó ${i.contado}${i.sistema ? ` (el sistema decía ${i.sistema})` : ""}`);
  return [
    `Conteo de inventario · ${a.items.length === 1 ? "1 insumo necesita" : `${a.items.length} insumos necesitan`} segunda revisión`,
    `Contó: ${a.quien}`,
    "",
    ...lineas,
    "",
    `Revísalo aquí: ${a.link}`,
  ].join("\n");
}

/** wa.me number from the org's approvals phone (10 digits = Colombian mobile). */
export function waNumero(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 ? `57${d}` : d;
}
