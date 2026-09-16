import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPosDeviceFromCookie, type PosDevice } from "@/lib/pos/devices";
import { normalizeTemplatePuestoRows } from "@/lib/db/puestos";
import { makeInitials } from "@/lib/db/roster";
import { isoMonday } from "@/lib/db/assignments";
import { todayInTz } from "@/lib/utils";
import { todayIdxOf } from "./state";
import type {
  ChecklistTemplate,
  ShiftInstance,
  TaskCompletion,
  TemplatePuesto,
  TemplateTask,
  WeeklyAssignment,
} from "@/lib/types";

/**
 * Context for the shared shift tablet (/turno). Two ways in, like the POS:
 *   · a paired device (cookie from the POS pairing) → its org + restaurant
 *   · a signed-in user → the first restaurant they can see
 * Either way the page and its actions run on the service-role client: the
 * tablet completes tasks *as* the person who tapped their name, which the
 * RLS (`completed_by = auth.uid()`) can't express. Authorization is the
 * device cookie or the user's visibility of the restaurant; every write
 * checks the row belongs to `restaurantId`.
 */
export type TurnoActor =
  | { kind: "device"; device: PosDevice }
  | { kind: "user"; profileId: string; fullName: string };

export type TurnoContext = {
  admin: SupabaseClient;
  organizationId: string;
  restaurantId: string;
  sede: { id: string; name: string; tz: string };
  actor: TurnoActor;
};

async function firstRestaurant(
  client: SupabaseClient,
  organizationId: string,
): Promise<{ id: string; name: string; tz: string } | null> {
  const { data } = await client
    .from("restaurants")
    .select("id, name, timezone")
    .eq("organization_id", organizationId)
    .order("name")
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, name: data.name as string, tz: (data.timezone as string) ?? "America/Bogota" } : null;
}

export async function loadTurnoContext(): Promise<TurnoContext | null> {
  const admin = createSupabaseAdminClient();
  const device = await getPosDeviceFromCookie();
  if (device) {
    let sede: { id: string; name: string; tz: string } | null = null;
    if (device.restaurantId) {
      const { data } = await admin
        .from("restaurants")
        .select("id, name, timezone")
        .eq("id", device.restaurantId)
        .maybeSingle();
      if (data) sede = { id: data.id as string, name: data.name as string, tz: (data.timezone as string) ?? "America/Bogota" };
    }
    sede ??= await firstRestaurant(admin, device.organizationId);
    if (!sede) return null;
    return { admin, organizationId: device.organizationId, restaurantId: sede.id, sede, actor: { kind: "device", device } };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) return null;
  // RLS client: only restaurants this user can see.
  const sede = await firstRestaurant(supabase, profile.organization_id as string);
  if (!sede) return null;
  return {
    admin,
    organizationId: profile.organization_id as string,
    restaurantId: sede.id,
    sede,
    actor: { kind: "user", profileId: profile.id as string, fullName: (profile.full_name as string | null) ?? "" },
  };
}

export async function requireTurnoContext(): Promise<TurnoContext> {
  const ctx = await loadTurnoContext();
  if (!ctx) throw new Error("unauthorized");
  return ctx;
}

export interface TurnoPerson {
  id: string;
  name: string;
  initials: string;
  role: "admin" | "staff";
}

