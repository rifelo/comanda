import { redirect } from "next/navigation";

/** «Mis tareas de hoy» is now the team app's Tareas tab (PLAN §2.4). */
export default function Page() {
  redirect("/turno/tareas");
}
