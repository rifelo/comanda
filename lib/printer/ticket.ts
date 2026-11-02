import { z } from "zod";

/**
 * Paper tickets for the 80 mm receipt printer (DigitalPOS DIG-E200I on the
 * register, installed as a Windows printer): the customer's receipt and the
 * barista's comanda.
 *
 * A ticket is data first (TicketDoc), so a tablet with no printer can relay
 * it through pos_print_jobs like the labels; the station that prints turns it
 * into a small HTML page (renderTicketHtml) and hands it to the browser's
 * print — silent when Edge runs with --kiosk-printing and the DIG-E200I is
 * the default printer.
 */
const text = (max: number) => z.string().max(max);

const TicketLineSchema = z.object({
  qty: z.number().int().min(1).max(999),
  name: text(120),
  /** Chosen options (size, milk…), already as words. */
  mods: z.array(text(60)).max(12),
  /** Person the line is for, when the order has several. */
  customer: text(60).optional(),
  /** Line total (qty × unit with options); receipts only. */
  total: z.number().int().optional(),
});
export type TicketLine = z.infer<typeof TicketLineSchema>;

export const TicketDocSchema = z.object({
  kind: z.enum(["recibo", "comanda"]),
  folio: text(24),
  /** When the order was taken (ISO). */
  at: text(40),
  orgName: text(120),
  /** Receipt header lines under the name (NIT, address, phone…). */
  encabezado: text(300).nullable().optional(),
  /** Receipt footer («¡Gracias…!», wifi, Instagram…). */
  pie: text(200).nullable().optional(),
  customer: text(120).optional(),
  orderType: z.enum(["aqui", "llevar", "domicilio"]).optional(),
  seLoLlevamos: z.boolean().optional(),
  sinGluten: z.boolean().optional(),
  note: text(400).optional(),
  barista: text(80).optional(),
  lines: z.array(TicketLineSchema).min(1).max(80),
  total: z.number().int().optional(),
  /** Payment method label («Efectivo»…); absent = not paid yet. */
  method: text(40).optional(),
  tendered: z.number().int().nullable().optional(),
  change: z.number().int().optional(),
  approval: text(40).nullable().optional(),
  /** Sent to pay later («pagar después» / transfer not seen yet). */
  pendiente: z.boolean().optional(),
  porVerificar: z.boolean().optional(),
  /** Printed again (from Pedidos or the receipt screen). */
  copia: z.boolean().optional(),
});
export type TicketDoc = z.infer<typeof TicketDocSchema>;

