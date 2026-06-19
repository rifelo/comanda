"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";

// `"use server"` files can only export async functions in Next 16 — see the
// note in `app/(admin)/restaurants/new/actions.ts`. Result shapes are
// documented inline.
//   type CreateCategoriaResult = { ok: boolean; id?: string; error?: string }
//   type DeleteCategoriaResult = { ok: boolean; error?: string }
//   type CreateProductoResult  = { ok: boolean; id?: string; warning?: string; error?: string; fieldErrors?: Record<string, string> }
//   type UpdateProductoResult  = { ok: boolean; id?: string; warning?: string; error?: string; fieldErrors?: Record<string, string> }
//   type DeleteProductoResult  = { ok: boolean; error?: string }
//   type ToggleFavoriteResult  = { ok: boolean; error?: string }

// =============================================================================
// Categorías
// =============================================================================

const CategoriaSchema = z.object({
  label: z.string().min(1).max(80),
  parent_id: z.string().uuid().nullable(),
});

export async function createProductoCategoria(
  _prev: { ok: boolean; id?: string; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const rawParent = formData.get("parent_id");
  const parsed = CategoriaSchema.safeParse({
    label: formData.get("label"),
    parent_id: rawParent && rawParent !== "" ? rawParent : null,
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Revisa los campos." };
  }

  const { profile, supabase } = await requireAdmin();

  // Reject parent_ids belonging to a different org. RLS would block the
  // insert anyway, but the user-visible error is clearer this way.
  if (parsed.data.parent_id) {
    const { data: parent } = await supabase
      .from("producto_categorias")
      .select("id")
      .eq("id", parsed.data.parent_id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (!parent) {
      return { ok: false, error: "La categoría padre no existe." };
    }
  }

  // Append to end of sibling list. Two-row race is harmless — both rows
  // would land on the same position; the rail orders by `position` then
  // id, so the newer one tail-ends visually.
  const positionQuery = supabase
    .from("producto_categorias")
    .select("position")
    .eq("organization_id", profile.organization_id);
  const siblingQuery =
    parsed.data.parent_id === null
      ? positionQuery.is("parent_id", null)
      : positionQuery.eq("parent_id", parsed.data.parent_id);
  const { data: maxRow } = await siblingQuery
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { data: row, error: insertErr } = await supabase
    .from("producto_categorias")
    .insert({
      organization_id: profile.organization_id,
      parent_id: parsed.data.parent_id,
      label: parsed.data.label,
      position: nextPosition,
    })
    .select()
    .single();

  if (insertErr || !row) {
    // Unique sibling-label constraint trips here.
    const isDup = insertErr?.code === "23505";
    console.error("[createProductoCategoria] insert failed:", insertErr);
    return {
      ok: false,
      error: isDup
        ? "Ya existe una categoría con ese nombre en este nivel."
        : (insertErr?.message ?? "No se pudo crear la categoría."),
    };
  }

  revalidatePath("/catalogo");
  return { ok: true, id: row.id };
}

const DeleteCategoriaSchema = z.object({ id: z.string().uuid() });

/**
 * Hard-delete a categoría. Cascade behaviour is handled by the schema
 * (migration 0005):
 *   - `producto_categorias.parent_id` is `on delete cascade` → descendant
 *     categorías go with the parent.
 *   - `productos.category_id` is `on delete set null` → productos under
 *     the removed subtree become uncategorized rather than vanishing.
 *
 * We pre-check that the row belongs to the caller's org so RLS doesn't
 * silently swallow the delete; otherwise the UI would show a fake
 * "success" while nothing changed.
 */
export async function deleteProductoCategoria(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = DeleteCategoriaSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: "Categoría inválida." };
  }

  const { profile, supabase } = await requireAdmin();

  // RLS would block the delete silently if the row is from another org;
  // surface the same friendly message createProductoCategoria uses.
  const { data: existing } = await supabase
    .from("producto_categorias")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "La categoría no existe." };
  }

  const { error: deleteErr } = await supabase
    .from("producto_categorias")
    .delete()
    .eq("id", parsed.data.id);

  if (deleteErr) {
    console.error("[deleteProductoCategoria] delete failed:", deleteErr);
    return {
      ok: false,
      error: deleteErr.message ?? "No se pudo eliminar la categoría.",
    };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

// =============================================================================
// Productos
// =============================================================================

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

const ProductoSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullable(),
  sku: z.string().min(1).max(60),
  category_id: z.string().uuid().nullable(),
  price_cop: z.coerce.number().int().min(0),
  cost_cop: z.coerce.number().int().min(0),
  stock_status: z.enum(["ok", "bajo", "sin"]),
});

