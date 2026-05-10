import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Folio } from "@/components/comanda/primitives";

export const dynamic = "force-dynamic";

export default async function RestaurantsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, timezone")
    .order("name");

  return (
    <div>
      <header
        className="flex items-end justify-between"
        style={{
          padding: "24px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Mis sedes · {(restaurants ?? []).length}
          </div>
          <h1
            className="font-slab"
            style={{ fontSize: 32, margin: "4px 0 0", letterSpacing: "-0.01em" }}
          >
            Restaurantes
          </h1>
        </div>
        <Link href="/restaurants/new" className="cmd-btn red sm">
          + Nuevo restaurante
        </Link>
      </header>

      <ul style={{ padding: "20px 32px" }}>
        {(restaurants ?? []).map((r, idx) => (
          <li key={r.id}>
            <Link
              href={`/restaurants/${r.id}`}
              className="block"
              style={{
                padding: "14px 0",
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 11, marginTop: 2 }}
                  >
                    {r.timezone}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Folio n={`SEDE-${idx + 1}`} label="FOLIO" />
                  <span style={{ color: "var(--muted)" }}>→</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
        {!restaurants?.length ? (
          <li
            className="text-muted text-center"
            style={{ padding: "32px", fontSize: 13 }}
          >
            Aún no hay restaurantes. Crea el primero.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
