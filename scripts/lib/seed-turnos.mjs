// Shared, idempotent seeding of turnos (checklist_templates) for one sede.
//
//   seedTurnos({ sede, puestos, templates, prune })
//
// - puestos are upserted by (restaurant_id, name);
// - each template is matched by name and its hours/days refreshed;
// - tasks are matched by title (or by `was`, the previous title, when a task
//   was renamed) and UPDATED in place — a delete would cascade to
//   task_completions and erase history — missing ones are inserted; tasks in
//   the DB but not in the list are kept unless `prune`;
// - template_puestos are upserted in order, with the optional gate.
//
// Task tuple: [puesto | null, title, "HH:MM", requires_photo, instructions, { was? }?]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

export function serviceClient() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export const PAYO = "21e07a47-4936-46d3-9ae5-b12c7219861d";
export const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const die = (msg, err) => {
  console.error(msg, err?.message ?? err ?? "");
  process.exit(1);
};

export async function seedTurnos({ sede, puestos = [], templates, prune = false }) {
  const sb = serviceClient();

  const puestoId = {};
  if (puestos.length) {
    const { error } = await sb.from("puestos").upsert(puestos.map((p) => ({ restaurant_id: sede, ...p })), { onConflict: "restaurant_id,name" });
    if (error) die("puestos:", error);
  }
  const { data: puestoRows, error: pErr } = await sb.from("puestos").select("id, name").eq("restaurant_id", sede);
  if (pErr) die("puestos read:", pErr);
  for (const p of puestoRows) puestoId[p.name] = p.id;

  for (const T of templates) {
    for (const p of T.puestos ?? []) if (!puestoId[p]) die(`puesto ${p} missing`);

    let templateId;
    {
      const { data: existing, error } = await sb.from("checklist_templates").select("id").eq("restaurant_id", sede).eq("name", T.name).maybeSingle();
      if (error) die("template read:", error);
      const fields = { inicio: T.inicio, fin: T.fin, dias: T.dias, active: true };
      if (existing) {
        templateId = existing.id;
        const { error: uErr } = await sb.from("checklist_templates").update(fields).eq("id", templateId);
        if (uErr) die("template update:", uErr);
      } else {
        const { data, error: iErr } = await sb.from("checklist_templates").insert({ restaurant_id: sede, name: T.name, ...fields }).select("id").single();
        if (iErr) die("template insert:", iErr);
        templateId = data.id;
      }
    }

    const { data: taskRows, error: tErr } = await sb.from("template_tasks").select("id, title").eq("template_id", templateId);
    if (tErr) die("tasks read:", tErr);
    const byTitle = new Map(taskRows.map((t) => [norm(t.title), t]));
    const seen = new Set();
    const idByTitle = new Map();
    let inserted = 0;
    let updated = 0;
    let renamed = 0;
    for (const [i, [puesto, title, due, photo, instructions, opts]] of T.tasks.entries()) {
      if (instructions && instructions.length > 1000) die(`instructions too long for "${title}" (${instructions.length} > 1000)`);
      if (puesto && !puestoId[puesto]) die(`puesto ${puesto} missing for "${title}"`);
      const row = { template_id: templateId, order_index: i, title, instructions: instructions ?? null, due_time: due ? `${due}:00` : null, requires_photo: !!photo, puesto_id: puesto ? puestoId[puesto] : null };
      let found = byTitle.get(norm(title));
      if (!found && opts?.was) {
        found = byTitle.get(norm(opts.was));
        if (found) renamed++;
      }
      if (found && !seen.has(found.id)) {
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
      if (prune) {
        const { error } = await sb.from("template_tasks").delete().in("id", leftovers.map((t) => t.id));
        if (error) die("prune:", error);
        console.log(`pruned ${leftovers.length} task(s) not in this list:`, leftovers.map((t) => t.title));
      } else {
        console.warn(`⚠ ${leftovers.length} task(s) of "${T.name}" are not in this list (kept; pass --prune to delete):`, leftovers.map((t) => t.title));
      }
    }

    if (T.puestos?.length) {
      const gateId = T.gate ? idByTitle.get(T.gate.title) : null;
      if (T.gate && !gateId) die(`gate task "${T.gate.title}" not found`);
      const rows = T.puestos.map((name, position) => ({ template_id: templateId, puesto_id: puestoId[name], position, waits_for_task_id: T.gate && T.gate.puesto === name ? gateId : null }));
      const { error } = await sb.from("template_puestos").upsert(rows, { onConflict: "template_id,puesto_id" });
      if (error) die("template_puestos:", error);
    }

    const dias = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].filter((_, i) => T.dias[i]).join(", ");
    console.log(`\nTurno "${T.name}" ${T.inicio.slice(0, 5)}–${T.fin.slice(0, 5)} (${dias}) · template ${templateId}`);
    console.log(`tasks: ${inserted} inserted, ${updated} updated (${renamed} renamed)${T.gate ? ` · ${T.gate.puesto} espera a «${T.gate.title}»` : ""}`);
    console.table(T.tasks.map(([puesto, title, due, photo]) => ({ puesto: puesto ?? "—", title, due, foto: photo ? "sí" : "" })));
  }
}
