"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const Schema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80),
});

// NOTE: `"use server"` files in Next 16 must only export async functions —
// type exports get stripped at compile time, but exporting an `interface`
// (even type-only) trips the RSC payload encoder and surfaces as
// "An unexpected response was received from the server" at page load.
// The result shape is documented here for reference but kept un-exported.
//   type CreateRestaurantResult = { ok: boolean; id?: string; error?: string }

export async function createRestaurant(
  _prev: { ok: boolean; id?: string; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const parsed = Schema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Revisa los campos." };
  }

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
  if (rErr || !restaurant) {
    console.error("[createRestaurant] insert failed:", rErr);
    return {
      ok: false,
      error: rErr?.message ?? "No se pudo crear el restaurante.",
    };
  }

  // Seed day + night templates with default tasks. Failures here are logged
  // but not surfaced — the restaurant exists and the admin can add templates
  // by hand from the restaurant page.
  const seeded = await Promise.allSettled([
    seedTemplate(supabase, restaurant.id, "day", "Cajero - Turno Día", DAY_DEFAULTS),
    seedTemplate(supabase, restaurant.id, "night", "Cajero - Turno Noche", NIGHT_DEFAULTS),
  ]);
  for (const r of seeded) {
    if (r.status === "rejected")
      console.error("[createRestaurant] template seed failed:", r.reason);
  }

  return { ok: true, id: restaurant.id };
}

type TaskRow = {
  title: string;
  instructions?: string;
  due_time?: string;
  requires_photo?: boolean;
};

async function seedTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  restaurantId: string,
  shift: "day" | "night",
  name: string,
  tasks: TaskRow[],
) {
  const { data: tpl, error } = await supabase
    .from("checklist_templates")
    .insert({ restaurant_id: restaurantId, name, shift })
    .select()
    .single();
  if (error || !tpl) throw error ?? new Error("template_create_failed");

  const { error: tErr } = await supabase.from("template_tasks").insert(
    tasks.map((t, i) => ({
      template_id: tpl.id,
      order_index: i + 1,
      ...t,
    })),
  );
  if (tErr) throw tErr;
}

// Defaults transcribed from FO-DB-05 Lista de Actividades Cajero.
const DAY_DEFAULTS: TaskRow[] = [
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
  { title: "Trapear con desinfectante el salón de clientes", requires_photo: true },
  {
    title:
      "Organizar el escritorio, cajones y demás elementos que generen aspecto de desorden",
    requires_photo: false,
  },
  {
    title:
      "Ingresar vasos de calavera y copas para dama en la nevera para enfriar",
    requires_photo: false,
  },
  {
    title: "Limpiar y surtir nevera Coca-Cola",
    instructions: "Incluye los maderos de la barra.",
    requires_photo: true,
  },
  { title: "Limpiar paredes del área de pago", requires_photo: false },
  { title: "Organizar parte de atrás de la nevera Coca-Cola", requires_photo: true },
  { title: "Cargar facturas de mercado entregadas por procesos", requires_photo: false },
  {
    title: "A la 1:30 organizar recibos para entrega de caja",
    due_time: "13:30",
    requires_photo: false,
  },
  {
    title: "Cerrar arqueo 02:30 pm según procedimiento",
    due_time: "14:30",
    requires_photo: false,
  },
];

const NIGHT_DEFAULTS: TaskRow[] = [
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
  {
    title: "Cerrar arqueo, entregar novedades del día a la administradora",
    requires_photo: false,
  },
  {
    title: "Dejar el sitio de trabajo ordenado y limpio para el día siguiente",
    requires_photo: true,
  },
  { title: "Apagar la luz del baño", requires_photo: false },
];
