// Closing turnos for a sede (PAYO by default):
//
//   "Noche" 17:00–21:00 lun–sáb — the closing checklist split in three
//   puestos (Barista, Aseo, Cierre; Cierre gated on Aseo's last task) plus
//   the "Arqueo y cierre de caja" task that points at Turno → Caja. The
//   Barista tasks carry the DAILY cleaning procedure of the espresso machine
//   (Caravel by Fiamma, automatic CV model, §6.1) as instructions.
//
//   "Limpieza semanal máquina" 20:00–21:00 sábados — the WEEKLY procedure
//   (§6.2): groups, trays, drain cup, body, water softener. Written for a
//   café WITHOUT machine detergent yet; each task says what changes when
//   there is some.
//
//   node scripts/seed-turno-noche.mjs [restaurant_id] [--prune]
//
// Idempotent and safe to re-run: puestos are upserted, each template is
// matched by name, tasks are matched by title and UPDATED in place (a delete
// would cascade to task_completions and erase history). Tasks that exist in
// the DB but not in this list are left alone unless --prune is passed.
// Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) like
// the .e2e scripts.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const PRUNE = args.includes("--prune");
const SEDE = args.find((a) => !a.startsWith("--")) ?? "21e07a47-4936-46d3-9ae5-b12c7219861d"; // PAYO

const PUESTOS = [
  { name: "Barista", color: "green", position: 1 },
  { name: "Aseo", color: "indigo", position: 2 },
  { name: "Cierre", color: "amber", position: 3 },
];

// Procedures for the team, condensed from the Caravel by Fiamma manual for
// the AUTOMATIC CV models (PAYO's machine): the group wash is the built-in
// self-cleaning cycle started with buttons 5 + 1. ≤ 1000 chars each.
const PROC = {
  gruposDiario:
    "1) Pon el filtro ciego en un portafiltro. 2) Engánchalo en el grupo. 3) Pulsa el botón 5 y el botón 1 a la vez para iniciar el lavado: los LEDs de los dos botones parpadean durante el ciclo. 4) Cuando dejan de parpadear, el ciclo terminó y la máquina vuelve sola al modo normal. 5) Repite hasta que el agua salga limpia. 6) Quita el filtro ciego y vuelve a poner el filtro normal. Puedes lavar varios grupos a la vez. Sin detergente: el detergente va en la limpieza semanal.",
  portafiltros:
    "Enjuaga filtros y portafiltros con agua bien caliente y un cepillo hasta que no quede grasa de café en la canasta ni en la oreja. Cuando haya detergente para máquinas de café, una cucharadita en el agua ayuda a disolver la grasa.",
  lanzas:
    "Purga vapor unos segundos y limpia cada lanza y grifo con el trapo húmedo de lácteos. Nada de leche seca ni incrustaciones: se acumulan y tapan la lanza.",
  juntas:
    "Con la máquina apagada (interruptor general) y fría si se apaga al cierre. Limpia las juntas de los portafiltros y las guías de los grupos (donde engancha el portafiltro) con un paño o esponja.",
  gruposSemanal:
    "Por ahora sin detergente (no hay en la cafetería): mismo lavado con el filtro ciego, solo agua. 1) Filtro ciego en un portafiltro. 2) Engancha en el grupo. 3) Pulsa el botón 5 y el botón 1 a la vez: los LEDs parpadean mientras dura el ciclo y la máquina para sola. 4) Repite el ciclo 3 o 4 veces por grupo hasta que el agua salga limpia. 5) Filtro ciego fuera, filtro normal puesto. Cuando llegue el detergente: pon una cucharadita en el filtro ciego, y entre ciclos quita el portafiltro, límpialo y vuelve a engancharlo hasta que el agua salga sin restos en la cubeta; al final prepara un café y bótalo para quitar el sabor.",
  rejillas:
    "Rejillas plásticas de la bandeja superior: paño húmedo. Rejilla y bandeja inferior (bajo los grupos): lavar con agua caliente (y detergente para máquinas cuando lo haya). Nunca productos abrasivos ni disolventes.",
  cubeta:
    "Con la bandeja inferior retirada queda visible la cubeta de desagüe. Limpia la cubeta y el orificio de descarga con un cepillo para sacar residuos y evitar que se tape el tubo.",
  cuerpo:
    "Exterior de la máquina con un paño húmedo (y detergente suave cuando lo haya). Nunca abrasivos ni disolventes.",
  suavizador:
    "Cada 2 semanas como mínimo (alterna sábados). Sigue las instrucciones que vienen con el suavizador de agua.",
};

