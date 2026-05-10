import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewTemplateForm } from "./new-template-form";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  // Resolve the restaurant name to scope the form heading. RLS guarantees
  // the admin can only see restaurants in their own org.
  const supabase = await createSupabaseServerClient();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!restaurant) notFound();

  return (
    <div>
      <header
        style={{
          padding: "24px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <Link
          href={`/restaurants/${id}`}
          className="text-muted"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          ← {restaurant.name}
        </Link>
        <h1
          className="font-slab"
          style={{ fontSize: 30, margin: "4px 0 0", letterSpacing: "-0.01em" }}
        >
          Nueva plantilla
        </h1>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          Una plantilla agrupa las tareas que el cajero verá en su turno.
          Elige el turno y dale un nombre — agregarás las tareas en el
          siguiente paso.
        </p>
      </header>

      <NewTemplateForm restaurantId={id} />
    </div>
  );
}
