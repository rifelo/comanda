import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NovedadForm } from "./novedad-form";
import { formatTime } from "@/lib/utils";
import {
  ComandaPlate,
  CmdSectionLabel,
  Folio,
} from "@/components/comanda/primitives";

export const dynamic = "force-dynamic";

export default async function NovedadesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const supabase = await createSupabaseServerClient();
  // Parallelize shift lookup + novedades — neither depends on the other.
  // The shift query intentionally selects only what this page renders;
  // `template.shift` was dropped in migration 0004 and would 400 the join.
  const [{ data: shift }, { data: novedades }] = await Promise.all([
    supabase
      .from("shift_instances")
      .select("id, status, restaurant:restaurants(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("novedades")
      .select(
        "id, body, submitted_at, profiles:profiles!novedades_submitted_by_fkey(full_name)",
      )
      .eq("shift_instance_id", id)
      .order("submitted_at", { ascending: false }),
  ]);
  if (!shift) notFound();

  return (
    <div className="w-full">
      <Link
        href={`/shift/${id}`}
        className="block px-4 pt-3 text-muted"
        style={{ fontSize: 11, letterSpacing: "0.06em" }}
      >
        ← Turno
      </Link>

      <ComandaPlate
        subtitle="Novedades del turno"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        restaurant={(shift as any).restaurant?.name ?? ""}
        time={formatTime(new Date())}
      />

      <CmdSectionLabel>
        Reportes enviados · {(novedades ?? []).length}
      </CmdSectionLabel>

      <ul>
        {(novedades ?? []).map((n, idx) => (
          <li
            key={n.id}
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--rule-soft)" }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <Folio n={`N-${44 + idx}`} />
              <span
                className="text-muted"
                style={{ fontSize: 10, letterSpacing: "0.1em" }}
              >
                {formatTime(n.submitted_at)} ·{" "}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(n as any).profiles?.full_name ?? "—"}
              </span>
            </div>
            <p
              className="text-ink-2 whitespace-pre-wrap"
              style={{ fontSize: 13, lineHeight: 1.4 }}
            >
              {n.body}
            </p>
          </li>
        ))}
        {!(novedades ?? []).length ? (
          <li className="text-muted px-4 py-6 text-center" style={{ fontSize: 12 }}>
            Sin novedades reportadas todavía.
          </li>
        ) : null}
      </ul>

      {shift.status === "open" ? (
        <>
          <CmdSectionLabel>Nueva novedad</CmdSectionLabel>
          <div className="px-4 pb-8">
            <NovedadForm shiftInstanceId={id} />
          </div>
        </>
      ) : (
        <p
          className="text-muted px-4 py-6 text-center"
          style={{ fontSize: 12 }}
        >
          El turno está cerrado.
        </p>
      )}
    </div>
  );
}
