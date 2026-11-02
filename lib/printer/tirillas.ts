/**
 * Las dos tirillas térmicas de 80 mm de Café Pa' Yo, del canvas «Etiquetas
 * Café Pa' Yo» (artboards Precuenta y Comanda de barra, dibujados a 4×:
 * 1210 px = 80 mm). Aquí todo va a 1×: cada medida del canvas ÷ 4, en px CSS.
 *
 *   · renderPrecuentaHtml(PrecuentaData)   — la del cliente.
 *   · renderComandaBarraHtml(ComandaData)  — la de la barra, con la receta de
 *     cada bebida (del catálogo por SKU, nunca escrita por pedido). Comida y
 *     botellas salen al final, sin receta, solo para revisar que el pedido
 *     esté completo.
 *
 * Son funciones puras que devuelven una página HTML: la imprime un iframe
 * oculto con window.print() (lib/printer/tickets.ts). La página NO fuerza
 * `size: 80mm`: el driver de la DIG-E200I dice 72 mm imprimibles y forzar
 * 80 mm cortaba el borde derecho (1-nov-2026). Una sola tinta: todo negro
 * #1f1e1a sobre blanco, sin grises.
 *
 * Tipografías del canvas: Dela Gothic One (nombre, bebida, total), Nority
 * Display (rótulos, ×2, frase) y Delight Light/Bold (texto). Se sirven desde
 * /labels/fonts (las mismas que ya usan las etiquetas, precargadas por el SW
 * del POS para imprimir sin internet).
 */

// ── datos (el JSON del spec) ─────────────────────────────────────
export interface TirillaMarca {
  /** «Café Pa'Yo» en Nority, debajo del ícono. */
  nombre: string;
  /** Ícono a una tinta (data: URI o URL). Sin ícono = solo el nombre. */
  logo?: string | null;
  /** «Yopal, Casanare · @cafepayo · cafepayo.com» (una o varias líneas). */
  encabezado?: string | null;
  /** La frase del cierre; vacía = «Tómalo con calma.». */
  pie?: string | null;
}

export interface PrecuentaItem {
  cantidad: number;
  nombre: string;
  /** Opciones elegidas (leche de avena…), ya en palabras. */
  detalle?: string[];
  /** Precio de una unidad con sus opciones (para «2 × $7.000»). */
  unitario?: number;
  total: number;
}

export interface PrecuentaData {
  marca: TirillaMarca;
  /** Nombre del cliente («Pa' Franchesco»). Vacío = sin el bloque del nombre. */
  cliente?: string;
  /** El café es de autoservicio: sin mesa casi siempre (no se imprime). */
  mesa?: string;
  /** «#A-1263». */
  pedido: string;
  /** «01 nov 2026». */
  fecha: string;
  /** «4:32 p. m.». */
  hora: string;
  items: PrecuentaItem[];
  subtotal: number;
  total: number;
  /** Ya pagada: método y vueltas (va debajo del total). */
  pago?: { metodo: string; recibido?: number | null; cambio?: number; aprobacion?: string | null };
  /** Enviada para pagar después / transferencia sin confirmar. */
  estado?: "pendiente" | "por-verificar";
  copia?: boolean;
}

export interface ComandaPaso {
  /** «Espresso doble» (en negrita). */
  titulo: string;
  /** «18 g → 36 g en 25–30 s». */
  detalle?: string;
}

/** One ingredient with its amount: what the bar reads first. */
export interface ComandaProporcion {
  /** «18 g», «150 ml», «1». */
  cantidad: string;
  /** «Café», «Leche entera». */
  nombre: string;
  /** «Espresso doble», «Cold foam» (small, after the name). */
  nota?: string;
}

export interface ComandaBebida {
  nombre: string;
  cantidad: number;
  modificadores: string[];
  /** Para quién es, cuando el pedido trae varias personas. */
  cliente?: string;
  /** Ingredients with amounts, in recipe order. The heart of the comanda. */
  proporciones?: ComandaProporcion[];
  /** «Vaso 12 oz doble pared · Tapa domo». */
  envase?: string;
  /** Only when the recipe has no ingredient lines: the written steps. */
  pasos: ComandaPaso[];
}

