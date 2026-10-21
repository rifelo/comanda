// Datos para «PAYO · Domicilios fríos» (read-only). Uso: node .e2e/reportes/domicilios-data.mjs <out.json>
import fs from "node:fs";
import pg from "pg";
const url = fs.readFileSync(".e2e/apply-migration.mjs", "utf8").match(/const url = "([^"]+)"/)[1];
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set default_transaction_read_only = on");
const ORG = "b069847f-7fb9-4ddb-a85d-9707da9a03d7";
const DESDE = "2026-09-24", HASTA = "2026-10-21"; // 28 días
const since = `o.created_at >= '${DESDE}T00:00:00-05:00' and o.created_at < '${HASTA}T23:59:59-05:00'`;
const q = async (s, p = []) => (await c.query(s, p)).rows;

const COLD = `(p.sku like 'BF-%' or p.sku = 'BC-011' or p.sku like 'JU-%')`;
const skus = await q(`select p.sku, p.name, p.price_cop::int as precio, p.cost_cop::int as costo, p.stock_status,
   coalesce((select sum(oi.qty) from orden_items oi join ordenes o on o.id=oi.orden_id where oi.producto_id=p.id and o.status='pagada' and ${since}),0)::int as u4s,
   exists(select 1 from receta_items ri join ingredientes i on i.id=ri.ingrediente_id where ri.producto_id=p.id and i.name ilike '%vaso%pet%') as vaso_pet,
   exists(select 1 from receta_items ri join ingredientes i on i.id=ri.ingrediente_id where ri.producto_id=p.id and i.name ilike '%tapa domo%') as tapa_domo,
   exists(select 1 from receta_items ri join ingredientes i on i.id=ri.ingrediente_id where ri.producto_id=p.id and (i.name ilike '%chantilly%' or i.name ilike '%crema para batir%')) as crema,
   exists(select 1 from receta_items ri join ingredientes i on i.id=ri.ingrediente_id where ri.producto_id=p.id and (i.name ilike '%soda%' or i.name ilike '%tónica%' or i.name ilike '%ginger%')) as gas
 from productos p where p.organization_id=$1 and ${COLD} order by p.sku`, [ORG]);

const semanas = await q(`select to_char(date_trunc('week', o.created_at at time zone 'America/Bogota'),'YYYY-MM-DD') as semana,
   sum(case when ${COLD} then oi.qty else 0 end)::int as frios,
   sum(case when ${COLD} then oi.qty*oi.unit_price_cop else 0 end)::int as venta_frios,
   sum(oi.qty*oi.unit_price_cop)::int as venta_total, count(distinct o.id)::int as ordenes
 from orden_items oi join ordenes o on o.id=oi.orden_id left join productos p on p.id=oi.producto_id
 where o.organization_id=$1 and o.status='pagada' and ${since} group by 1 order by 1`, [ORG]);

const dow = await q(`select extract(dow from o.created_at at time zone 'America/Bogota')::int as dow, sum(oi.qty)::int as frios
 from orden_items oi join ordenes o on o.id=oi.orden_id join productos p on p.id=oi.producto_id
 where o.organization_id=$1 and o.status='pagada' and ${COLD} and ${since} group by 1 order by 1`, [ORG]);

const franjas = await q(`select case when extract(hour from o.created_at at time zone 'America/Bogota')<12 then 'mañana' when extract(hour from o.created_at at time zone 'America/Bogota')<17 then 'tarde' else 'noche' end as franja, sum(oi.qty)::int as frios
 from orden_items oi join ordenes o on o.id=oi.orden_id join productos p on p.id=oi.producto_id
 where o.organization_id=$1 and o.status='pagada' and ${COLD} and ${since} group by 1`, [ORG]);

