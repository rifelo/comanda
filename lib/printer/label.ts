/**
 * Order label layout → 1-bit raster for the Niimbot head.
 *
 * Draws on an offscreen <canvas> (browser only), then thresholds to 1 bit and
 * packs MSB-first rows of exactly HEAD_WIDTH_BYTES, which is what
 * lib/printer/niimbot.ts#rowPacket expects.
 *
 * Geometry, bench-calibrated on 50×30 mm gap labels:
 *  · The head is 48 mm (384 dots) but the last ~2 mm fall off the label, so ink
 *    stays inside INK_RIGHT (46 mm). Rows are still 384 dots wide — narrower
 *    rows are unparseable by the printer.
 *  · The design is 28 mm tall, shifted TOP_OFFSET_MM down so it sits centred on
 *    the 30 mm label instead of hugging the leading edge.
 */

import { HEAD_WIDTH_BYTES, HEAD_WIDTH_PX, PX_PER_MM } from "./niimbot";

export interface LabelRaster {
  width: number;
  height: number;
  /** One entry per row along the feed; each HEAD_WIDTH_BYTES, bit set = black. */
  rows: Uint8Array[];
}

export interface OrderLabelInput {
  /** Customer name typed on the ticket; may be empty. */
  name: string;
  /** Human folio, "A-247". */
  folio: string;
  /** Station label shown small on top ("Caja 01"). */
  station?: string;
  /** Business name for the kicker line. */
  orgName?: string;
}

const LABEL_H_MM = 28;
const TOP_OFFSET_MM = 2;
const INK_LEFT = 1 * PX_PER_MM;
const INK_RIGHT = 46 * PX_PER_MM;
/** Luminance below this burns. Text is antialiased; 160 keeps strokes solid. */
const THRESHOLD = 160;

const FONT_STACK = '"Arial", "Helvetica", "Segoe UI", sans-serif';
const MONO_STACK = '"Consolas", "Courier New", monospace';

/**
 * Render the label the cashier expects after "Cobrar": the customer's name as
 * the hero, the folio underneath so the kitchen can match it to the ticket.
 * Falls back to the folio as hero when no name was captured.
 */
export function renderOrderLabel(input: OrderLabelInput): LabelRaster {
  const W = HEAD_WIDTH_PX;
  const H = LABEL_H_MM * PX_PER_MM;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  const inkW = INK_RIGHT - INK_LEFT;
  const cx = INK_LEFT + inkW / 2;
  const name = input.name.trim();
  const hero = name || input.folio;

  // Kicker: business · station, small caps, top-left.
  const kicker = [input.orgName, input.station].filter(Boolean).join(" · ").toUpperCase();
  let y = 6;
  if (kicker) {
    ctx.font = `bold 13px ${FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.fillText(fitOneLine(ctx, kicker, inkW), INK_LEFT, y);
    y += 18;
  }

  // Footer: folio (or nothing if the folio is already the hero).
  const footerH = name ? 44 : 0;
  const heroTop = y;
  const heroBottom = H - footerH - 6;

  // Hero: name autofit to ≤ 2 lines, centred.
  ctx.textAlign = "center";
  const { size, lines } = fitLines(ctx, hero, inkW, heroBottom - heroTop, 96, 22, 2, `bold {px}px ${FONT_STACK}`);
  ctx.font = `bold ${size}px ${FONT_STACK}`;
  const lineH = Math.round(size * 1.12);
  let ty = heroTop + Math.max(0, (heroBottom - heroTop - lineH * lines.length) / 2);
  for (const line of lines) {
    ctx.fillText(line, cx, ty);
    ty += lineH;
  }

  if (name) {
    const ry = H - footerH;
    ctx.fillRect(INK_LEFT, ry, inkW, 2);
    ctx.font = `bold 30px ${MONO_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(input.folio, cx, ry + 8);
  }

  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM);
}

/** Small self-test label used from the printer chip ("Probar impresora"). */
export function renderTestLabel(station?: string): LabelRaster {
  return renderOrderLabel({ name: "Impresora lista", folio: "PRUEBA", station, orgName: "comanda" });
}

// ── text fitting ────────────────────────────────────────────────
function fitOneLine(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Largest size (stepping down from `start`) at which text fits the box. */
function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxH: number,
  start: number,
  floor: number,
  maxLines: number,
  fontTpl: string,
): { size: number; lines: string[] } {
  for (let size = start; size >= floor; size -= 2) {
    ctx.font = fontTpl.replace("{px}", String(size));
    const lines = wrap(ctx, text, maxW);
    const lineH = Math.round(size * 1.12);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && lineH * lines.length <= maxH && widest <= maxW) {
      return { size, lines };
    }
  }
  ctx.font = fontTpl.replace("{px}", String(floor));
  const lines = wrap(ctx, text, maxW).slice(0, maxLines);
  return { size: floor, lines };
}

// ── canvas → 1-bit rows ─────────────────────────────────────────
function rasterize(ctx: CanvasRenderingContext2D, w: number, h: number, offsetRows: number): LabelRaster {
  const { data } = ctx.getImageData(0, 0, w, h);
  const rows: Uint8Array[] = [];
  for (let i = 0; i < offsetRows; i++) rows.push(new Uint8Array(HEAD_WIDTH_BYTES));
  for (let y = 0; y < h; y++) {
    const line = new Uint8Array(HEAD_WIDTH_BYTES);
    const base = y * w * 4;
    for (let x = 0; x < w; x++) {
      const p = base + x * 4;
      // Alpha is always 255 here (opaque white fill), so plain luminance.
      const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
      if (lum < THRESHOLD) line[x >> 3] |= 0x80 >> (x & 7);
    }
    rows.push(line);
  }
  return { width: w, height: rows.length, rows };
}