export async function createProducto(
  _prev: {
    ok: boolean;
    id?: string;
    warning?: string;
    error?: string;
    fieldErrors?: Record<string, string>;
  } | null,
  formData: FormData,
): Promise<{
  ok: boolean;
  id?: string;
  warning?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  const rawCategory = formData.get("category_id");
  const rawDescription = formData.get("description");
  const parsed = ProductoSchema.safeParse({
    name: formData.get("name"),
    description:
      typeof rawDescription === "string" && rawDescription.trim() !== ""
        ? rawDescription.trim()
        : null,
    sku: formData.get("sku"),
    category_id:
      rawCategory && rawCategory !== "" ? rawCategory : null,
    price_cop: formData.get("price_cop"),
    cost_cop: formData.get("cost_cop"),
    stock_status: formData.get("stock_status"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Datos inválidos. Revisa los campos marcados.",
      fieldErrors,
    };
  }

  const { profile, supabase } = await requireAdmin();

  // Same defence as categorías: bounce category_ids from another org
  // with a friendly message instead of letting RLS surface as a generic
  // 23503 FK violation.
  if (parsed.data.category_id) {
    const { data: cat } = await supabase
      .from("producto_categorias")
      .select("id")
      .eq("id", parsed.data.category_id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (!cat) {
      return {
        ok: false,
        error: "La categoría seleccionada no existe.",
        fieldErrors: { category_id: "Categoría no encontrada." },
      };
    }
  }

  const sku = parsed.data.sku.trim().toUpperCase();

  const { data: producto, error: insertErr } = await supabase
    .from("productos")
    .insert({
      organization_id: profile.organization_id,
      category_id: parsed.data.category_id,
      name: parsed.data.name.trim(),
      description: parsed.data.description,
      sku,
      price_cop: parsed.data.price_cop,
      cost_cop: parsed.data.cost_cop,
      stock_status: parsed.data.stock_status,
    })
    .select("id")
    .single();

  if (insertErr || !producto) {
    const isDup = insertErr?.code === "23505";
    console.error("[createProducto] insert failed:", insertErr);
    return {
      ok: false,
      error: isDup
        ? "Ya existe un producto con ese SKU."
        : (insertErr?.message ?? "No se pudo crear el producto."),
      ...(isDup ? { fieldErrors: { sku: "SKU ya usado." } } : {}),
    };
  }

  // ── Optional image upload ──────────────────────────────────────────
  // Two-phase by design: producto row exists even if the upload fails,
  // so the user keeps their typed data and can edit the row later.
  const imageEntry = formData.get("image");
  let uploadWarning: string | undefined;

  if (imageEntry instanceof File && imageEntry.size > 0) {
    if (imageEntry.size > MAX_IMAGE_BYTES) {
      uploadWarning =
        "Producto creado, pero la foto supera 2 MB y no se subió.";
    } else if (
      !ALLOWED_IMAGE_TYPES.includes(
        imageEntry.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      )
    ) {
      uploadWarning =
        "Producto creado, pero el formato de la foto no es JPG ni PNG.";
    } else {
      const ext = imageEntry.type === "image/png" ? "png" : "jpg";
      const path = `${profile.organization_id}/${producto.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("producto-photos")
        .upload(path, imageEntry, {
          upsert: true,
          contentType: imageEntry.type,
        });
      if (uploadErr) {
        console.error("[createProducto] upload failed:", uploadErr);
        uploadWarning =
          "Producto creado, pero la foto no se pudo subir. Intenta de nuevo desde edición.";
      } else {
        const { data: pub } = supabase.storage
          .from("producto-photos")
          .getPublicUrl(path);
        const publicUrl = pub.publicUrl;
        const { error: updateErr } = await supabase
          .from("productos")
          .update({ image_url: publicUrl })
          .eq("id", producto.id);
        if (updateErr) {
          console.error(
            "[createProducto] image_url update failed:",
            updateErr,
          );
          uploadWarning =
            "Producto creado y foto subida, pero no se enlazó la URL.";
        }
      }
    }
  }

  revalidatePath("/catalogo");

  return {
    ok: true,
    id: producto.id,
    ...(uploadWarning ? { warning: uploadWarning } : {}),
  };
}

const UpdateProductoSchema = ProductoSchema.extend({
  id: z.string().uuid(),
});

export async function updateProducto(
  _prev: {
    ok: boolean;
    id?: string;
    warning?: string;
    error?: string;
    fieldErrors?: Record<string, string>;
  } | null,
  formData: FormData,
): Promise<{
  ok: boolean;
  id?: string;
  warning?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  const rawCategory = formData.get("category_id");
  const rawDescription = formData.get("description");
  const parsed = UpdateProductoSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description:
      typeof rawDescription === "string" && rawDescription.trim() !== ""
        ? rawDescription.trim()
        : null,
    sku: formData.get("sku"),
    category_id:
      rawCategory && rawCategory !== "" ? rawCategory : null,
    price_cop: formData.get("price_cop"),
    cost_cop: formData.get("cost_cop"),
    stock_status: formData.get("stock_status"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Datos inválidos. Revisa los campos marcados.",
      fieldErrors,
    };
  }

  const { profile, supabase } = await requireAdmin();

  // Bounce ids from another org with a clear message rather than letting
  // RLS swallow the update silently (zero affected rows would look like
  // success).
  const { data: existing } = await supabase
    .from("productos")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "El producto no existe." };
  }

  if (parsed.data.category_id) {
    const { data: cat } = await supabase
      .from("producto_categorias")
      .select("id")
      .eq("id", parsed.data.category_id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (!cat) {
      return {
        ok: false,
        error: "La categoría seleccionada no existe.",
        fieldErrors: { category_id: "Categoría no encontrada." },
      };
    }
  }

  const sku = parsed.data.sku.trim().toUpperCase();

  // margin_pct is a generated column — recomputed by Postgres from
  // price_cop/cost_cop, so we explicitly omit it from the update payload.
  const { error: updateErr } = await supabase
    .from("productos")
    .update({
      category_id: parsed.data.category_id,
      name: parsed.data.name.trim(),
      description: parsed.data.description,
      sku,
      price_cop: parsed.data.price_cop,
      cost_cop: parsed.data.cost_cop,
      stock_status: parsed.data.stock_status,
    })
    .eq("id", parsed.data.id);

  if (updateErr) {
    const isDup = updateErr.code === "23505";
    console.error("[updateProducto] update failed:", updateErr);
    return {
      ok: false,
      error: isDup
        ? "Ya existe un producto con ese SKU."
        : (updateErr.message ?? "No se pudo actualizar el producto."),
      ...(isDup ? { fieldErrors: { sku: "SKU ya usado." } } : {}),
    };
  }

  // ── Optional image upload (same two-phase contract as create) ─────────
  const imageEntry = formData.get("image");
  let uploadWarning: string | undefined;

  if (imageEntry instanceof File && imageEntry.size > 0) {
    if (imageEntry.size > MAX_IMAGE_BYTES) {
      uploadWarning =
        "Producto actualizado, pero la foto supera 2 MB y no se subió.";
    } else if (
      !ALLOWED_IMAGE_TYPES.includes(
        imageEntry.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      )
    ) {
      uploadWarning =
        "Producto actualizado, pero el formato de la foto no es JPG ni PNG.";
    } else {
      const ext = imageEntry.type === "image/png" ? "png" : "jpg";
      const path = `${profile.organization_id}/${parsed.data.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("producto-photos")
        .upload(path, imageEntry, {
          upsert: true,
          contentType: imageEntry.type,
        });
      if (uploadErr) {
        console.error("[updateProducto] upload failed:", uploadErr);
        uploadWarning =
          "Producto actualizado, pero la foto no se pudo subir. Intenta de nuevo desde edición.";
      } else {
        const { data: pub } = supabase.storage
          .from("producto-photos")
          .getPublicUrl(path);
        const publicUrl = pub.publicUrl;
        const { error: linkErr } = await supabase
          .from("productos")
          .update({ image_url: publicUrl })
          .eq("id", parsed.data.id);
        if (linkErr) {
          console.error(
            "[updateProducto] image_url update failed:",
            linkErr,
          );
          uploadWarning =
            "Producto actualizado y foto subida, pero no se enlazó la URL.";
        }
      }
    }
  }

  revalidatePath("/catalogo");

  return {
    ok: true,
    id: parsed.data.id,
    ...(uploadWarning ? { warning: uploadWarning } : {}),
  };
}

// =============================================================================
// Delete producto
// =============================================================================

const DeleteProductoSchema = z.object({ id: z.string().uuid() });

/**
 * Hard-delete a producto. Cascades handled by the schema:
 *   - `producto_favorites.producto_id` is `on delete cascade` → users'
 *     stars for this producto are auto-removed.
 *
 * Best-effort image cleanup: if the row had an `image_url`, parse the
 * storage path out and remove it from the bucket. Storage failure is
 * logged but doesn't fail the request — the row is already gone.
 */
export async function deleteProducto(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = DeleteProductoSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: "Producto inválido." };
  }

  const { profile, supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("productos")
    .select("id, image_url")
    .eq("id", parsed.data.id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "El producto no existe." };
  }

  const { error: deleteErr } = await supabase
    .from("productos")
    .delete()
    .eq("id", parsed.data.id);

  if (deleteErr) {
    console.error("[deleteProducto] delete failed:", deleteErr);
    return {
      ok: false,
      error: deleteErr.message ?? "No se pudo eliminar el producto.",
    };
  }

  if (existing.image_url) {
    // Public URL shape: https://<host>/storage/v1/object/public/producto-photos/<path>
    const m = existing.image_url.match(/\/producto-photos\/(.+)$/);
    if (m) {
      const { error: rmErr } = await supabase.storage
        .from("producto-photos")
        .remove([m[1]]);
      if (rmErr) {
        console.warn(
          "[deleteProducto] image remove failed (row already deleted):",
          rmErr,
        );
      }
    }
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

// =============================================================================
// Favoritos (per-user)
// =============================================================================

const FavoriteIdSchema = z.string().uuid();

/**
 * Toggle a producto in the current user's `producto_favorites`.
 * Uses `requireUser` (not admin) because favorites are per-user and any
 * authenticated org member should be able to star products for themselves.
 *
 * `next === true`  → upsert (composite PK makes double-click a no-op).
 * `next === false` → delete (filtered on user_id for defence-in-depth;
 *                   RLS already enforces it).
 *
 * The producto's visibility to the caller is enforced by the FK constraint
 * + productos RLS: inserting a producto_id that the caller can't see would
 * fail the FK lookup under their role. We surface that as a friendly error.
 */
export async function toggleProductoFavorite(
  producto_id: string,
  next: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = FavoriteIdSchema.safeParse(producto_id);
  if (!parsed.success) {
    return { ok: false, error: "Producto inválido." };
  }

  const { user, supabase } = await requireUser();

  if (next) {
    const { error } = await supabase
      .from("producto_favorites")
      .upsert(
        { user_id: user.id, producto_id: parsed.data },
        { onConflict: "user_id,producto_id" },
      );
    if (error) {
      console.error("[toggleProductoFavorite] insert failed:", error);
      // 23503 = FK violation → producto doesn't exist or isn't visible.
      if (error.code === "23503") {
        return { ok: false, error: "El producto no existe." };
      }
      return { ok: false, error: "No se pudo marcar como favorito." };
    }
  } else {
    const { error } = await supabase
      .from("producto_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("producto_id", parsed.data);
    if (error) {
      console.error("[toggleProductoFavorite] delete failed:", error);
      return { ok: false, error: "No se pudo quitar de favoritos." };
    }
  }

  revalidatePath("/catalogo");
  return { ok: true };
}