/** Active roster of the sede plus the org's admins (the owner opens the shop). */
export async function listTurnoRoster(ctx: TurnoContext): Promise<TurnoPerson[]> {
  const [{ data: members }, { data: admins }] = await Promise.all([
    ctx.admin
      .from("restaurant_members")
      .select("active, profile:profiles!inner(id, full_name, role)")
      .eq("restaurant_id", ctx.restaurantId),
    ctx.admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", ctx.organizationId)
      .eq("role", "admin"),
  ]);
  const byId = new Map<string, TurnoPerson>();
  for (const m of members ?? []) {
    const r = m as unknown as { active: boolean; profile: { id: string; full_name: string | null; role: string | null } | null };
    if (!r.profile || r.active === false) continue;
    const name = r.profile.full_name ?? "—";
    byId.set(r.profile.id, { id: r.profile.id, name, initials: makeInitials(name), role: r.profile.role === "admin" ? "admin" : "staff" });
  }
  for (const a of admins ?? []) {
    if (byId.has(a.id as string)) continue;
    const name = (a.full_name as string | null) ?? "—";
    byId.set(a.id as string, { id: a.id as string, name, initials: makeInitials(name), role: "admin" });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** A person may act on the tablet only if they are on the sede roster or an org admin. */
export async function assertPersonOnRoster(ctx: TurnoContext, personId: string): Promise<void> {
  const roster = await listTurnoRoster(ctx);
  if (!roster.some((p) => p.id === personId)) throw new Error("Esa persona no está en el equipo de la sede.");
}

/**
 * Today's shift_instances for the sede's active turnos that operate today.
 * The nightly cron also creates them; this covers a tablet opened first.
 */
export async function ensureTodayInstances(ctx: TurnoContext, date: string): Promise<void> {
  const idx = todayIdxOf(date);
  const { data: tpls } = await ctx.admin
    .from("checklist_templates")
    .select("id, dias")
    .eq("restaurant_id", ctx.restaurantId)
    .eq("active", true);
  const rows = (tpls ?? [])
    .filter((t) => (Array.isArray(t.dias) ? (t.dias as boolean[])[idx] !== false : true))
    .map((t) => ({ restaurant_id: ctx.restaurantId, template_id: t.id as string, date }));
  if (!rows.length) return;
  const { error } = await ctx.admin
    .from("shift_instances")
    .upsert(rows, { onConflict: "restaurant_id,template_id,date", ignoreDuplicates: true });
  if (error) console.error("[turno] ensureTodayInstances failed:", error.message);
}

export type TurnoCompletion = TaskCompletion & { completed_by_name: string | null };

export interface TurnoShift {
  instance: ShiftInstance;
  template: ChecklistTemplate;
  tasks: TemplateTask[];
  puestos: TemplatePuesto[];
  completions: Record<string, TurnoCompletion>;
}

export interface TurnoBoardData {
  sede: { id: string; name: string; tz: string };
  date: string;
  todayIdx: number;
  roster: TurnoPerson[];
  assignments: WeeklyAssignment[];
  turnos: TurnoShift[];
}

/** Everything the tablet needs for today, in three round-trips. */
export async function getTurnoBoard(ctx: TurnoContext): Promise<TurnoBoardData> {
  const date = todayInTz(ctx.sede.tz);
  const todayIdx = todayIdxOf(date);
  const weekStart = isoMonday(date);

  const [{ data: instances }, roster, { data: asg }] = await Promise.all([
    ctx.admin
      .from("shift_instances")
      .select("*, template:checklist_templates!inner(*, template_tasks(*), template_puestos(*, puesto:puestos(*)))")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("date", date),
    listTurnoRoster(ctx),
    ctx.admin
      .from("weekly_assignments")
      .select("week_start, template_id, dia_idx, member_id, puesto_id")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("week_start", weekStart),
  ]);

  const rows = (instances ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r.id as string);
  const { data: comps } = ids.length
    ? await ctx.admin
        .from("task_completions")
        .select("*, who:profiles!task_completions_completed_by_fkey(full_name)")
        .in("shift_instance_id", ids)
    : { data: [] as Array<Record<string, unknown>> };
  const compsByShift = new Map<string, Record<string, TurnoCompletion>>();
  for (const c of (comps ?? []) as Array<Record<string, unknown>>) {
    const sid = c.shift_instance_id as string;
    const m = compsByShift.get(sid) ?? {};
    const who = c.who as { full_name: string | null } | { full_name: string | null }[] | null;
    m[c.template_task_id as string] = {
      id: c.id as string,
      shift_instance_id: sid,
      template_task_id: c.template_task_id as string,
      completed_by: c.completed_by as string,
      completed_at: c.completed_at as string,
      photo_url: (c.photo_url as string | null) ?? null,
      note: (c.note as string | null) ?? null,
      completed_by_name: (Array.isArray(who) ? who[0]?.full_name : who?.full_name) ?? null,
    };
    compsByShift.set(sid, m);
  }

  const turnos: TurnoShift[] = rows
    .map((r) => {
      const t = r.template as Record<string, unknown> | null;
      if (!t || t.active === false) return null;
      const tasks = ((t.template_tasks as TemplateTask[] | undefined) ?? [])
        .map((x) => ({ ...x, puesto_id: x.puesto_id ?? null }))
        .sort((a, b) => a.order_index - b.order_index);
      const { template: _t, ...instance } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
      return {
        instance: instance as unknown as ShiftInstance,
        template: {
          id: t.id as string,
          restaurant_id: t.restaurant_id as string,
          name: t.name as string,
          active: (t.active as boolean) ?? true,
          version: (t.version as number) ?? 1,
          inicio: ((t.inicio as string) ?? "").slice(0, 5),
          fin: ((t.fin as string) ?? "").slice(0, 5),
          dias: (t.dias as boolean[]) ?? [true, true, true, true, true, true, true],
        } as unknown as ChecklistTemplate,
        tasks,
        puestos: normalizeTemplatePuestoRows(t.template_puestos),
        completions: compsByShift.get(r.id as string) ?? {},
      };
    })
    .filter((x): x is TurnoShift => x !== null)
    .sort((a, b) => a.template.inicio.localeCompare(b.template.inicio));

  return {
    sede: ctx.sede,
    date,
    todayIdx,
    roster,
    assignments: (asg ?? []).map((a) => ({
      week_start: a.week_start as string,
      template_id: a.template_id as string,
      dia_idx: a.dia_idx as number,
      member_id: (a.member_id as string | null) ?? null,
      puesto_id: (a.puesto_id as string | null) ?? null,
    })),
    turnos,
  };
}
