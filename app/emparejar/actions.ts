"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registerPosDevice } from "@/lib/pos/devices";

export type EmparejarState = { error: string } | null;

const Schema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().max(60).optional(),
});

/**
 * Pair this device (tablet / register PC) with a sede using a registration
 * code from Ajustes → Dispositivos. The code is the credential (no session
 * needed). On success the device cookie is set and the person picks who they
 * are on /login.
 */
export async function emparejarDispositivo(_prev: EmparejarState, formData: FormData): Promise<EmparejarState> {
  const parsed = Schema.safeParse({ code: formData.get("code") ?? "", name: formData.get("name") || undefined });
  if (!parsed.success) return { error: "Escribe el código de 8 caracteres." };
  const res = await registerPosDevice(parsed.data.code, parsed.data.name);
  if (!res.ok) return { error: res.error };
  // TODO(P3): revalidate /ajustes/dispositivos too once it exists.
  revalidatePath("/configuracion/pos");
  redirect("/login");
}
