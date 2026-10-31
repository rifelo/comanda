/**
 * SKU suggestion for «Nuevo producto». SKUs are `PREFIX-NNN` (BC-010, JU-001).
 * The prefix is the one the category already uses (most common among its
 * products); a category without products derives one from its name. The
 * number is the next free one for that prefix across every SKU. Pure.
 */

export function prefijoDeNombre(label: string): string {
  const leaf = label.split("·").pop()?.trim() ?? label;
  const words = leaf
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const raw = words.length >= 2 ? words.slice(0, 3).map((w) => w[0]).join("") : leaf.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3);
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "") || "PR";
}

function prefijoDe(sku: string): string | null {
  const m = sku.trim().toUpperCase().match(/^([A-Z0-9]+)-\d+$/);
  return m ? m[1] : null;
}

export function sugerirSku(input: { categoriaLabel: string | null; skusCategoria: ReadonlyArray<string>; todos: ReadonlyArray<string> }): string {
  const cuenta = new Map<string, number>();
  for (const s of input.skusCategoria) {
    const p = prefijoDe(s);
    if (p) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }
  const prefijo = [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? prefijoDeNombre(input.categoriaLabel ?? "Producto");
  const re = new RegExp(`^${prefijo}-(\\d+)$`);
  let max = 0;
  for (const s of input.todos) {
    const m = s.trim().toUpperCase().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}
