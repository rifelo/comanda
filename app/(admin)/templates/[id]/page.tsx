import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getTemplate } from "@/lib/db/templates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateEditor } from "./template-editor";
import { DeleteTemplateButton } from "./delete-template-button";

export const dynamic = "force-dynamic";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const data = await getTemplate(id);
  if (!data) notFound();

  // Count attached shifts so the delete button can pick hard vs soft.
  const supabase = await createSupabaseServerClient();
  const { count: shiftCount } = await supabase
    .from("shift_instances")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);

  return (
    <div>
      <header
        className="flex items-end justify-between"
        style={{
          padding: "20px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <Link
            href={`/restaurants/${data.template.restaurant_id}`}
            className="text-muted"
            style={{ fontSize: 11, letterSpacing: "0.06em" }}
          >
            ← Restaurante
          </Link>
          <div
            className="text-muted mt-2"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            PLANTILLA · v{data.template.version ?? 1}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 30, margin: "4px 0 0" }}
          >
            {data.template.name}
          </h1>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Turno {data.template.shift === "day" ? "día" : "noche"} ·{" "}
            {data.tasks.length} tareas
          </p>
        </div>
        <DeleteTemplateButton
          templateId={id}
          restaurantId={data.template.restaurant_id}
          shiftCount={shiftCount ?? 0}
        />
      </header>

      <div style={{ padding: "20px 32px" }}>
        <TemplateEditor template={data.template} initialTasks={data.tasks} />
      </div>
    </div>
  );
}
