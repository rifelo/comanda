// READ-ONLY e2e: /numeros «¿El día fue rentable?» against the DB, for yesterday.
// Recomputes ventas, costo de venta (product cost × qty + option recipe cost)
// and the fixed share of the month straight from pg, then reads the page.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import pg from "pg";
import { cookiesFor } from "./auth.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const ORG = "b069847f-7fb9-4ddb-a85d-9707da9a03d7";
const OUT = ".e2e/tmp/numeros-rentabilidad"; mkdirSync(OUT, { recursive: true });
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const dia = process.env.DIA ?? new Date(Date.parse(today + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
const url = readFileSync(".e2e/apply-migration.mjs", "utf8").match(/const url = "([^"]+)"/)[1];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await db.connect();
await db.query("set default_transaction_read_only = on");
const { rows: [v] } = await db.query(`
  with it as (
    select i.qty, i.unit_price_cop, coalesce(p.cost_cop,0) cost, i.mods
    from orden_items i join ordenes o on o.id=i.orden_id left join productos p on p.id=i.producto_id
    where o.organization_id=$1 and o.status='pagada'
      and o.created_at >= ($2||'T00:00:00-05:00')::timestamptz and o.created_at < ($2||'T00:00:00-05:00')::timestamptz + interval '1 day'),
  opt as (
    select mo.group_id::text g, mo.name, sum(r.qty*coalesce(ing.cost_cop,0)) c
    from modifier_option_receta r join modifier_options mo on mo.id=r.option_id left join ingredientes ing on ing.id=r.ingrediente_id
    where r.organization_id=$1 group by 1,2)
  select sum(qty*unit_price_cop)::float ventas,
         sum(qty*(cost + coalesce((select sum(opt.c) from jsonb_each_text(coalesce(it.mods,'{}'::jsonb)) m join opt on opt.g=m.key and opt.name=m.value),0)))::float costo
  from it`, [ORG, dia]);
const mes = dia.slice(0, 7);
const { rows: [f] } = await db.query("select coalesce(sum(monto_cop),0)::float fijos from gastos where organization_id=$1 and categoria in ('arriendo','servicios','nomina') and to_char(fecha,'YYYY-MM')=$2", [ORG, mes]);
await db.end();
const diasMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
const fmt = (n) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
console.log(`  ${dia}: ventas ${fmt(v.ventas)} costo ${fmt(v.costo)} fijos/día ${fmt(f.fijos / diasMes)}`);

const bag = []; const ok = (c, k, t) => (c ? console.log("✓", k) : bag.push({ k, t: String(t).slice(0, 300) }));
const b = await chromium.launch();
try {
  for (const [name, w] of [["desktop", 1280], ["phone", 390]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addCookies(await cookiesFor("jesusvallecilla27@gmail.com"));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => bag.push({ k: "pageerror", t: e.message }));
    await p.goto(`${BASE}/numeros/${dia}`, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    if (name === "desktop") {
      ok(body.includes("¿El día fue rentable?") || body.includes("¿EL DÍA FUE RENTABLE?"), "sección visible");
      if (v.ventas > 0) {
        ok(body.includes(fmt(v.ventas)), "ventas pagadas cuadran con la base", fmt(v.ventas));
        ok(body.includes("−" + fmt(Math.round(v.costo))), "costo de venta cuadra con la base", fmt(v.costo));
        ok(body.includes(fmt(Math.round(v.ventas - Math.round(v.costo)))), "utilidad bruta = ventas − costo", fmt(v.ventas - v.costo));
      }
      if (f.fijos > 0) ok(body.includes("−" + fmt(Math.round(f.fijos / diasMes))), "costos fijos del día = fijos del mes ÷ días", fmt(f.fijos / diasMes));
      ok(/Utilidad neta del día|Pérdida del día/.test(body), "resultado neto");
    }
    const over = await p.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth > m.clientWidth + 1; });
    ok(!over, `${name}: sin desborde horizontal`);
    await p.getByTestId("rentabilidad").screenshot({ path: `${OUT}/${name}.png` });
    await ctx.close();
  }
} finally { await b.close(); }
if (bag.length) { console.log("✗ fallos:", bag); process.exit(1); }
console.log("todo ok");
