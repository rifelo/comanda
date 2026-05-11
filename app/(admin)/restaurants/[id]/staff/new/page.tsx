import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddStaffForm } from "./add-staff-form";

export const dynamic = "force-dynamic";

export default async function AddStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireAdmin();

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
          Agregar staff
        </h1>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          El staff agregado podrá iniciar sesión con Google y ver los turnos
          de <strong>{restaurant.name}</strong>. Si el correo ya existe en tu
          organización (incluyendo el tuyo, si quieres trabajar turnos
          aquí), sólo se le asignará este restaurante — sin cambiar sus
          permisos.
        </p>
      </header>

      <AddStaffForm
        restaurantId={id}
        restaurantName={restaurant.name}
        adminEmail={user.email ?? ""}
      />
    </div>
  );
}
