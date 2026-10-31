/**
 * How a person can sign in (single login, docs/redesign/PLAN.md §3): with a
 * password (needed for the team tiles on the shared tablet), with Google, or
 * both. Read from the auth user's `app_metadata.providers` ("email" = has a
 * password). Pure — tested in acceso.test.ts.
 */
export type Acceso = "ambos" | "password" | "google" | "ninguno";

export function accesoDe(providers: ReadonlyArray<string> | null | undefined): Acceso {
  const p = new Set(providers ?? []);
  const pw = p.has("email") || p.has("credential");
  const g = p.has("google");
  return pw && g ? "ambos" : pw ? "password" : g ? "google" : "ninguno";
}

export const ACCESO: Record<Acceso, { label: string; hint: string; tablet: boolean }> = {
  ambos: { label: "Contraseña y Google", hint: "Entra en la tablet con su contraseña y en su teléfono con Google.", tablet: true },
  password: { label: "Contraseña", hint: "Entra en la tablet y en su teléfono con correo y contraseña.", tablet: true },
  google: { label: "Sólo Google", hint: "En la tablet no puede entrar con su ficha: ponle una contraseña.", tablet: false },
  ninguno: { label: "Sin acceso", hint: "Todavía no puede entrar: ponle una contraseña.", tablet: false },
};

/** Minimum password length — same rule as the server action. */
export const PASSWORD_MIN = 8;

/** A readable starter password the owner can dictate («cafe-4821»). */
export function sugerirContrasena(rand: () => number = Math.random): string {
  const words = ["cafe", "payo", "latte", "mocca", "tinto", "barra", "taza", "grano"];
  const w = words[Math.floor(rand() * words.length) % words.length];
  const n = String(1000 + Math.floor(rand() * 9000)).slice(0, 4);
  return `${w}-${n}`;
}