// [puesto, title, due_time, requires_photo, instructions]
const TEMPLATES = [
  {
    name: "Noche",
    inicio: "17:00:00",
    fin: "21:00:00",
    dias: [true, true, true, true, true, true, false],
    puestos: ["Barista", "Aseo", "Cierre"],
    /** Cierre waits for this Aseo task (soft handoff). */
    gate: { puesto: "Cierre", title: "Barrer y trapear el área de trabajo" },
    tasks: [
      ["Barista", "Lavar utensilios sucios", "20:15", false, null],
      ["Barista", "Lavar los grupos con el filtro ciego (limpieza diaria)", "20:30", true, PROC.gruposDiario],
      ["Barista", "Lavar filtros y portafiltros con agua caliente", "20:30", true, PROC.portafiltros],
      ["Barista", "Purgar y limpiar las lanzas de vapor", "20:30", true, PROC.lanzas],
      ["Barista", "Lavar la bandeja de la máquina de espresso", "20:35", false, null],
      ["Barista", "Limpiar las juntas y guías de los grupos", "20:40", false, PROC.juntas],
      ["Barista", "Meter tortas a refrigerar", "20:40", false, null],
      ["Barista", "Asegurar que los envases de las tortas estén cerrados", "20:40", false, null],
      ["Barista", "Frascos de comestibles en la barra debidamente cerrados", "20:45", false, null],
      ["Barista", "Asegurar que los recipientes estén cerrados", "20:45", false, null],
      ["Barista", "Desenchufar el microondas", "20:45", false, null],
      ["Aseo", "Limpiar el área de trabajo", "20:30", false, null],
      ["Aseo", "Limpiar la barra del mostrador", "20:40", true, "Que quede sin residuos."],
      ["Aseo", "Lavar los trapos y dejarlos ordenados en su sitio", "20:45", false, null],
      ["Aseo", "Entrar las sillas", "20:45", false, null],
      ["Aseo", "Entrar el punto ecológico", "20:45", false, null],
      ["Aseo", "Barrer y trapear el área de trabajo", "20:50", true, "Piso limpio, sin agua encharcada."],
      ["Cierre", "Arqueo y cierre de caja", "20:50", false, "Cuenta el efectivo por denominación en Turno → Caja (chip «Caja» arriba). Ahí queda registrado lo que hay en la caja y la base que se deja; el dueño lo revisa en el panel."],
      ["Cierre", "Apagar el sistema POS", "20:55", false, null],
      ["Cierre", "Apagar el SonoQR de Bold", "20:55", false, null],
      ["Cierre", "Apagar la etiquetadora", "20:55", false, null],
      ["Cierre", "Cerrar con llave la puerta de la calle", "21:00", true, null],
      ["Cierre", "Apagar las luces y salir por la puerta de la carrera", "21:00", true, "Ajustar los pasadores de piso y cerrar con llave."],
    ],
  },
  {
    name: "Limpieza semanal máquina",
    inicio: "20:00:00",
    fin: "21:00:00",
    dias: [false, false, false, false, false, true, false],
    puestos: ["Barista"],
    gate: null,
    tasks: [
      ["Barista", "Lavado semanal de los grupos (filtro ciego)", "20:15", true, PROC.gruposSemanal],
      ["Barista", "Lavar rejillas y bandejas de la máquina", "20:35", true, PROC.rejillas],
      ["Barista", "Limpiar la cubeta de residuos y el orificio de descarga", "20:40", true, PROC.cubeta],
      ["Barista", "Limpiar el cuerpo de la máquina", "20:45", false, PROC.cuerpo],
      ["Barista", "Limpiar el suavizador de agua (cada 2 semanas)", "20:50", false, PROC.suavizador],
    ],
  },
];

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const die = (msg, err) => {
  console.error(msg, err?.message ?? err ?? "");
  process.exit(1);
};

