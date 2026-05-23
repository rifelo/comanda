import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { Folio } from "@/components/comanda/primitives";
import { MemberRow } from "./staff/member-row";
import { DeleteRestaurantButton } from "./delete-restaurant-button";

export const dynamic = "force-dynamic";

export default async function RestaurantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  // Fan out everything this page needs in a single round-trip. The
  // shape-list (one membership row UI type alias) is declared up front
  // so all of the destructuring stays readable.
  type MemberRow = {
    user_id: string;
    profile: { id: string; full_name: string; role: "admin" | "staff" };
  };

  const [
    { data: restaurant },
    { data: templates },
    { data: recentShifts },
    { data: memberRows },
    { count: tplCount },
    { count: shiftCount },
    { count: novCount },
    { count: complCount },
  ] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", id).single(),
    supabase
      .from("checklist_templates")
      .select("id, name, active, version")
      .eq("restaurant_id", id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("shift_instances")
      .select("id, date, status, template:checklist_templates!inner(name)")
      .eq("restaurant_id", id)
      .order("date", { ascending: false })
      .limit(20),
    // Equipo · staff with access to this restaurant. Includes `role` so the
    // row UI can mark admin-members (the owner who's also on shift here)
    // with a small badge.
    supabase
      .from("restaurant_members")
      .select("user_id, profile:profiles!inner(id, full_name, role)")
      .eq("restaurant_id", id),
    // Impact counts for the delete-restaurant confirmation. Includes
    // inactive templates so the admin sees the full footprint.
    supabase
      .from("checklist_templates")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", id),
    supabase
      .from("shift_instances")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", id),
    supabase
      .from("novedades")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", id),
    supabase
      .from("task_completions")
      .select("id, shift_instance:shift_instances!inner(restaurant_id)", {
        count: "exact",
        head: true,
      })
      .eq("shift_instance.restaurant_id", id),
  ]);

  if (!restaurant) notFound();

  const members = ((memberRows ?? []) as unknown as MemberRow[]).filter(
    (m) => m.profile,
  );
  const impact = {
    templates: tplCount ?? 0,
    shifts: shiftCount ?? 0,
    novedades: novCount ?? 0,
    completions: complCount ?? 0,
    members: members.length,
  };

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
        <DeleteRestaurantButton
          restaurantId={id}
          restaurantName={restaurant.name}
          impact={impact}
        />
      </header>

      <section
        style={{
          padding: "24px 32px",
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        <div className="flex items-center justify-between">
          <SectionLabel>Plantillas</SectionLabel>
          <Link
            href={`/restaurants/${id}/templates/new`}
            className="cmd-btn ghost sm"
            style={{ marginBottom: 14 }}
          >
            + Nueva plantilla
          </Link>
        </div>
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

      <section
        style={{
          padding: "24px 32px",
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        <div className="flex items-center justify-between">
          <SectionLabel>Equipo · {members.length}</SectionLabel>
          <Link
            href={`/restaurants/${id}/staff/new`}
            className="cmd-btn ghost sm"
            style={{ marginBottom: 14 }}
          >
            + Agregar staff
          </Link>
        </div>
        <ul>
          {members.map((m) => (
            <MemberRow
              key={m.user_id}
              restaurantId={id}
              userId={m.user_id}
              fullName={m.profile.full_name}
              role={m.profile.role}
            />
          ))}
          {members.length === 0 ? (
            <li
              className="text-muted"
              style={{ padding: "12px 0", fontSize: 12 }}
            >
              Aún no tienes staff asignado a este restaurante. Agrega cajeros
              para que puedan registrar tareas en sus turnos.
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
