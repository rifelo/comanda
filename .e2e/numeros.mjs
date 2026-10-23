// READ-ONLY e2e for /numeros (owner's numbers). Safe against the live DB:
// it only navigates, types into the local "tu conteo" scratchpad and reads.
// usage: LD_LIBRARY_PATH=.e2e/libs/usr/lib/x86_64-linux-gnu:.e2e/libs/lib/x86_64-linux-gnu node .e2e/numeros.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { cookiesFor } from "./auth.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const ADMIN = "jesusvallecilla27@gmail.com";
const OUT = process.argv[2] ?? ".e2e/tmp/numeros";
mkdirSync(OUT, { recursive: true });
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const shift = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const bag = [];
const fail = (f, k, t) => bag.push({ f, k, t: String(t).slice(0, 300) });
function watch(p, label) {
  p.removeAllListeners("console"); p.removeAllListeners("pageerror"); p.removeAllListeners("response");
  p.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|Download the React/i.test(m.text())) fail(label, "console." + m.type(), m.text()); });
  p.on("pageerror", (e) => fail(label, "pageerror", e?.message || e));
  p.on("response", (r) => { if (r.status() >= 500 && r.url().startsWith(BASE)) fail(label, "http500", r.url()); });
}
const cookies = await cookiesFor(ADMIN);
const b = await chromium.launch();

for (const [name, w, h] of [["desktop", 1280, 900], ["phone", 390, 844], ["tablet", 800, 1100], ["laptop", 1024, 768]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies(cookies);
  const p = await ctx.newPage();
  for (const [slug, path] of [["hoy", "/numeros"], ["ayer", `/numeros/${shift(today, -1)}`]]) {
    const label = `${name}-${slug}`;
    watch(p, label);
    const res = await p.goto(BASE + path, { waitUntil: "networkidle" });
    if (res.status() !== 200) fail(label, "status", res.status());
    await p.waitForTimeout(700);
    const main = p.locator("main");
    for (const text of ["Números del día", "Pedidos abiertos", "Más vendido", "Efectivo", "Transferencia", "Tarjeta", "Total cobrado", "Ventas por hora", "Más vendidos", "Tu conteo", "¿El día fue rentable?"]) {
      if (!(await main.getByText(text, { exact: false }).first().isVisible().catch(() => false))) fail(label, "assert", `missing "${text}"`);
    }
    const over = await p.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth > m.clientWidth + 1; });
    if (over) fail(label, "assert", "horizontal overflow in <main>");
    await p.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
    // <main> is the scroll container: capture its full height too.
    const full = await p.evaluate(() => document.querySelector("main").scrollHeight);
    await p.setViewportSize({ width: w, height: Math.min(full + 20, 6000) });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${label}-full.png` });
    await p.setViewportSize({ width: w, height: h });
    console.log(`[${label}] ok · main height ${full}`);
  }

  if (name === "desktop") {
    // nav: sidebar entry, day navigation, invalid and future dates
    watch(p, "nav");
    await p.goto(BASE + "/hoy", { waitUntil: "networkidle" });
    await p.getByRole("link", { name: /Números/ }).first().click();
    await p.waitForURL(/\/numeros$/, { timeout: 8000 }).catch((e) => fail("nav", "sidebar", e.message));
    await p.getByRole("link", { name: /día ant\./ }).click();
    await p.waitForURL(new RegExp(`/numeros/${shift(today, -1)}$`), { timeout: 8000 }).catch((e) => fail("nav", "prev", e.message));
    await p.getByRole("link", { name: /día sig\./ }).click();
    await p.waitForURL(/\/numeros$/, { timeout: 8000 }).catch((e) => fail("nav", "next→today", e.message));
    await p.getByLabel("Ver otro día").fill(shift(today, -2));
    await p.waitForURL(new RegExp(`/numeros/${shift(today, -2)}$`), { timeout: 8000 }).catch((e) => fail("nav", "picker", e.message));
    await p.goto(BASE + `/numeros/${shift(today, 3)}`, { waitUntil: "networkidle" });
    if (!/\/numeros$/.test(p.url())) fail("nav", "future", "future date did not redirect: " + p.url());
    p.removeAllListeners("console"); p.removeAllListeners("response");
    const bad = await p.goto(BASE + "/numeros/no-es-fecha", { waitUntil: "networkidle" });
    if (bad.status() !== 404) fail("nav", "invalid", "expected 404, got " + bad.status());
    console.log("[nav] ok");

    // chart hover + conteo scratchpad (localStorage only)
    watch(p, "interact");
    await p.goto(BASE + `/numeros/${shift(today, -1)}`, { waitUntil: "networkidle" });
    const bars = p.locator('button[aria-label*="pedidos;"]');
    const nBars = await bars.count();
    if (nBars === 0) fail("interact", "chart", "no hour columns");
    else {
      await bars.nth(Math.floor(nBars / 2)).hover();
      await p.waitForTimeout(200);
      const readout = await p.locator('[aria-live="polite"]').innerText();
      if (!/pedido/.test(readout)) fail("interact", "chart", "readout did not change: " + readout);
      console.log("[interact] readout:", readout.replace(/\s+/g, " "));
    }
    const sistema = await p.locator("label[for=conteo-efectivo]").locator("xpath=..").innerText();
    const esperado = Number((sistema.match(/\$([\d.]+)/)?.[1] ?? "0").replace(/\./g, ""));
    await p.locator("#conteo-efectivo").fill(String(esperado));
    await p.locator("#conteo-transferencia").fill("1000");
    await p.waitForTimeout(200);
    const box = await p.locator("#conteo-efectivo").locator("xpath=../..").innerText();
    if (!/cuadra/.test(box)) fail("interact", "conteo", "efectivo exact count did not say cuadra: " + box);
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    const kept = await p.locator("#conteo-transferencia").inputValue();
    if (kept !== "1.000") fail("interact", "conteo", "value not kept after reload: " + kept);
    await p.locator("#conteo-efectivo").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/desktop-conteo.png` });
    await p.getByRole("button", { name: "borrar" }).click();
    console.log("[interact] ok · efectivo sistema", esperado);
  }
  await ctx.close();
}
await b.close();
console.log(bag.length ? "FAILURES:\n" + bag.map((x) => `  [${x.f}] ${x.k}: ${x.t}`).join("\n") : "ALL OK");
process.exit(bag.length ? 1 : 0);
