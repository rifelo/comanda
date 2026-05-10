"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const SignUpSchema = SignInSchema.extend({
  full_name: z.string().min(1).max(100),
});

function safeNext(next: string | undefined) {
  // Only allow same-site relative redirects.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function signIn(formData: FormData, next?: string) {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Correo o contraseña inválidos." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Credenciales incorrectas." };

  redirect(safeNext(next));
}

/**
 * Sign up a new admin. The DB trigger creates an organization for them
 * automatically (handle_new_user). Subsequent staff are invited from the
 * admin dashboard, not via this endpoint.
 */
export async function signUpAdmin(formData: FormData, next?: string) {
  const parsed = SignUpSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Datos inválidos." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        role: "admin",
        // organization_id intentionally omitted -> trigger creates one.
      },
    },
  });
  if (error) return { error: error.message };

  // After sign-up, Supabase may require email confirmation. With confirmations
  // disabled (default in local dev), the user is signed in immediately.
  redirect(safeNext(next));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
