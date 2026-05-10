import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayInTz } from "@/lib/utils";

/**
 * Nightly cron entrypoint. Vercel Cron sends a Bearer token; we verify it
 * against CRON_SECRET so external callers can't trigger this.
 *
 * Generates one shift_instance per active template per restaurant for
 * "today" in each restaurant's local timezone. Idempotent (uniq key).
 */
export async function GET(req: NextRequest) {
  // Vercel Cron auth — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#secure-cron-jobs
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Service role bypasses RLS — needed because we generate rows for every
  // restaurant across every org.
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: restaurants, error } = await supa
    .from("restaurants")
    .select("id, timezone");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: templates, error: tErr } = await supa
    .from("checklist_templates")
    .select("id, restaurant_id")
    .eq("active", true);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // Build one row per (template, today-in-its-restaurant-tz).
  const tzByRestaurant = new Map<string, string>();
  for (const r of restaurants ?? []) tzByRestaurant.set(r.id, r.timezone);

  const rows = (templates ?? []).map((t) => ({
    restaurant_id: t.restaurant_id,
    template_id: t.id,
    date: todayInTz(tzByRestaurant.get(t.restaurant_id) ?? "America/Bogota"),
    status: "open" as const,
  }));

  if (rows.length === 0) return NextResponse.json({ inserted: 0 });

  const { error: upErr, count } = await supa
    .from("shift_instances")
    .upsert(rows, {
      onConflict: "restaurant_id,template_id,date",
      ignoreDuplicates: true,
      count: "exact",
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ inserted: count ?? 0 });
}
