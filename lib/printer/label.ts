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
  /** The table's roster. When present the label names the table, not one person. */
  people?: string[];
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

const FALLBACK_SANS = '"Arial", "Helvetica", "Segoe UI", sans-serif';
const FALLBACK_MONO = '"Consolas", "Courier New", monospace';

/**
 * Labels use the app's own typography: the brand display face for the hero
 * lines (the same `--font-slab` every heading uses — Dela Gothic One, chosen
 * to match PA'YO's Nority wordmark) and the mono face for the small
 * technical lines, exactly as the screens do. next/font mangles the family
 * name at build time, so it's read off the CSS variable at draw time; the
 * hard-coded stacks stay as the fallback (and for the unit tests, which run
 * without a document).
 */
function cssFamily(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}
/** Brand display face. Single weight — never ask for bold (faux bold smears at 1 bit). */
const displayFont = () => cssFamily("--font-slab", FALLBACK_SANS);
const monoFont = () => cssFamily("--font-mono", FALLBACK_MONO);

/**
 * Canvas draws with whatever is loaded at that instant, so a cold label
 * would silently fall back to Arial. Awaited by the print queue before it
 * rasterizes a job.
 */
export async function ensureLabelFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`96px ${displayFont()}`),
      document.fonts.load(`bold 30px ${monoFont()}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Not fatal: the fallback stack still prints.
  }
}

/**
 * Bare order number from a folio: "A-247" → "247". Folios without a series
 * prefix ("PRUEBA") come back unchanged.
 */
/**
 * Kicker of the cup label: the person's name when the line has one
 * ("PA' JUAN"), otherwise the brand. Pure — unit-tested.
 */
export function drinkKicker(customer: string | undefined | null, brand: string | undefined | null): string {
  const who = (customer ?? "").replace(/\s+/g, " ").trim();
  if (who) return `PA' ${who}`.toUpperCase();
  return (brand ?? "").trim().toUpperCase();
}

/**
 * The table's names for the order label, joined with " · ". When the full
 * list doesn't fit (per the injected predicate), names are dropped from the
 * end and " +N" is appended, so the label always names as many as fit.
 */
export function rosterLine(people: ReadonlyArray<string>, fits: (s: string) => boolean): string {
  const names = people.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!names.length) return "";
  for (let keep = names.length; keep >= 1; keep--) {
    const rest = names.length - keep;
    const s = names.slice(0, keep).join(" · ") + (rest ? ` +${rest}` : "");
    if (fits(s)) return s;
  }
  return `${names.length} personas`;
}

export function orderNumber(folio: string): string {
  const m = /^[A-Za-z]+-(\d+)$/.exec(folio.trim());
  return m ? m[1] : folio.trim();
}

