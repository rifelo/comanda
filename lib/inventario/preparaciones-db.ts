/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { costoPorUnidad, type LineaPreparacion } from "./preparaciones";

type Db = SupabaseClient<any>;

export interface Preparacion {
  id: string;
  name: string;
  unit: string;
  rinde: number;
  costo: number;
  stock: number;
  lineas: LineaPreparacion[];
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/** Every active preparación with the ingredients of one batch, by name. */
export async function listPreparaciones(db: Db, orgId: string): Promise<Preparacion[]> {
  const { data: preps, error } = await db
    .from("ingredientes")
    .select("id, name, unit, rinde, cost_cop, stock_current")
    .eq("organization_id", orgId)
    .eq("archived", false)
    .not("rinde", "is", null)
    .order("name");
  if (error) {
    console.error("[preparaciones] list", error);
    return [];
  }
  if (!preps?.length) return [];
  const { data: items } = await db
    .from("preparacion_items")
    .select("preparacion_id, ingrediente_id, qty, position, ing:ingredientes!preparacion_items_ingrediente_id_fkey(name, unit, cost_cop)")
    .eq("organization_id", orgId)
    .in("preparacion_id", preps.map((p) => p.id as string))
    .order("position");
  const by = new Map<string, LineaPreparacion[]>();
  for (const r of (items ?? []) as any[]) {
    const ing = one(r.ing) as { name: string; unit: string; cost_cop: number } | null;
    const list = by.get(r.preparacion_id) ?? [];
    list.push({ ingredienteId: r.ingrediente_id, name: ing?.name ?? "—", unit: ing?.unit ?? "", qty: Number(r.qty), costo: Number(ing?.cost_cop ?? 0) });
    by.set(r.preparacion_id, list);
  }
  return preps.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    unit: p.unit as string,
    rinde: Number(p.rinde),
    costo: Number(p.cost_cop),
    stock: Number(p.stock_current),
    lineas: by.get(p.id as string) ?? [],
  }));
}

export interface TandaRow {
  id: string;
  preparacionId: string;
  nombre: string;
  unit: string;
  tandas: number;
  cantidad: number;
  costo: number;
  quien: string | null;
  at: string;
}

/** Batches made since `desde` (ISO), newest first. */
export async function listTandas(db: Db, orgId: string, desde: string, limit = 100): Promise<TandaRow[]> {
  const { data, error } = await db
    .from("preparacion_tandas")
    .select("id, preparacion_id, tandas, cantidad, costo_cop, created_at, prep:ingredientes(name, unit), who:profiles(full_name)")
    .eq("organization_id", orgId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[preparaciones] tandas", error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => {
    const prep = one(r.prep) as { name: string; unit: string } | null;
    const who = one(r.who) as { full_name: string | null } | null;
    return {
      id: r.id,
      preparacionId: r.preparacion_id,
      nombre: prep?.name ?? "—",
      unit: prep?.unit ?? "",
      tandas: Number(r.tandas),
      cantidad: Number(r.cantidad),
      costo: Number(r.costo_cop),
      quien: who?.full_name ?? null,
      at: r.created_at,
    };
  });
}

/** Re-price a preparación from its ingredients' current cost. Returns the new cost per unit, or null when it isn't one. */
export async function recostearPreparacion(db: Db, orgId: string, prepId: string): Promise<number | null> {
  const { data: prep } = await db.from("ingredientes").select("rinde").eq("organization_id", orgId).eq("id", prepId).maybeSingle();
  const rinde = prep?.rinde == null ? null : Number(prep.rinde);
  if (!rinde) return null;
  const { data: items } = await db
    .from("preparacion_items")
    .select("qty, ing:ingredientes!preparacion_items_ingrediente_id_fkey(cost_cop)")
    .eq("organization_id", orgId)
    .eq("preparacion_id", prepId);
  const costo = costoPorUnidad(
    ((items ?? []) as any[]).map((r) => ({ qty: Number(r.qty), costo: Number((one(r.ing) as { cost_cop: number } | null)?.cost_cop ?? 0) })),
    rinde,
  );
  await db.from("ingredientes").update({ cost_cop: costo }).eq("organization_id", orgId).eq("id", prepId);
  return costo;
}

/** Preparaciones that use an ingredient (to re-price them when its cost changes). */
export async function preparacionesQueUsan(db: Db, orgId: string, ingredienteId: string): Promise<string[]> {
  const { data } = await db.from("preparacion_items").select("preparacion_id").eq("organization_id", orgId).eq("ingrediente_id", ingredienteId);
  return [...new Set(((data ?? []) as { preparacion_id: string }[]).map((r) => r.preparacion_id))];
}
