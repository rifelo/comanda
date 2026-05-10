"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const Schema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80),
});

/**
 * Create a restaurant for the admin's organization, then seed default
 * day-shift and night-shift templates derived from the Daniel's Burger
 * paper sheet so the admin has something runnable from minute one.
 */
export async function createRestaurant(formData: FormData) {
  const parsed = Schema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const { profile, supabase } = await requireAdmin();

  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .insert({
      organization_id: profile.organization_id,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    })
    .select()
    .single();
  if (rErr || !restaurant) throw new Error(rErr?.message ?? "create_failed");

  // Seed day + night templates with default tasks.
  const { data: dayTpl } = await supabase
    .from("checklist_templates")
    .insert({
      restaurant_id: restaurant.id,
      name: "Cajero - Turno Día",
      shift: "day",
    })
    .select()
    .single();

  const { data: nightTpl } = await supabase
    .from("checklist_templates")
    .insert({
      restaurant_id: restaurant.id,
      name: "Cajero - Turno Noche",
      shift: "night",
    })
    .select()
    .single();

  if (dayTpl) {
    await supabase.from("template_tasks").insert(
      DAY_DEFAULTS.map((t, i) => ({
        template_id: dayTpl.id,
        order_index: i + 1,
        ...t,
      })),
    );
  }
  if (nightTpl) {
    await supabase.from("template_tasks").insert(
      NIGHT_DEFAULTS.map((t, i) => ({
        template_id: nightTpl.id,
        order_index: i + 1,
        ...t,
      })),
    );
  }

  redirect(`/restaurants/${restaurant.id}`);
}

// Defaults transcribed from FO-DB-05 Lista de Actividades Cajero.
const DAY_DEFAULTS = [
  { title: "Abrir arqueo a las 10:30", due_time: "10:30", requires_photo: false },
  {
    title: "Organizar sonido (playlists predeterminadas en la tablet)",
    instructions:
      "No se permite apagar la música en horarios de atención al público.",
    requires_photo: false,
  },
  {
    title: "Limpiar las mesas y ubicar los servilleteros en cada una",
    instructions: "Barrer, sacar las sillas y mesas de la parte de afuera.",
    requires_photo: true,
  },
  {
    title: "Trapear con desinfectante el salón de clientes",
    requires_photo: true,
  },
  {
    title:
      "Organizar el escritorio, cajones y demás elementos que generen aspecto de desorden",
    requires_photo: false,
  },
  {
    title: "Ingresar vasos de calavera y copas para dama en la nevera para enfriar",
    requires_photo: false,
  },
  {
    title: "Limpiar y surtir nevera Coca-Cola",
    instructions: "Incluye los maderos de la barra.",
    requires_photo: true,
  },
  { title: "Limpiar paredes del área de pago", requires_photo: false },
  {
    title: "Organizar parte de atrás de la nevera Coca-Cola",
    requires_photo: true,
  },
  { title: "Cargar facturas de mercado entregadas por procesos", requires_photo: false },
  { title: "A la 1:30 organizar recibos para entrega de caja", due_time: "13:30", requires_photo: false },
  { title: "Cerrar arqueo 02:30 pm según procedimiento", due_time: "14:30", requires_photo: false },
];

const NIGHT_DEFAULTS = [
  {
    title: "Recibir caja según procedimiento de entrega y apertura de caja 6:00 pm",
    due_time: "18:00",
    requires_photo: false,
  },
  { title: "Abrir arqueo turno noche", due_time: "18:00", requires_photo: false },
  { title: "Organizar documentos para finalizar turno noche", requires_photo: false },
  {
    title: "A las 10:00 pm organizar los recibos (gruesos), quedarse con el sencillo",
    due_time: "22:00",
    requires_photo: false,
  },
  { title: "Entregar dinero de caja a procesos", requires_photo: false },
  { title: "Cerrar arqueo, entregar novedades del día a la administradora", requires_photo: false },
  {
    title: "Dejar el sitio de trabajo ordenado y limpio para el día siguiente",
    requires_photo: true,
  },
  { title: "Apagar la luz del baño", requires_photo: false },
];
