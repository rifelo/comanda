// e2e (read-only): /inventario rows open the item's kardex — click on the name,
// click elsewhere on the row; the ··· menu still opens without navigating.
import { chromium } from "playwright";
import { cookiesFor } from "./auth.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const bag = []; const ok = (c, k, t) => (c ? console.log("✓", k) : bag.push({ k, t: String(t).slice(0, 300) }));
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies(await cookiesFor("jesusvallecilla27@gmail.com"));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => bag.push({ k: "pageerror", t: e.message }));
  const open = async () => { await p.goto(`${BASE}/inventario`, { waitUntil: "networkidle" }); return p.getByTestId("inv-row").first(); };

  let row = await open();
  const name = await row.locator('a[title^="Ver kardex"]').innerText();
  await row.locator('a[title^="Ver kardex"]').click();
  await p.waitForURL(/\/inventario\/kardex\//);
  ok(await p.getByRole("heading", { name }).isVisible(), `clic en el nombre abre el kardex de ${name}`);

  row = await open();
  const box = await row.boundingBox();
  await p.mouse.click(box.x + box.width * 0.45, box.y + box.height / 2); // category / stock area
  await p.waitForURL(/\/inventario\/kardex\//);
  ok(p.url().includes("/inventario/kardex/"), "clic en otra parte de la fila abre el kardex", p.url());

  row = await open();
  await row.getByRole("button", { name: /^Acciones de / }).click();
  await p.waitForTimeout(400);
  ok(p.url().endsWith("/inventario") && (await row.getByRole("menu").isVisible()), "el menú ··· abre sin navegar", p.url());
  await p.screenshot({ path: ".e2e/tmp/inventario-menu.png" });
} finally {
  await b.close();
}
if (bag.length) { console.log(bag); process.exit(1); } else console.log("todo ok");
