import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { NewRestaurantForm } from "./new-restaurant-form";

export default async function NewRestaurantPage() {
  await requireAdmin();
  return (
    <div>
      <header
        style={{
          padding: "24px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <Link
          href="/restaurants"
          className="text-muted"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          ← Restaurantes
        </Link>
        <h1
          className="font-slab"
          style={{ fontSize: 30, margin: "4px 0 0", letterSpacing: "-0.01em" }}
        >
          Nuevo restaurante
        </h1>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          Después de crearlo podrás agregar las plantillas (turno día,
          noche, o las que necesites) desde la página del restaurante.
        </p>
      </header>

      <NewRestaurantForm />
    </div>
  );
}
