import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * CSV export of shift completion stats over a date range.
 * Auth: admins only (RLS enforces it transitively, but we gate the route too).
 */
export async function GET(req: NextRequest) {
  const { supabase } = await requireAdmin();

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("shift_instances")
    .select(
      `id, date, status,
       restaurant:restaurants!inner(name),
       template:checklist_templates!inner(name, shift, template_tasks(count)),
       completions:task_completions(count)`,
    )
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "date",
    "restaurant",
    "shift",
    "template",
    "status",
    "completed",
    "total",
    "pct",
  ].join(",");

  const lines = (data ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (r as any).template?.template_tasks?.[0]?.count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const done = (r as any).completions?.[0]?.count ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return [
      r.date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      JSON.stringify((r as any).restaurant?.name ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r as any).template?.shift ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      JSON.stringify((r as any).template?.name ?? ""),
      r.status,
      done,
      total,
      pct,
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="comanda-${start}-${end}.csv"`,
    },
  });
}