/**
 * Render the label the cashier expects after "Cobrar": "Pa'" and then the
 * customer's name as the hero, with the folio underneath so the kitchen can
 * match it to the ticket. When no name was captured the bare order number
 * ("247", not "A-247") is the hero instead — that's what the barista calls
 * out — and the "Pa'" line is dropped.
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
  const people = (input.people ?? []).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const roster = people.length > 0;
  const hero = name || orderNumber(input.folio);

  // "Pa'" over the name, the way the barista hands it over. Without a name
  // the hero is the order number and the line is dropped. With a roster the
  // "Pa'" belongs on each cup, so the label names the table instead.
  let y = 6;
  if (name && !roster) {
    ctx.font = `24px ${displayFont()}`;
    ctx.textAlign = "left";
    ctx.fillText("Pa'", INK_LEFT, y);
    y += 26;
  }

  // Footer: folio (+ the roster), or nothing if the folio is already the hero.
  const ROSTER_LH = 18;
  const footerH = roster ? 44 + 4 + ROSTER_LH * 2 : name ? 44 : 0;
  const heroTop = y;
  const heroBottom = H - footerH - 6;

  // Hero: name autofit to ≤ 2 lines, centred.
  ctx.textAlign = "center";
  const { size, lines } = fitLines(ctx, hero, inkW, heroBottom - heroTop, 150, 22, 2, `{px}px ${displayFont()}`);
  ctx.font = `${size}px ${displayFont()}`;
  const lineH = Math.round(size * 1.12);
  let ty = heroTop + Math.max(0, (heroBottom - heroTop - lineH * lines.length) / 2);
  for (const line of lines) {
    ctx.fillText(line, cx, ty);
    ty += lineH;
  }

  if (name || roster) {
    const ry = H - footerH;
    ctx.fillRect(INK_LEFT, ry, inkW, 2);
    ctx.font = `bold 30px ${monoFont()}`;
    ctx.textAlign = "center";
    ctx.fillText(input.folio, cx, ry + 8);
    if (roster) {
      ctx.font = `15px ${monoFont()}`;
      const text = rosterLine(people, (s) => wrap(ctx, s, inkW).length <= 2);
      const lines = wrap(ctx, text, inkW).slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(l, cx, ry + 8 + 36 + i * ROSTER_LH));
    }
  }

  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM);
}

// The portrait labels (menu + "síguenos") are 30 × 50 mm and print turned
// 90° on the 50 × 30 stock: the design's height runs across the head and its
// width along the feed. Ink area: 45 × 28 mm.
const DRINK_W = 28 * PX_PER_MM; // design width  → along the feed
const DRINK_H = 45 * PX_PER_MM; // design height → across the head

export interface InstagramLabelInput {
  /** Handle with or without "@" ("cafepayo"). */
  handle: string;
  orgName?: string;
  /** Brand line art drawn above the QR (optional). */
  cup?: (CanvasImageSource & { width: number; height: number }) | null;
}

/** Normalised handle + profile URL: "@CafePayo " → { handle: "cafepayo", url: "https://www.instagram.com/cafepayo" }. */
export function instagramLink(handle: string): { handle: string; url: string } {
  const h = handle.trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
  return { handle: h, url: `https://www.instagram.com/${h}` };
}

/**
 * "Síguenos" label, portrait like the menu ones: the brand cup on top, the
 * rule, a big QR to the profile and the handle underneath. Printed turned
 * 90° on the 50 × 30 mm stock.
 */
export function renderInstagramLabel(input: InstagramLabelInput): LabelRaster {
  const W = HEAD_WIDTH_PX;
  const H = DRINK_W;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  ctx.save();
  ctx.translate(INK_RIGHT, 0);
  ctx.rotate(Math.PI / 2);

  const M = 14;
  const innerW = DRINK_W - M * 2;
  const cx = DRINK_W / 2;
  const { handle, url } = instagramLink(input.handle);

  // brand illustration
  let y = 6;
  if (input.cup && input.cup.width > 0) {
    const maxH = 86;
    const scale = Math.min(innerW / input.cup.width, maxH / input.cup.height);
    const w = Math.round(input.cup.width * scale);
    const h = Math.round(input.cup.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(input.cup, Math.round(cx - w / 2), y, w, h);
    y += h + 12;
  } else {
    y = 22;
  }

  ctx.fillRect(M, y, innerW, 3);
  const qrTop = y + 14;

  // handle and its kicker, bottom-anchored
  const at = `@${handle}`;
  let size = 26;
  for (; size >= 14; size -= 2) {
    ctx.font = `${size}px ${displayFont()}`;
    if (ctx.measureText(at).width <= innerW) break;
  }
  ctx.textAlign = "center";
  const atTop = DRINK_H - 8 - Math.round(size * 1.15);
  ctx.font = `${size}px ${displayFont()}`;
  ctx.fillText(at, cx, atTop);
  ctx.font = `bold 11px ${monoFont()}`;
  setTracking(ctx, "2px");
  ctx.fillText("SÍGUENOS", cx, atTop - 17);
  setTracking(ctx, "0px");

  // QR: as big as the gap between the rule and the kicker allows
  const qrBox = Math.max(60, Math.min(innerW, atTop - 24 - qrTop));
  const qr = createQr(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const mod = Math.max(2, Math.floor(qrBox / (n + 4)));
  const qrPx = n * mod;
  const qx = Math.round(cx - qrPx / 2);
  const qy = qrTop + Math.round((qrBox - qrPx) / 2);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect(qx + c * mod, qy + r * mod, mod, mod);
    }
  }

  ctx.restore();
  // Like the sticker: only clearly dark pixels burn, so the thin white lines
  // inside the cup drawing survive the scale-down.
  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM, 96);
}

