// The wall menu for the backlit box (/menu/caja) → print-ready PDFs at real size
// (120 × 80 cm, and with 2 cm bleed) + a PNG preview. Read-only (public GET).
// Fails if any column overflows, so a new product never gets cut off silently.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".e2e/tmp/menu-caja"; mkdirSync(OUT, { recursive: true });
const bag = [];
const b = await chromium.launch();
try {
  const p = await (await b.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 3 })).newPage();
  p.on("pageerror", (e) => bag.push(e.message));
  for (const s of [0, 2]) {
    await p.goto(`${BASE}/menu/caja${s ? `?sangrado=${s}` : ""}`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    const over = await p.$$eval(".cj-col", (cols) => cols.map((c, i) => [i + 1, c.scrollHeight - c.clientHeight]).filter(([, d]) => d > 1));
    if (over.length) bag.push(`columnas desbordadas (col, px): ${JSON.stringify(over)}`);
    const name = s ? `menu-caja-120x80-sangrado-${s}cm` : "menu-caja-120x80";
    await p.pdf({ path: `${OUT}/${name}.pdf`, width: `${120 + 2 * s}cm`, height: `${80 + 2 * s}cm`, printBackground: true, preferCSSPageSize: true });
    if (!s) {
      // Preview as printed (print media = no screen zoom), at 0.75 px per CSS px.
      const v = await b.newPage({ viewport: { width: 4536, height: 3024 }, deviceScaleFactor: 0.75 });
      await v.emulateMedia({ media: "print" });
      await v.goto(`${BASE}/menu/caja`, { waitUntil: "networkidle" });
      await v.evaluate(() => document.fonts.ready);
      await v.locator(".cj").screenshot({ path: `${OUT}/menu-caja-vista.png` });
      await v.close();
    }
    console.log("✓", name);
  }
} finally { await b.close(); }
if (bag.length) { console.log("✗", bag); process.exit(1); }
console.log("todo ok →", OUT);
