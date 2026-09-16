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

import { create as createQr } from "qrcode";
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
 * Bare order number from a folio: "A-247" → "247". Folios without a series
 * prefix ("PRUEBA") come back unchanged.
 */
export function orderNumber(folio: string): string {
  const m = /^[A-Za-z]+-(\d+)$/.exec(folio.trim());
  return m ? m[1] : folio.trim();
}

/**
 * Render the label the cashier expects after "Cobrar": the customer's name as
 * the hero, the folio underneath so the kitchen can match it to the ticket.
 * When no name was captured the bare order number ("247", not "A-247") is
 * the hero instead — that's what the barista calls out.
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
  const hero = name || orderNumber(input.folio);

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

export interface InstagramLabelInput {
  /** Handle with or without "@" ("cafepayo"). */
  handle: string;
  orgName?: string;
}

/** Normalised handle + profile URL: "@CafePayo " → { handle: "cafepayo", url: "https://www.instagram.com/cafepayo" }. */
export function instagramLink(handle: string): { handle: string; url: string } {
  const h = handle.trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
  return { handle: h, url: `https://www.instagram.com/${h}` };
}

/**
 * "Síguenos" label: a QR to the café's Instagram profile on the left, the
 * handle big on the right. Printed on demand from the receipt screen (a
 * second label the customer takes with the order).
 */
export function renderInstagramLabel(input: InstagramLabelInput): LabelRaster {
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

  const { handle, url } = instagramLink(input.handle);

  // QR: medium error correction survives thermal fuzz; modules scaled to fill
  // the label height (a 29-module v3 code lands at 7 px/module ≈ 25 mm).
  const qr = createQr(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 2; // modules of white kept around the code inside the ink area
  const scale = Math.max(2, Math.floor((H - 4) / (n + quiet * 2)));
  const qrPx = n * scale;
  const qx = INK_LEFT + quiet * scale;
  const qy = Math.round((H - qrPx) / 2);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect(qx + c * scale, qy + r * scale, scale, scale);
    }
  }

  // Right column: kicker · @handle (autofit) · hint · business.
  const colL = qx + qrPx + quiet * scale + 6;
  const colW = INK_RIGHT - colL;
  const cx = colL + colW / 2;
  ctx.textAlign = "center";
  let y = qy + 2;
  ctx.font = `bold 15px ${FONT_STACK}`;
  ctx.fillText(fitOneLine(ctx, "SÍGUENOS EN", colW), cx, y);
  y += 19;
  ctx.fillText(fitOneLine(ctx, "INSTAGRAM", colW), cx, y);
  y += 26;

  const at = `@${handle}`;
  let size = 40;
  for (; size >= 16; size -= 2) {
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    if (ctx.measureText(at).width <= colW) break;
  }
  ctx.font = `bold ${size}px ${FONT_STACK}`;
  ctx.fillText(at, cx, y);
  y += Math.round(size * 1.15) + 8;

  ctx.font = `14px ${FONT_STACK}`;
  ctx.fillText(fitOneLine(ctx, "Escanea el código", colW), cx, y);
  if (input.orgName) {
    ctx.font = `bold 12px ${FONT_STACK}`;
    ctx.fillText(fitOneLine(ctx, input.orgName.toUpperCase(), colW), cx, qy + qrPx - 14);
  }

  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM);
}

export interface MessageLabelInput {
  /** Short phrase (≤ ~140 chars), plain text. */
  text: string;
  orgName?: string;
  /** Instagram handle for the footer, without "@". */
  handle?: string | null;
}

/**
 * "Frase del día" label: the phrase as the hero, autofit to ≤ 4 lines, the
 * business on top and the Instagram handle underneath. Stuck on the cup.
 */
export function renderMessageLabel(input: MessageLabelInput): LabelRaster {
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
  let top = 6;
  if (input.orgName) {
    ctx.font = `bold 13px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(fitOneLine(ctx, input.orgName.toUpperCase(), inkW), cx, top);
    top += 20;
  }
  let bottom = H - 6;
  if (input.handle) {
    ctx.font = `bold 13px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(fitOneLine(ctx, `@${input.handle.replace(/^@/, "")}`, inkW), cx, H - 20);
    bottom = H - 26;
  }

  const text = input.text.replace(/\s+/g, " ").trim();
  const { size, lines } = fitLines(ctx, text, inkW, bottom - top, 34, 15, 4, `bold {px}px ${FONT_STACK}`);
  ctx.font = `bold ${size}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  const lineH = Math.round(size * 1.15);
  let ty = top + Math.max(0, (bottom - top - lineH * lines.length) / 2);
  for (const line of lines) {
    ctx.fillText(line, cx, ty);
    ty += lineH;
  }
  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM);
}

/**
 * Brand sticker label ("Sticker PA'YO"): a black-and-white image scaled to
 * fit the ink area with its aspect ratio kept, centred, then thresholded
 * like every other label. White stays paper; black burns.
 */
export function renderImageLabel(img: CanvasImageSource & { width: number; height: number }): LabelRaster {
  const W = HEAD_WIDTH_PX;
  const H = LABEL_H_MM * PX_PER_MM;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const pad = 4;
  const boxW = INK_RIGHT - INK_LEFT - pad * 2;
  const boxH = H - pad * 2;
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, INK_LEFT + pad + Math.round((boxW - w) / 2), pad + Math.round((boxH - h) / 2), w, h);
  // Artwork has thin white lines inside black shapes; burning only clearly
  // dark pixels keeps them from closing up when scaled down.
  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM, 96);
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
function rasterize(ctx: CanvasRenderingContext2D, w: number, h: number, offsetRows: number, threshold: number = THRESHOLD): LabelRaster {
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
      if (lum < threshold) line[x >> 3] |= 0x80 >> (x & 7);
    }
    rows.push(line);
  }
  return { width: w, height: rows.length, rows };
}
