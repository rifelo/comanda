import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Folio } from "@/components/comanda/primitives";

export const dynamic = "force-dynamic";

export default async function RestaurantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();
  if (!restaurant) notFound();

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("id, name, shift, active, version")
    .eq("restaurant_id", id)
    .order("shift");

  const { data: recentShifts } = await supabase
    .from("shift_instances")
    .select(
      "id, date, status, template:checklist_templates!inner(name, shift)",
    )
    .eq("restaurant_id", id)
    .order("date", { ascending: false })
    .limit(20);

  return (
    <div>
      <header
        style={{
          padding: "24px 32px 16px",
          borderBottom: "1.5px solid var(--ink)",
        }}
        className="flex items-end justify-between"
      >
        <div>
          <Link
            href="/restaurants"
            className="text-muted"
            style={{ fontSize: 11, letterSpacing: "0.06em" }}
          >
            ← Restaurantes
          </Link>
          <h1
            className="font-slab"
            style={{ fontSize: 30, margin: "4px 0 0" }}
          >
            {restaurant.name}
          </h1>
          <div
            className="text-muted"
            style={{ fontSize: 12, marginTop: 6 }}
          >
            {restaurant.timezone} · folio · DR-
            {(restaurant.id as string).slice(0, 4).toUpperCase()}
          </div>
        </div>
      </header>

      <section
        style={{
          padding: "24px 32px",
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        <SectionLabel>Plantillas</SectionLabel>
        <ul
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          {(templates ?? []).map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="block"
                style={{
                  padding: 16,
                  border: "1.5px solid var(--ink)",
                  background: "var(--paper-lt)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {t.name}
                    </div>
                    <div
                      className="text-muted"
                      style={{ fontSize: 11, marginTop: 2 }}
                    >
                      Turno {t.shift === "day" ? "día" : "noche"} ·{" "}
                      v{t.version ?? 1}
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)" }}>→</span>
                </div>
              </Link>
            </li>
          ))}
          {!(templates ?? []).length ? (
            <li
              className="text-muted"
              style={{ fontSize: 12 }}
            >
              Sin plantillas para este restaurante.
            </li>
          ) : null}
        </ul>
      </section>

      <section style={{ padding: "24px 32px" }}>
        <SectionLabel>Turnos recientes</SectionLabel>
        <ul>
          {(recentShifts ?? []).map((s) => (
            <li key={s.id}>
              <Link
                href={`/shifts/${s.id}`}
                className="flex items-center justify-between"
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--rule-soft)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(s as any).template?.name}
                  </div>
                  <div
                    className="text-muted cmd-num"
                    style={{ fontSize: 11, marginTop: 2 }}
                  >
                    {s.date}
                  </div>
                </div>
                <Folio
                  n={s.id.slice(0, 4).toUpperCase()}
                  label={s.status === "open" ? "ABIERTO" : "CERRADO"}
                />
              </Link>
            </li>
          ))}
          {!recentShifts?.length ? (
            <li
              className="text-muted"
              style={{ padding: "16px 0", fontSize: 12 }}
            >
              Sin turnos aún. El cron generará los del día siguiente
              automáticamente.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-muted mb-3.5"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}
