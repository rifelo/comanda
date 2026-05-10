import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createRestaurant } from "./actions";

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
          Se creará el restaurante y se duplicarán las plantillas base
          (turno día y turno noche) de Daniel&apos;s Burger. Podrás editarlas
          después.
        </p>
      </header>

      <form
        action={createRestaurant}
        className="space-y-7"
        style={{ padding: "24px 32px", maxWidth: 460 }}
      >
        <UnderlinedField
          id="name"
          name="name"
          label="Nombre"
          required
          maxLength={120}
          placeholder="Ej: Sede Norte"
        />

        <div>
          <UnderlinedField
            id="timezone"
            name="timezone"
            label="Zona horaria"
            required
            defaultValue="America/Bogota"
            placeholder="America/Bogota"
          />
          <p
            className="text-muted"
            style={{ fontSize: 11, marginTop: 6 }}
          >
            Determina cuándo se generan los turnos diarios.
          </p>
        </div>

        <button type="submit" className="cmd-btn red" style={{ padding: "12px 18px" }}>
          Crear restaurante →
        </button>
      </form>
    </div>
  );
}

function UnderlinedField({
  id,
  name,
  label,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-muted block"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="block w-full bg-transparent outline-none"
        style={{
          borderBottom: "1.5px solid var(--ink)",
          padding: "6px 0",
          marginTop: 4,
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