export interface ComandaOtro {
  nombre: string;
  cantidad: number;
  modificadores: string[];
  cliente?: string;
}

export interface ComandaData {
  marca: TirillaMarca;
  pedido: string;
  hora: string;
  cliente?: string;
  barista?: string;
  bebidas: ComandaBebida[];
  /** Postres, salados y botellas: se listan sin receta para cuadrar el pedido. */
  otros?: ComandaOtro[];
  /** SE LO LLEVAMOS, PARA LLEVAR, SIN GLUTEN… */
  avisos?: string[];
  nota?: string;
  /** «Pendiente de pago» / «Transferencia por verificar». */
  estado?: string;
  copia?: boolean;
}

// ── formato (determinista: sin diferencias de ICU entre equipos) ──
export function pesos(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const bogota = (iso: string): Date | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t - 5 * 3600_000); // UTC−5, sin horario de verano
};
/** «01 nov 2026» en hora de Bogotá. */
export function fechaCorta(iso: string): string {
  const d = bogota(iso);
  if (!d) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** «4:32 p. m.» en hora de Bogotá. */
export function hora12(iso: string): string {
  const d = bogota(iso);
  if (!d) return "";
  const h = d.getUTCHours();
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${mm} ${h < 12 ? "a. m." : "p. m."}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * «Espresso doble: 18 g → 36 g» / «Espresso doble · 18 g…» / «… — …» → título
 * en negrita + detalle. Una línea sin separador (una frase de Recetas: «Pon
 * 100 g de hielo…») queda como título sin detalle y se imprime en texto normal.
 */
export function paso(linea: string): ComandaPaso {
  const m = /^(.{2,60}?)\s*(?::|·|—|–\s)\s*(.+)$/.exec(linea.trim());
  return m ? { titulo: m[1].trim(), detalle: m[2].trim() } : { titulo: linea.trim() };
}

// ── estilos ─────────────────────────────────────────────────────
export const TIRILLA_FONTS = [
  "/labels/fonts/dela-gothic-one.woff2",
  "/labels/fonts/nority-display.woff2",
  "/labels/fonts/nority-slanted.woff2",
  "/labels/fonts/delight-light.woff2",
  "/labels/fonts/delight-bold.woff2",
] as const;
/** Las manos del cierre (la comanda ya no lleva ilustración). */
export const TIRILLA_ART = ["/labels/mano-taza-asa.svg", "/labels/mano-taza.svg"] as const;
export const TIRILLA_ASSETS: readonly string[] = [...TIRILLA_FONTS, ...TIRILLA_ART];

const INK = "#1f1e1a";
const CSS = `
@font-face{font-family:"Dela Gothic One";src:url("${TIRILLA_FONTS[0]}") format("woff2");font-weight:400}
@font-face{font-family:"Nority Display";src:url("${TIRILLA_FONTS[1]}") format("woff2");font-weight:400;font-style:normal}
@font-face{font-family:"Nority Display";src:url("${TIRILLA_FONTS[2]}") format("woff2");font-weight:400;font-style:italic}
@font-face{font-family:"Delight";src:url("${TIRILLA_FONTS[3]}") format("woff2");font-weight:300}
@font-face{font-family:"Delight";src:url("${TIRILLA_FONTS[4]}") format("woff2");font-weight:700}
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: ${INK}; }
body { width: 100%; max-width: 72mm; padding: 0 1mm 6mm; font-family: "Delight", system-ui, "Segoe UI", sans-serif; font-weight: 300;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.dela { font-family: "Dela Gothic One", "Arial Black", sans-serif; font-weight: 400; }
.nority { font-family: "Nority Display", "Arial Black", sans-serif; font-weight: 400; text-transform: uppercase; }
.b { font-weight: 700; }
.cut { border-top: 1px dashed ${INK}; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 5px; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid2 > :nth-child(even) { text-align: right; }
.nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip { display: inline-block; padding: 1.5px 4.5px; border: 1px solid ${INK}; font-size: 9px; line-height: 11px; font-weight: 700; margin: 0 3px 3px 0; }
.chip.inv { background: ${INK}; color: #fff; }
.box { flex: 0 0 11px; height: 11px; margin-top: 0.5px; border: 1px solid ${INK}; }
.chip.big { font-size: 13px; line-height: 16px; padding: 2px 6px; border-width: 2px; }
.cut2 { border-top: 2px solid ${INK}; }
.copia { text-align: center; font-weight: 700; font-size: 9px; letter-spacing: 1px; margin-top: 4px; }
`;

/** 58 mm roll in the 80 mm printer: the same tirilla, smaller, inside the band that lands on the paper. */
const CSS_58 = `body { max-width: none; width: 72mm; padding: 0 12mm 6mm 13mm; } body > main { zoom: 0.66; }`;

export type Papel = "80" | "58";

function page(title: string, body: string, papel: Papel): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${papel === "58" ? CSS_58 : ""}</style></head><body><main>${body}</main></body></html>`;
}

function lineas(s: string | null | undefined): string {
  return (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(esc).join("<br>");
}

// ── precuenta ───────────────────────────────────────────────────
export function renderPrecuentaHtml(d: PrecuentaData, papel: Papel = "80"): string {
  const o: string[] = [];
  const m = d.marca;
  // Marca: ícono 75 px, nombre en Nority, dirección/redes en Delight Light.
  o.push(`<div style="display:flex;flex-direction:column;align-items:center;gap:5.5px;padding-top:4px;text-align:center">`);
  if (m.logo) o.push(`<img src="${esc(m.logo)}" alt="" style="width:75px;height:auto;display:block">`);
  o.push(`<span class="nority" style="font-size:15px;line-height:15px;letter-spacing:1px">${esc(m.nombre)}</span>`);
  if (m.encabezado?.trim()) o.push(`<span style="font-size:9px;line-height:10.5px;letter-spacing:.25px">${lineas(m.encabezado)}</span>`);
  o.push(`</div>`);
  if (d.copia) o.push(`<div class="copia">COPIA</div>`);
  o.push(`<div class="cut" style="margin-top:14px"></div>`);

  // Pa' nombre
  if (d.cliente?.trim()) {
    o.push(`<div style="margin-top:12px;display:flex;flex-direction:column;gap:1px">`);
    o.push(`<span class="nority" style="font-style:italic;font-size:10px;line-height:10px;letter-spacing:.5px">Pa'</span>`);
    o.push(`<span class="dela nowrap" style="font-size:22px;line-height:24px;text-transform:capitalize">${esc(d.cliente.trim())}</span>`);
    o.push(`</div>`);
  }
  o.push(`<div class="grid2" style="margin-top:${d.cliente?.trim() ? 9 : 12}px;gap:2.5px 6px;font-size:9.5px;line-height:11.5px">`);
  // Mesa | Pedido como en el canvas; sin mesa (autoservicio) el pedido pasa a la izquierda.
  o.push(d.mesa?.trim()
    ? `<span>Mesa ${esc(d.mesa.trim())}</span><span>Pedido ${esc(d.pedido)}</span>`
    : `<span>Pedido ${esc(d.pedido)}</span><span></span>`);
  o.push(`<span>${esc(d.fecha)}</span><span>${esc(d.hora)}</span></div>`);
  o.push(`<div class="cut" style="margin-top:12px"></div>`);

  // Productos: cantidad · nombre (+ opciones / «2 × $7.000») · total
  o.push(`<div style="margin-top:11px;display:flex;flex-direction:column;gap:7.5px">`);
  for (const it of d.items) {
    const sub: string[] = [];
    if (it.detalle?.length) sub.push(esc(it.detalle.join(" · ")));
    if (it.cantidad > 1 && it.unitario != null) sub.push(`${it.cantidad} × ${pesos(it.unitario)}`);
    o.push(`<div style="display:flex;align-items:flex-start;gap:5px">`);
    o.push(`<span style="flex:0 0 17.5px;font-size:10.5px;line-height:13px">${it.cantidad}</span>`);
    o.push(`<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:.5px"><span class="b" style="font-size:11px;line-height:13px">${esc(it.nombre)}</span>`);
    for (const s of sub) o.push(`<span style="font-size:9px;line-height:10.5px">${s}</span>`);
    o.push(`</div><span class="b" style="flex:0 0 auto;font-size:11px;line-height:13px;text-align:right">${pesos(it.total)}</span></div>`);
  }
  o.push(`</div>`);
  o.push(`<div class="cut" style="margin-top:11px"></div>`);

  // Subtotal y total
  const n = d.items.reduce((s, it) => s + it.cantidad, 0);
  o.push(`<div class="row" style="margin-top:10px;font-size:10px;line-height:12px"><span>${n} ${n === 1 ? "producto" : "productos"}</span><span>Subtotal ${pesos(d.subtotal)}</span></div>`);
  o.push(`<div class="row" style="margin-top:6px"><span class="dela" style="font-size:13px;line-height:15px">Total</span><span class="dela" style="font-size:22px;line-height:24px">${pesos(d.total)}</span></div>`);
  if (d.estado) {
    o.push(`<div style="margin-top:6px;text-align:center"><span class="chip inv" style="font-size:10px;line-height:13px;padding:2px 6px">${d.estado === "por-verificar" ? "TRANSFERENCIA POR VERIFICAR" : "PENDIENTE DE PAGO"}</span></div>`);
  } else if (d.pago) {
    const p = d.pago;
    o.push(`<div style="margin-top:6px;display:flex;flex-direction:column;gap:1px;font-size:9.5px;line-height:11.5px">`);
    o.push(`<div class="row"><span>Pago</span><span class="b">${esc(p.metodo)}</span></div>`);
    if (p.recibido != null && p.recibido > 0) o.push(`<div class="row"><span>Recibido</span><span>${pesos(p.recibido)}</span></div>`);
    if (p.cambio != null && p.cambio > 0) o.push(`<div class="row b"><span>Cambio</span><span>${pesos(p.cambio)}</span></div>`);
    if (p.aprobacion?.trim()) o.push(`<div class="row"><span>Aprobación</span><span>${esc(p.aprobacion.trim())}</span></div>`);
    o.push(`</div>`);
  }
  o.push(`<div class="cut" style="margin-top:12px"></div>`);

  // Cierre: mano con taza + frase en Nority
  o.push(`<div style="margin-top:13px;display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center">`);
  o.push(`<img src="${TIRILLA_ART[0]}" alt="" style="width:82.5px;height:auto;display:block">`);
  o.push(`<span class="nority" style="font-size:18px;line-height:18px;letter-spacing:.5px">${lineas(m.pie?.trim() || "Tómalo con calma.")}</span>`);
  o.push(`</div>`);
  o.push(`<div style="margin-top:14px;text-align:center;font-size:8px;line-height:10px">${d.pago && !d.estado ? "Comprobante de venta" : "Precuenta"} · no es factura de venta</div>`);
  return page(`Precuenta ${d.pedido}`, o.join(""), papel);
}