export interface MessageLabelInput {
  /** The phrase (≤ 140 chars, plain text). */
  text: string;
  orgName?: string;
  /** Instagram handle for the header, without "@". */
  handle?: string | null;
  /** Brand line art for the header (optional). */
  cup?: (CanvasImageSource & { width: number; height: number }) | null;
}

// The phrase label is the designer's sheet: landscape 50 × 30 mm, header
// (cup · CAFÉ PA'YO · @handle) over a rule, then the phrase filling the rest
// in mono bold, shrinking as it gets longer. Laid out in the sheet's own
// points and scaled into the 45 × 28 mm ink area.
const SHEET_PT = 2.535; // px per pt (8 px/mm, scaled to the ink width)
const pt = (v: number) => Math.round(v * SHEET_PT);

/**
 * "Frase del día" label: what the customer reads on the cup. The phrase is
 * left-aligned and autofits — three lines at 11 pt for a short one, six at
 * 8 pt for the longest the generator can produce.
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
  ctx.textAlign = "left";

  // Sheet origin: the 85 pt tall design centred in the 28 mm ink strip.
  const x0 = INK_LEFT;
  const y0 = Math.round((H - pt(85)) / 2);
  const left = x0 + pt(8);
  const right = x0 + pt(134);
  const innerW = right - left;

  // header — cup · business · handle
  const headTop = y0 + pt(5.6);
  const headSize = pt(6.4);
  let textLeft = left;
  if (input.cup && input.cup.width > 0) {
    const h = pt(9);
    const w = Math.round((input.cup.width / input.cup.height) * h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(input.cup, left, headTop - pt(1.5), w, h);
    textLeft = left + w + pt(4);
  }
  ctx.font = `bold ${headSize}px ${monoFont()}`;
  setTracking(ctx, "1.2px");
  ctx.fillText(fitOneLine(ctx, (input.orgName ?? "").toUpperCase(), right - textLeft), textLeft, headTop);
  setTracking(ctx, "0px");
  const handle = (input.handle ?? "").trim().replace(/^@/, "");
  if (handle) {
    ctx.font = `${headSize}px ${monoFont()}`;
    ctx.textAlign = "right";
    ctx.fillText(`@${handle}`, right, headTop);
    ctx.textAlign = "left";
  }

  // rule
  const ruleTop = y0 + pt(17.5);
  ctx.fillRect(left, ruleTop, innerW, Math.max(3, pt(1.75)));

  // phrase — biggest size whose wrap fits the space under the rule
  const areaTop = ruleTop + pt(4);
  const areaBottom = y0 + pt(77);
  const areaH = areaBottom - areaTop;
  const text = input.text.replace(/\s+/g, " ").trim();
  let size = pt(11.3);
  let lines: string[] = [];
  const floor = pt(8);
  for (; size >= floor; size -= 1) {
    ctx.font = `bold ${size}px ${monoFont()}`;
    const candidate = wrap(ctx, text, innerW);
    if (candidate.length <= 6 && candidate.length * Math.round(size * 1.2) <= areaH) {
      lines = candidate;
      break;
    }
  }
  if (!lines.length) {
    size = floor;
    ctx.font = `bold ${size}px ${monoFont()}`;
    lines = wrap(ctx, text, innerW).slice(0, 6);
  }
  ctx.font = `bold ${size}px ${monoFont()}`;
  const lh = Math.round(size * 1.2);
  let ty = areaTop + Math.max(0, Math.round((areaH - lines.length * lh) / 2));
  for (const l of lines) {
    ctx.fillText(l, left, ty);
    ty += lh;
  }

  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM, 96);
}

export interface DrinkLabelInput {
  /** Product name; uppercased and broken with the brand's apostrophe. */
  name: string;
  /** Spec box lines, e.g. ["2 SHOTS · 18 G"]. Empty = no box. */
  spec?: string[];
  /** Short descriptor under the box ("suave, pa' quedarse un rato"). */
  desc?: string;
  /** Kicker on top, e.g. "CAFÉ PA'YO". */
  brand?: string;
  /** Whose cup it is; replaces the brand kicker with "PA' <NOMBRE>". */
  customer?: string;
}