const canal = await q(`select order_type, count(*)::int as ordenes, sum(total_cop)::int as total from ordenes o where organization_id=$1 and status='pagada' and ${since} group by 1`, [ORG]);
const [tot] = await q(`select count(*)::int as ordenes, sum(total_cop)::int as venta from ordenes o where organization_id=$1 and status='pagada' and ${since}`, [ORG]);
const empaque = await q(`select name, cost_cop::float as costo, stock_current::float as stock from ingredientes where organization_id=$1 and archived=false and name in ('vaso darnel pet x 12Oz','Tapa domo Darnel 12 oz','Botella 330 ML + Tapa','Etiqueta térmica Niimbot 30×50 (rollo 230)','Pitillo') order by name`, [ORG]);
const fr = await q(`select sku, name, price_cop::int as precio, cost_cop::int as costo from productos where organization_id=$1 and sku like 'FR-%' order by sku`, [ORG]);
await c.end();

// ── modelo ──
const VASO = 176, DOMO = 196, BOTELLA = 2310, SOBREPRECIO = 3500;
const SELLADORA = 2_500_000, LOTE = 200, LOTE_COSTO = LOTE * BOTELLA, INVERSION = SELLADORA + LOTE_COSTO;
const bebidas = skus.filter((s) => s.precio > 0).map((s) => {
  const empaqueActual = (s.vaso_pet ? VASO : 0) + (s.tapa_domo ? DOMO : 0);
  const costoBotella = s.costo - empaqueActual + BOTELLA;
  const precioLlevar = s.precio + SOBREPRECIO;
  const viaja = s.crema ? "fuera" : s.gas ? "adaptar" : "apto";
  return {
    sku: s.sku, name: s.name, u4s: s.u4s, precio: s.precio, costo: s.costo, margen: Math.round((1 - s.costo / s.precio) * 100),
    costoBotella, margenMismoPrecio: Math.round((1 - costoBotella / s.precio) * 100),
    precioLlevar, margenLlevar: Math.round((1 - costoBotella / precioLlevar) * 100), contribLlevar: precioLlevar - costoBotella,
    viaja, crema: s.crema, gas: s.gas,
  };
});
// contribución promedio ponderada por ventas de los aptos+adaptar (lo que realmente saldría)
const base = bebidas.filter((b) => b.viaja !== "fuera");
const peso = base.reduce((s, b) => s + b.u4s, 0);
const contribProm = Math.round(base.reduce((s, b) => s + b.contribLlevar * (b.u4s || 1), 0) / Math.max(1, base.reduce((s, b) => s + (b.u4s || 1), 0)));
const precioProm = Math.round(base.reduce((s, b) => s + b.precioLlevar * (b.u4s || 1), 0) / Math.max(1, base.reduce((s, b) => s + (b.u4s || 1), 0)));
const escenarios = [3, 6, 12].map((porDia) => {
  const mes = porDia * 30;
  const contribMes = mes * contribProm;
  return { porDia, mes, ventaMes: mes * precioProm, contribMes, mesesRetorno: +(INVERSION / contribMes).toFixed(1), diasLote: Math.round(LOTE / porDia), bebidasRetorno: Math.ceil(INVERSION / contribProm) };
});
const friosTot = semanas.reduce((s, w) => s + w.frios, 0);
const out = {
  periodo: { desde: DESDE, hasta: HASTA, dias: 28 }, generado: new Date().toISOString(),
  totales: { ...tot, frios: friosTot, ventaFrios: semanas.reduce((s, w) => s + w.venta_frios, 0), friosPorDia: +(friosTot / 28).toFixed(1) },
  semanas, dow, franjas, canal, empaque, fr,
  supuestos: { VASO, DOMO, BOTELLA, SOBREPRECIO, SELLADORA, LOTE, LOTE_COSTO, INVERSION, contribProm, precioProm, peso },
  bebidas, escenarios,
};
fs.writeFileSync(process.argv[2] ?? "domicilios.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ totales: out.totales, supuestos: out.supuestos, escenarios, canal }, null, 1));
console.table(bebidas.map(({ sku, name, u4s, precio, margen, costoBotella, margenMismoPrecio, precioLlevar, margenLlevar, viaja }) => ({ sku, name, u4s, precio, margen, costoBotella, margenMismoPrecio, precioLlevar, margenLlevar, viaja })));