// ── comanda de barra ────────────────────────────────────────────
/**
 * Made to be read in a second from arm's length at the bar (owner, 1-nov-2026:
 * «simpler, bigger text, understand the proportions faster»): big order
 * number and name, then per drink its options as black chips and the
 * ingredient amounts in large type, one per line. No prep sentences (they are
 * on the recipe sheet in the POS), no illustration.
 */
export function renderComandaBarraHtml(d: ComandaData, papel: Papel = "80"): string {
  const o: string[] = [];
  // Cabecera: número grande, hora; Pa' nombre; barista.
  o.push(`<div class="row" style="padding-top:3px"><span class="nority" style="font-size:11px;line-height:12px;letter-spacing:.5px">Comanda${d.copia ? " · copia" : ""}</span><span class="b" style="font-size:13px;line-height:14px">${esc(d.hora)}</span></div>`);
  o.push(`<div class="dela" style="font-size:34px;line-height:36px;margin-top:2px">${esc(d.pedido)}</div>`);
  if (d.cliente?.trim()) o.push(`<div class="dela nowrap" style="font-size:20px;line-height:23px">Pa' ${esc(d.cliente.trim())}</div>`);
  if (d.barista) o.push(`<div style="font-size:12px;line-height:14px;margin-top:1px">Prepara: <span class="b">${esc(d.barista)}</span></div>`);
  if (d.avisos?.length || d.estado) {
    o.push(`<div style="margin-top:5px">${(d.avisos ?? []).map((a) => `<span class="chip inv big">${esc(a)}</span>`).join("")}${d.estado ? `<span class="chip big">${esc(d.estado)}</span>` : ""}</div>`);
  }
  if (d.nota?.trim()) {
    o.push(`<div style="margin-top:5px;border:2px solid ${INK};padding:4px 6px;font-size:15px;line-height:18px;font-weight:700;white-space:pre-line">${esc(d.nota.trim())}</div>`);
  }

  for (const b of d.bebidas) {
    o.push(`<div class="cut2" style="margin-top:8px"></div>`);
    o.push(`<div style="margin-top:7px;display:flex;align-items:baseline;gap:6px">`);
    o.push(`<span class="dela" style="font-size:24px;line-height:24px;flex-shrink:0">${b.cantidad}×</span>`);
    o.push(`<span class="dela" style="font-size:18px;line-height:21px">${esc(b.nombre)}</span></div>`);
    if (b.cliente) o.push(`<div style="font-size:13px;line-height:16px;margin-top:2px">Pa' <span class="b">${esc(b.cliente)}</span></div>`);
    if (b.modificadores.length) o.push(`<div style="margin-top:4px">${b.modificadores.map((x) => `<span class="chip inv big">${esc(x)}</span>`).join("")}</div>`);
    if (b.proporciones?.length) {
      o.push(`<table style="margin-top:4px;border-collapse:collapse;width:100%">`);
      for (const p of b.proporciones) {
        o.push(`<tr><td class="b" style="font-size:18px;line-height:22px;white-space:nowrap;text-align:right;padding:1px 8px 1px 0;width:1%;vertical-align:baseline">${esc(p.cantidad)}</td>`);
        o.push(`<td style="font-size:15px;line-height:18px;font-weight:400;vertical-align:baseline;padding:1px 0">${esc(p.nombre)}${p.nota ? `<span style="font-size:11px;font-weight:300"> · ${esc(p.nota)}</span>` : ""}</td></tr>`);
      }
      o.push(`</table>`);
    } else if (b.pasos.length) {
      o.push(`<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:16px;font-weight:400">`);
      b.pasos.forEach((p, i) => o.push(`<div>${i + 1}. ${p.detalle ? `<span class="b">${esc(p.titulo)}</span> · ${esc(p.detalle)}` : esc(p.titulo)}</div>`));
      o.push(`</div>`);
    } else {
      o.push(`<div style="margin-top:4px;font-size:12px;line-height:15px">Sin receta en el catálogo.</div>`);
    }
    if (b.envase) o.push(`<div style="margin-top:3px;font-size:12px;line-height:15px">${esc(b.envase)}</div>`);
  }

  // Comida y botellas: sin receta, solo para cuadrar el pedido.
  if (d.otros?.length) {
    o.push(`<div class="cut2" style="margin-top:8px"></div>`);
    o.push(`<div class="nority" style="margin-top:6px;font-size:11px;line-height:12px;letter-spacing:.5px">También en el pedido</div>`);
    for (const x of d.otros) {
      const extra = [x.modificadores.join(" · "), x.cliente ? `Pa' ${x.cliente}` : ""].filter(Boolean).join(" · ");
      o.push(`<div style="margin-top:3px;font-size:15px;line-height:18px"><span class="b">${x.cantidad}× ${esc(x.nombre)}</span>${extra ? `<span style="font-size:12px"> · ${esc(extra)}</span>` : ""}</div>`);
    }
  }
  o.push(`<div class="cut2" style="margin-top:8px"></div>`);
  o.push(`<div style="margin-top:4px;text-align:center;font-size:9px;line-height:11px">Uso interno · no entregar al cliente</div>`);
  return page(`Comanda ${d.pedido}`, o.join(""), papel);
}
