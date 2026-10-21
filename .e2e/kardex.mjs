// e2e: the per-item kardex and the filtered Movimientos log. Read-only (GET
// pages only); safe in opening hours. Checks the kardex of the milk against the
// DB: saldo inicial, line count, last saldo, CSV download, and /historial
// narrowed to the item.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import pg from "pg";
import { cookiesFor } from "./auth.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = ".e2e/tmp/kardex"; mkdirSync(OUT, { recursive: true });
const ORG = "b069847f-7fb9-4ddb-a85d-9707da9a03d7";
const url = readFileSync(".e2e/apply-migration.mjs", "utf8").match(/const url = "([^"]+)"/)[1];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await db.connect();
await db.query("set default_transaction_read_only = on");
const { rows: [ing] } = await db.query("select id, name, unit, stock_current::float stock from ingredientes where organization_id=$1 and name like 'Leche entera%' and archived=false", [ORG]);
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const desde = new Date(Date.parse(today + "T00:00:00Z") - 6 * 864e5).toISOString().slice(0, 10);
const { rows: movs } = await db.query("select delta::float, balance_after::float, note from ingrediente_movements where ingrediente_id=$1 and created_at >= ($2||'T00:00:00-05:00')::timestamptz order by created_at, id", [ing.id, desde]);
const { rows: [prev] } = await db.query("select balance_after::float s from ingrediente_movements where ingrediente_id=$1 and created_at < ($2||'T00:00:00-05:00')::timestamptz order by created_at desc limit 1", [ing.id, desde]);
await db.end();
const bag = []; const ok = (c, k, t) => (c ? console.log("✓", k) : bag.push({ k, t: String(t).slice(0, 300) }));
const fmt = (n) => { const r = Math.round(n * 1000) / 1000; const [i, d] = Math.abs(r).toFixed(3).replace(/\.?0+$/, "").split("."); return `${r < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${d ? "," + d : ""}`; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addCookies(await cookiesFor("jesusvallecilla27@gmail.com"));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => bag.push({ k: "pageerror", t: e.message }));

  await p.goto(`${BASE}/inventario/kardex/${ing.id}?dias=7`, { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { name: ing.name }).isVisible(), "kardex abre con el nombre del ítem");
  const body = await p.locator("body").innerText();
  ok(body.includes(`Saldo inicial`) && body.includes(fmt(prev?.s ?? 0)), "saldo inicial = último balance antes del periodo", `esperado ${fmt(prev?.s ?? 0)}`);
  const visibles = movs.filter((m) => !/\b(e2e|prueba|test)\b/i.test(m.note ?? ""));
  ok(body.includes(`${visibles.length} de ${movs.length} movimientos`), `${visibles.length} de ${movs.length} movimientos en 7 días`, body.match(/\d+ de \d+ movimientos[^\n]*/)?.[0]);
  if (movs.length) ok(body.includes(fmt(movs[movs.length - 1].balance_after)), "saldo final = balance_after del último movimiento", fmt(movs[movs.length - 1].balance_after));
  ok(body.includes(fmt(ing.stock)) || Math.abs((movs.at(-1)?.balance_after ?? 0) - ing.stock) < 0.001, "stock de hoy visible", fmt(ing.stock));
  await p.screenshot({ path: `${OUT}/kardex-7d.png`, fullPage: true });

  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Exportar CSV" }).click()]);
  const csv = readFileSync(await dl.path(), "utf8");
  ok(csv.startsWith("fecha,ingrediente,unidad,tipo,detalle,entrada,salida,saldo,costo_unitario,valor,usuario"), "CSV con cabecera de kardex");
  ok(csv.split("\n").length === visibles.length + 2, "CSV: saldo inicial + una línea por movimiento visible", csv.split("\n").length);

  // Period by dates (GET form) and the 30-day preset.
  await p.getByRole("button", { name: "30 días" }).click();
  await p.waitForLoadState("networkidle");
  ok(p.url().includes("dias=30"), "preset 30 días navega por GET");
  await p.getByLabel("Desde").fill("2026-10-01");
  await p.getByLabel("Hasta").fill("2026-10-07");
  await p.getByRole("button", { name: "Ver" }).click();
  await p.waitForLoadState("networkidle");
  ok(p.url().includes("desde=2026-10-01") && (await p.locator("body").innerText()).includes("1 oct 2026 → 7 oct 2026"), "rango por fechas", p.url());

  // /historial narrowed to the item, link to the kardex.
  await p.goto(`${BASE}/historial?ingrediente=${ing.id}&dias=7`, { waitUntil: "networkidle" });
  const names = await p.locator("a[title='Ver kardex']").allInnerTexts();
  ok(names.length > 0 && names.every((n) => n === ing.name), "historial filtrado muestra solo el ítem", names.slice(0, 3).join("|"));
  ok(await p.getByRole("link", { name: `Kardex de ${ing.name} →` }).isVisible(), "enlace al kardex desde historial");
  await p.screenshot({ path: `${OUT}/historial-filtrado.png` });

  // Recetas: the «Costos por revisar» panel.
  await p.goto(`${BASE}/recetas`, { waitUntil: "networkidle" });
  const panel = p.getByTestId("costos-panel");
  ok(await panel.isVisible(), "panel «Costos por revisar» en recetas");
  ok((await panel.innerText()).includes("sin costo"), "panel cuenta insumos sin costo");
  await p.screenshot({ path: `${OUT}/recetas-costos.png` });

  // Inventario: the row menu offers the kardex.
  await p.goto(`${BASE}/inventario`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: `Acciones de ${ing.name}` }).click();
  const k = p.getByRole("menuitem", { name: "≡ Kardex" });
  ok(await k.isVisible(), "menú de la fila tiene Kardex");
  ok((await k.getAttribute("href")) === `/inventario/kardex/${ing.id}`, "Kardex enlaza al ítem", await k.getAttribute("href"));
} finally {
  await b.close();
}
if (bag.length) { console.log("✗ fallos:", bag); process.exit(1); }
console.log("todo ok");