// ── formatting (deterministic: no ICU differences between devices) ──
export function pesos(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «31 oct 2026 · 22:31» in Bogotá time (UTC−5, no DST). */
export function fechaBogota(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 5 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hh}:${mm}`;
}
function horaBogota(iso: string): string {
  return fechaBogota(iso).split(" · ")[1] ?? "";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Lines grouped by person, in first-appearance order; "" = nobody in particular. */
function porPersona(lines: TicketLine[]): Array<{ who: string; lines: TicketLine[] }> {
  const groups: Array<{ who: string; lines: TicketLine[] }> = [];
  for (const l of lines) {
    const who = l.customer?.trim() ?? "";
    let g = groups.find((x) => x.who === who);
    if (!g) groups.push((g = { who, lines: [] }));
    g.lines.push(l);
  }
  return groups;
}

// ── HTML ────────────────────────────────────────────────────────
/**
 * 80 mm roll, 72 mm printable. The page takes the width the driver reports
 * (the DIG-E200I / Gainscha driver says 72 mm): forcing an 80 mm page made the
 * browser lay out wider than the head and the right edge was lost. Pure black
 * on white, no images: a thermal head turns greys into dither. Sizes in pt so
 * the driver's DPI doesn't matter.
 */
const CSS = `
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: 100%; max-width: 72mm; padding: 1mm 2mm 8mm; font: 10.5pt/1.3 Arial, Helvetica, sans-serif; }
.c { text-align: center; }
.b { font-weight: 700; }
.s { font-size: 9pt; }
.xs { font-size: 8pt; }
.org { font-size: 17pt; font-weight: 800; line-height: 1.1; margin-bottom: 1mm; }
.pre { white-space: pre-line; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
hr.solid { border-top: 2px solid #000; }
table { width: 100%; border-collapse: collapse; }
td { vertical-align: top; padding: 0.6mm 0; }
td.q { width: 9mm; font-weight: 700; }
td.r { text-align: right; white-space: nowrap; padding-left: 2mm; }
.mods { font-size: 9pt; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.tot { font-size: 16pt; font-weight: 800; }
.tag { display: inline-block; border: 2px solid #000; padding: 0.4mm 1.6mm; margin: 0.6mm 0.6mm 0 0; font-weight: 800; font-size: 10pt; }
.tag.inv { background: #000; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.folio { font-size: 30pt; font-weight: 800; line-height: 1; }
.who { font-size: 17pt; font-weight: 800; line-height: 1.15; }
.persona { font-size: 12pt; font-weight: 800; margin-top: 2mm; border-bottom: 1px solid #000; }
.item { font-size: 13pt; font-weight: 700; line-height: 1.2; margin-top: 1.4mm; }
.item .qn { display: inline-block; min-width: 9mm; font-size: 15pt; font-weight: 800; }
.item .mods { font-size: 10.5pt; font-weight: 400; padding-left: 9mm; }
.logo { display: block; width: 46mm; height: auto; margin: 0 auto 1.5mm; }
.note { border: 2px solid #000; padding: 1.2mm 1.6mm; margin-top: 2mm; font-size: 11pt; font-weight: 700; white-space: pre-line; }
`;

/**
 * 58 mm roll in the 80 mm printer (what PA'YO has loaded): the head still
 * draws 72 mm, but only part of the page lands on the paper. Measured on the
 * DIG-E200I (ruler + photos, 1-nov-2026): the text sits in a 47 mm column
 * from 13 to 60 mm, which leaves room for the roll drifting a little to one
 * side. One size smaller than on 80 mm.
 */
const CSS_58 = `
body { width: 72mm; max-width: none; padding: 1mm 12mm 8mm 13mm; font-size: 9.5pt; }
.org { font-size: 14pt; }
.s, .mods { font-size: 8.5pt; }
.xs { font-size: 7.5pt; }
td.q { width: 7mm; }
td.r { padding-left: 1.5mm; }
.tot { font-size: 13pt; }
.tag { font-size: 9pt; padding: 0.3mm 1.2mm; }
.folio { font-size: 24pt; }
.who { font-size: 14pt; }
.persona { font-size: 10.5pt; }
.item { font-size: 11pt; }
.item .qn { min-width: 7mm; font-size: 13pt; }
.item .mods { font-size: 9.5pt; padding-left: 7mm; }
.note { font-size: 10pt; }
.logo { width: 38mm; }
`;

/** Paper roll on the printer: 80 mm (full width) or 58 mm. */
export type Papel = "80" | "58";

export interface TicketPrintOptions {
  papel?: Papel;
  /** One-ink logo as a data: URI (or URL) for the top of the receipt. */
  logo?: string | null;
}

function page(title: string, body: string, papel: Papel): string {
  const css = papel === "58" ? CSS + CSS_58 : CSS;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

function reciboBody(d: TicketDoc, logo: string | null): string {
  const out: string[] = [];
  out.push(logo
    ? `<img class="logo" src="${esc(logo)}" alt="${esc(d.orgName)}">`
    : `<div class="c org">${esc(d.orgName)}</div>`);
  if (d.encabezado?.trim()) out.push(`<div class="c s pre">${esc(d.encabezado.trim())}</div>`);
  out.push(`<hr>`);
  out.push(`<div class="row b"><span>Pedido #${esc(d.folio)}</span>${d.copia ? `<span>COPIA</span>` : ""}</div>`);
  out.push(`<div class="s">${esc(fechaBogota(d.at))}</div>`);
  if (d.customer?.trim()) out.push(`<div class="s">Cliente: ${esc(d.customer.trim())}</div>`);
  out.push(`<hr>`);
  out.push(`<table>`);
  for (const l of d.lines) {
    const mods = l.mods.length ? `<div class="mods">${esc(l.mods.join(" · "))}</div>` : "";
    const total = l.total != null ? pesos(l.total) : "";
    out.push(`<tr><td class="q">${l.qty}×</td><td>${esc(l.name)}${mods}</td><td class="r">${total}</td></tr>`);
  }
  out.push(`</table>`);
  out.push(`<hr class="solid">`);
  if (d.total != null) out.push(`<div class="row tot"><span>TOTAL</span><span>${pesos(d.total)}</span></div>`);
  if (d.pendiente) {
    out.push(`<div class="c" style="margin-top:2mm"><span class="tag inv">${d.porVerificar ? "TRANSFERENCIA POR VERIFICAR" : "PENDIENTE DE PAGO"}</span></div>`);
  } else if (d.method) {
    out.push(`<div class="row" style="margin-top:1mm"><span>Pago</span><span class="b">${esc(d.method)}</span></div>`);
    if (d.tendered != null && d.tendered > 0) out.push(`<div class="row"><span>Recibido</span><span>${pesos(d.tendered)}</span></div>`);
    if (d.change != null && d.change > 0) out.push(`<div class="row b"><span>Cambio</span><span>${pesos(d.change)}</span></div>`);
    if (d.approval?.trim()) out.push(`<div class="row s"><span>Aprobación</span><span>${esc(d.approval.trim())}</span></div>`);
  }
  out.push(`<hr>`);
  out.push(`<div class="c b pre">${esc(d.pie?.trim() || "¡Gracias por tu visita!")}</div>`);
  out.push(`<div class="c xs" style="margin-top:2mm">Comprobante de venta · no es factura electrónica</div>`);
  return out.join("");
}

function comandaBody(d: TicketDoc): string {
  const out: string[] = [];
  out.push(`<div class="row s b"><span>COMANDA${d.copia ? " · COPIA" : ""}</span><span>${esc(horaBogota(d.at))}</span></div>`);
  out.push(`<div class="folio">#${esc(d.folio)}</div>`);
  if (d.customer?.trim()) out.push(`<div class="who">Pa' ${esc(d.customer.trim())}</div>`);
  const tags: string[] = [];
  if (d.seLoLlevamos) tags.push(`<span class="tag inv">SE LO LLEVAMOS</span>`);
  if (d.orderType === "llevar") tags.push(`<span class="tag inv">PARA LLEVAR</span>`);
  if (d.orderType === "domicilio") tags.push(`<span class="tag inv">DOMICILIO</span>`);
  if (d.sinGluten) tags.push(`<span class="tag">SIN GLUTEN</span>`);
  if (tags.length) out.push(`<div style="margin-top:1mm">${tags.join("")}</div>`);
  out.push(`<hr class="solid">`);
  const groups = porPersona(d.lines);
  const named = groups.length > 1 || (groups[0]?.who ?? "") !== "";
  for (const g of groups) {
    if (named) out.push(`<div class="persona">${g.who ? `Pa' ${esc(g.who)}` : "Sin nombre"}</div>`);
    for (const l of g.lines) {
      const mods = l.mods.length ? `<div class="mods">${esc(l.mods.join(" · "))}</div>` : "";
      out.push(`<div class="item"><span class="qn">${l.qty}</span>${esc(l.name)}${mods}</div>`);
    }
  }
  if (d.note?.trim()) out.push(`<div class="note">${esc(d.note.trim())}</div>`);
  out.push(`<hr>`);
  const pie = [
    d.barista ? `Prepara: ${esc(d.barista)}` : null,
    d.pendiente ? (d.porVerificar ? "Transferencia por verificar" : "Pendiente de pago") : d.method ? "Pagado" : null,
  ].filter(Boolean);
  if (pie.length) out.push(`<div class="row s"><span>${pie[0]}</span><span class="b">${pie[1] ?? ""}</span></div>`);
  return out.join("");
}

export function renderTicketHtml(d: TicketDoc, opts: TicketPrintOptions = {}): string {
  const papel = opts.papel ?? "80";
  return d.kind === "recibo"
    ? page(`Recibo ${d.folio}`, reciboBody(d, opts.logo ?? null), papel)
    : page(`Comanda ${d.folio}`, comandaBody(d), papel);
}