// 1. puestos
{
  const { error } = await sb.from("puestos").upsert(PUESTOS.map((p) => ({ restaurant_id: SEDE, ...p })), { onConflict: "restaurant_id,name" });
  if (error) die("puestos:", error);
}
const { data: puestoRows, error: pErr } = await sb.from("puestos").select("id, name").eq("restaurant_id", SEDE);
if (pErr) die("puestos read:", pErr);
const puestoId = Object.fromEntries(puestoRows.map((p) => [p.name, p.id]));
for (const p of PUESTOS) if (!puestoId[p.name]) die(`puesto ${p.name} missing after upsert`);

for (const T of TEMPLATES) {
  for (const p of T.puestos) if (!puestoId[p]) die(`puesto ${p} missing`);

  // 2. template — matched by name, hours/days refreshed
  let templateId;
  {
    const { data: existing, error } = await sb.from("checklist_templates").select("id").eq("restaurant_id", SEDE).eq("name", T.name).maybeSingle();
    if (error) die("template read:", error);
    const fields = { inicio: T.inicio, fin: T.fin, dias: T.dias, active: true };
    if (existing) {
      templateId = existing.id;
      const { error: uErr } = await sb.from("checklist_templates").update(fields).eq("id", templateId);
      if (uErr) die("template update:", uErr);
    } else {
      const { data, error: iErr } = await sb.from("checklist_templates").insert({ restaurant_id: SEDE, name: T.name, ...fields }).select("id").single();
      if (iErr) die("template insert:", iErr);
      templateId = data.id;
    }
  }

  // 3. tasks — match by title, update in place, insert the missing ones
  const { data: taskRows, error: tErr } = await sb.from("template_tasks").select("id, title").eq("template_id", templateId);
  if (tErr) die("tasks read:", tErr);
  const byTitle = new Map(taskRows.map((t) => [norm(t.title), t]));
  const seen = new Set();
  const idByTitle = new Map();
  let inserted = 0;
  let updated = 0;
  for (const [i, [puesto, title, due, photo, instructions]] of T.tasks.entries()) {
    if (instructions && instructions.length > 1000) die(`instructions too long for "${title}" (${instructions.length} > 1000)`);
    const row = { template_id: templateId, order_index: i, title, instructions, due_time: `${due}:00`, requires_photo: photo, puesto_id: puestoId[puesto] };
    const found = byTitle.get(norm(title));
    if (found) {
      seen.add(found.id);
      const { error } = await sb.from("template_tasks").update(row).eq("id", found.id);
      if (error) die(`task update "${title}":`, error);
      idByTitle.set(title, found.id);
      updated++;
    } else {
      const { data, error } = await sb.from("template_tasks").insert(row).select("id").single();
      if (error) die(`task insert "${title}":`, error);
      idByTitle.set(title, data.id);
      inserted++;
    }
  }
  const leftovers = taskRows.filter((t) => !seen.has(t.id));
  if (leftovers.length) {
    if (PRUNE) {
      const { error } = await sb.from("template_tasks").delete().in("id", leftovers.map((t) => t.id));
      if (error) die("prune:", error);
      console.log(`pruned ${leftovers.length} task(s) not in this list`);
    } else {
      console.warn(`⚠ ${leftovers.length} task(s) of "${T.name}" are not in this list (kept; pass --prune to delete):`, leftovers.map((t) => t.title));
    }
  }

  // 4. template_puestos — in order; the gated puesto waits for its task
  {
    const gateId = T.gate ? idByTitle.get(T.gate.title) : null;
    if (T.gate && !gateId) die(`gate task "${T.gate.title}" not found`);
    const rows = T.puestos.map((name, position) => ({
      template_id: templateId,
      puesto_id: puestoId[name],
      position,
      waits_for_task_id: T.gate && T.gate.puesto === name ? gateId : null,
    }));
    const { error } = await sb.from("template_puestos").upsert(rows, { onConflict: "template_id,puesto_id" });
    if (error) die("template_puestos:", error);
  }

  const dias = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].filter((_, i) => T.dias[i]).join(", ");
  console.log(`\nTurno "${T.name}" ${T.inicio.slice(0, 5)}–${T.fin.slice(0, 5)} (${dias}) · template ${templateId}`);
  console.log(`tasks: ${inserted} inserted, ${updated} updated${T.gate ? ` · ${T.gate.puesto} espera a «${T.gate.title}»` : ""}`);
  console.table(T.tasks.map(([puesto, title, due, photo]) => ({ puesto, title, due, foto: photo ? "sí" : "" })));
}
