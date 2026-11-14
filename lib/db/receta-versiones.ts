import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeProductoCost } from "./recetas";

/**
 * Versiones de receta (0088). The recipe IN USE always lives in receta_items
 * + productos.capas / referencia_visual / price_cop — everything else in the
 * app reads it there. A version is a full snapshot; switching saves the live
 * recipe into the version in use (a «v1» is created the first time) and
 * copies the chosen one into the live tables.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped client, as elsewhere in lib/db
type Db = SupabaseClient<any>;

export interface VersionItem {
  ingrediente_id: string;
  qty: number;
  unit: string | null;
  note: string | null;
  position: number;
}
export interface RecetaVersion {
  id: string;
  nombre: string;
  items: VersionItem[];
  capas: unknown;
  referencia_visual: string | null;
  price_cop: number | null;
  nota: string | null;
  updated_at: string;
}

const COLS = "id, nombre, items, capas, referencia_visual, price_cop, nota, updated_at";

export async function listVersiones(db: Db, orgId: string, productoId: string): Promise<RecetaVersion[]> {
  const { data } = await db.from("receta_versiones").select(COLS).eq("organization_id", orgId).eq("producto_id", productoId).order("created_at");
  return (data ?? []).map((v) => ({
    id: v.id as string,
    nombre: v.nombre as string,
    items: (Array.isArray(v.items) ? v.items : []) as VersionItem[],
    capas: v.capas ?? null,
    referencia_visual: (v.referencia_visual as string | null) ?? null,
    price_cop: v.price_cop == null ? null : Number(v.price_cop),
    nota: (v.nota as string | null) ?? null,
    updated_at: v.updated_at as string,
  }));
}

/** The live recipe as a snapshot. */
export async function recetaEnUso(db: Db, orgId: string, productoId: string) {
  const [{ data: items }, { data: p }] = await Promise.all([
    db.from("receta_items").select("ingrediente_id, qty, unit, note, position").eq("organization_id", orgId).eq("producto_id", productoId).order("position"),
    db.from("productos").select("capas, referencia_visual, price_cop, receta_version_id").eq("organization_id", orgId).eq("id", productoId).maybeSingle(),
  ]);
  if (!p) return null;
  return {
    items: (items ?? []).map((i, n) => ({
      ingrediente_id: i.ingrediente_id as string,
      qty: Number(i.qty),
      unit: (i.unit as string | null) ?? null,
      note: (i.note as string | null) ?? null,
      position: Number(i.position ?? n),
    })) as VersionItem[],
    capas: p.capas ?? null,
    referencia_visual: (p.referencia_visual as string | null) ?? null,
    price_cop: Number(p.price_cop ?? 0),
    versionId: (p.receta_version_id as string | null) ?? null,
  };
}

/**
 * Saves the live recipe into the version in use; with none yet, creates
 * `nombreSiNoHay` («v1») and marks it in use. Returns that version's id.
 */
export async function guardarEnVersionActual(db: Db, orgId: string, productoId: string, nombreSiNoHay = "v1"): Promise<string> {
  const vivo = await recetaEnUso(db, orgId, productoId);
  if (!vivo) throw new Error("Producto no encontrado.");
  const foto = { items: vivo.items, capas: vivo.capas, referencia_visual: vivo.referencia_visual, price_cop: vivo.price_cop, updated_at: new Date().toISOString() };
  if (vivo.versionId) {
    const { error } = await db.from("receta_versiones").update(foto).eq("id", vivo.versionId).eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return vivo.versionId;
  }
  const { data, error } = await db
    .from("receta_versiones")
    .insert({ organization_id: orgId, producto_id: productoId, nombre: nombreSiNoHay, ...foto })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar la versión.");
  const { error: e2 } = await db.from("productos").update({ receta_version_id: data.id }).eq("id", productoId).eq("organization_id", orgId);
  if (e2) throw new Error(e2.message);
  return data.id as string;
}

/** Puts `versionId` in use: the live recipe is saved first, then replaced. */
export async function usarVersion(db: Db, orgId: string, productoId: string, versionId: string): Promise<void> {
  const { data: v } = await db.from("receta_versiones").select(COLS).eq("organization_id", orgId).eq("producto_id", productoId).eq("id", versionId).maybeSingle();
  if (!v) throw new Error("Versión no encontrada.");
  const actual = await guardarEnVersionActual(db, orgId, productoId);
  if (actual === versionId) return;
  const items = (Array.isArray(v.items) ? v.items : []) as VersionItem[];

  const { error: del } = await db.from("receta_items").delete().eq("organization_id", orgId).eq("producto_id", productoId);
  if (del) throw new Error(del.message);
  if (items.length) {
    const { error } = await db.from("receta_items").insert(
      items.map((i, n) => ({ organization_id: orgId, producto_id: productoId, ingrediente_id: i.ingrediente_id, qty: i.qty, unit: i.unit, note: i.note, position: i.position ?? n })),
    );
    if (error) throw new Error(error.message);
  }
  const { error: up } = await db
    .from("productos")
    .update({
      receta_version_id: versionId,
      capas: v.capas ?? null,
      referencia_visual: (v.referencia_visual as string | null) ?? null,
      ...(v.price_cop != null ? { price_cop: Number(v.price_cop) } : {}),
    })
    .eq("id", productoId)
    .eq("organization_id", orgId);
  if (up) throw new Error(up.message);
  await recomputeProductoCost(db, orgId, productoId);
}

/** A new version, copied from the recipe in use (which is saved as «v1» if it had none). */
export async function nuevaVersion(db: Db, orgId: string, productoId: string, nombre: string): Promise<string> {
  await guardarEnVersionActual(db, orgId, productoId);
  const vivo = await recetaEnUso(db, orgId, productoId);
  if (!vivo) throw new Error("Producto no encontrado.");
  const { data, error } = await db
    .from("receta_versiones")
    .insert({ organization_id: orgId, producto_id: productoId, nombre, items: vivo.items, capas: vivo.capas, referencia_visual: vivo.referencia_visual, price_cop: vivo.price_cop })
    .select("id")
    .single();
  if (error || !data) throw new Error(/duplicate|unique/i.test(error?.message ?? "") ? `Ya hay una versión «${nombre}».` : error?.message ?? "No se pudo crear la versión.");
  return data.id as string;
}