// The drink label is the menu design: portrait, 30 × 50 mm. The stock is the
// same 50 × 30 mm roll, so it prints turned 90° — the design's height runs
// across the head and its width along the feed. Ink area: 45 × 28 mm.

/**
 * Break a product name the way the menu does: uppercase, at most `maxLines`
 * lines, and an apostrophe marking the break — inside a word it closes the
 * line ("TINT'" / "O"), between words it opens the next one ("LATTE" /
 * "'FRÍO"). Returns null when it can't be done at that width. Pure: takes a
 * measuring function, so it is unit-tested without a canvas.
 */
export function breakDrinkName(
  name: string,
  maxLines: number,
  maxW: number,
  width: (s: string) => number,
): string[] | null {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lines: string[] = [];
  let cur = "";
  let tick = false; // the next line opens with an apostrophe

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const candidate = cur ? `${cur} ${w}` : `${tick ? "'" : ""}${w}`;
    if (width(candidate) <= maxW) {
      cur = candidate;
      tick = false;
      continue;
    }
    if (cur) {
      // Break between words: this line closes, the next opens with the tick.
      lines.push(cur);
      cur = "";
      tick = true;
      i--;
      if (lines.length >= maxLines) return null;
      continue;
    }
    // A single word too wide for the line: cut it and close with the tick.
    const head = tick ? "'" : "";
    let best = 0;
    for (let k = 1; k < w.length; k++) {
      if (width(`${head}${w.slice(0, k)}'`) <= maxW) best = k;
      else break;
    }
    if (!best) return null;
    lines.push(`${head}${w.slice(0, best)}'`);
    if (lines.length >= maxLines) return null;
    words[i] = w.slice(best);
    tick = false;
    i--;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * The menu label for one drink: brand kicker, rule, the name big, the spec
 * box ("2 SHOTS · 18 G") and a one-liner. Drawn in portrait design
 * coordinates and rotated onto the landscape stock.
 */
export function renderDrinkLabel(input: DrinkLabelInput): LabelRaster {
  const W = HEAD_WIDTH_PX;
  const H = DRINK_W;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  ctx.save();
  // Portrait design space: x runs along the feed, y across the head.
  ctx.translate(INK_RIGHT, 0);
  ctx.rotate(Math.PI / 2);

  const M = 14;
  const innerW = DRINK_W - M * 2;

  // kicker + rule
  const who = (input.customer ?? "").replace(/\s+/g, " ").trim();
  if (who) {
    // A person's name: bigger than the brand it replaces, and it shrinks
    // before it truncates — a cut-off name is useless for handing a cup over.
    // Ladder: 16 → 10 px on the full name, then the first name alone, then
    // (last resort) the ellipsis.
    const ladder: Array<[number, string]> = [[16, "1.2px"], [14, "1.2px"], [13, "1px"], [11, "0.6px"], [10, "0.6px"]];
    const tryFit = (text: string): number | null => {
      for (const [px, track] of ladder) {
        ctx.font = `bold ${px}px ${monoFont()}`;
        setTracking(ctx, track);
        if (ctx.measureText(text).width <= innerW) return px;
      }
      return null;
    };
    let text = drinkKicker(who, input.brand);
    let px = tryFit(text);
    if (px === null && who.includes(" ")) {
      text = drinkKicker(who.split(" ")[0], input.brand);
      px = tryFit(text);
    }
    if (px === null) {
      px = 13;
      ctx.font = `bold 13px ${monoFont()}`;
      setTracking(ctx, "1px");
      text = fitOneLine(ctx, text, innerW);
    }
    // Sit the text just above the rule at y = 36 whatever the size.
    ctx.fillText(text, M, Math.max(8, Math.round(34 - px * 1.25)));
    setTracking(ctx, "0px");
  } else {
    const brand = drinkKicker(null, input.brand);
    if (brand) {
      ctx.font = `bold 13px ${monoFont()}`;
      setTracking(ctx, "1.4px");
      ctx.fillText(fitOneLine(ctx, brand, innerW), M, 14);
      setTracking(ctx, "0px");
    }
  }
  ctx.fillRect(M, 36, innerW, 3);

  // description, bottom-anchored
  const descLines: string[] = [];
  const desc = (input.desc ?? "").trim();
  if (desc) {
    ctx.font = `italic 13px ${monoFont()}`;
    for (const l of wrap(ctx, desc, innerW).slice(0, 2)) descLines.push(l);
  }
  const descLH = 17;
  const descTop = DRINK_H - 12 - descLines.length * descLH;
  if (descLines.length) {
    ctx.font = `italic 13px ${monoFont()}`;
    descLines.forEach((l, i) => ctx.fillText(l, M, descTop + i * descLH));
  }

  // spec box, above the description
  const spec = (input.spec ?? []).filter((l) => l.trim());
  let boxTop = descTop - 14;
  if (spec.length) {
    ctx.font = `bold 13px ${monoFont()}`;
    const specLH = 16;
    const padX = 9;
    const padY = 7;
    const boxH = padY * 2 + spec.length * specLH - 2;
    const textW = Math.max(...spec.map((l) => ctx.measureText(l).width));
    const boxW = Math.min(innerW, textW + padX * 2);
    boxTop = descTop - 14 - boxH;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(M + 1, boxTop + 1, boxW, boxH);
    spec.forEach((l, i) => ctx.fillText(l, M + 1 + padX, boxTop + padY + i * specLH));
  }

  // Name: the biggest size that still fits. The menu keeps names on two
  // lines, so three are only used when two can't hold the word at any size.
  const nameTop = 58;
  const nameH = boxTop - 12 - nameTop;
  let size = 54;
  let lines: string[] | null = null;
  for (const maxLines of [2, 3]) {
    for (size = 54; size >= 18; size -= 2) {
      ctx.font = `${size}px ${displayFont()}`;
      const candidate = breakDrinkName(input.name, maxLines, innerW, (t) => ctx.measureText(t).width);
      if (candidate && candidate.length * Math.round(size * 0.88) <= nameH) {
        lines = candidate;
        break;
      }
    }
    if (lines) break;
  }
  if (!lines) {
    size = 18;
    ctx.font = `${size}px ${displayFont()}`;
    lines = [fitOneLine(ctx, input.name.toUpperCase(), innerW)];
  }
  ctx.font = `${size}px ${displayFont()}`;
  const lh = Math.round(size * 0.88);
  // The display face carries deep internal leading; nudge the block up so it
  // reads centred in the space the menu leaves between rule and box.
  const blockH = lines.length * lh;
  let ty = nameTop + Math.max(0, Math.round((nameH - blockH) / 2)) - Math.round(size * 0.2);
  for (const l of lines) {
    ctx.fillText(l, M, ty);
    ty += lh;
  }

  ctx.restore();
  return rasterize(ctx, W, H, TOP_OFFSET_MM * PX_PER_MM);
}

/** `letterSpacing` is Chromium-only; ignore it elsewhere. */
function setTracking(ctx: CanvasRenderingContext2D, value: string): void {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value;
  } catch {
    /* not supported */
  }
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
  return renderOrderLabel({ name: "", folio: "PRUEBA", station, orgName: "comanda" });
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
