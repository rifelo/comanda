// Seed PAYO's quick-inventory priority list (ingredientes.prioridad, 0038).
// Idempotent and conservative: only ingredients still at prioridad 0 are
// set, so whatever the owner changes in /inventario/faltantes stays.
//   node scripts/seed-prioridades-payo.mjs [--force]   (--force overwrites)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const ORG = "b069847f-7fb9-4ddb-a85d-9707da9a03d7";
const force = process.argv.includes("--force");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1 crítico · 2 importante · 3 normal — matched by name (case-insensitive prefix).
const LISTA = [
  ["Cafe Okana", 1],
  ["Leche entera", 1],
  ["Vaso 12 oz doble pared", 1],
  ["Tapa domo Darnel 12 oz", 1],
  ["Vaso 7 oz", 1],
  ["Tapa vaso 7 oz", 1],
  ["Hielo", 1],
  ["Agua pura 600 ml", 2],
  ["Chocolate Corona", 2],
  ["Salsa de chocolate", 2],
  ["Crema chantilly", 2],
  ["Milo", 2],
  ["Canada Dry", 2],
  ["Aislador de calor", 2],
  ["vaso darnel pet", 2],
  ["Tapa viajera 12 oz", 3],
  ["Aromática de panela", 3],
  ["Kombucha", 3],
  ["Torta de", 3],
  ["Alfajor", 3],
  ["Rollo de canela", 3],
];

const { data: ings, error } = await sb.from("ingredientes").select("id, name, prioridad").eq("organization_id", ORG).eq("archived", false);
if (error) throw error;
let set = 0;
for (const i of ings) {
  const hit = LISTA.find(([prefix]) => i.name.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!hit) continue;
  if (!force && i.prioridad > 0) continue;
  if (i.prioridad === hit[1]) continue;
  const { error: uErr } = await sb.from("ingredientes").update({ prioridad: hit[1] }).eq("id", i.id);
  if (uErr) throw uErr;
  console.log(`  ${hit[1]} ← ${i.name}`);
  set += 1;
}
console.log(`prioridades: ${set} actualizadas`);
